-- Retryable outbound jobs and database-enforced resource booking integrity.

ALTER TABLE public.outbound_messages
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;

CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE public.resource_bookings
  ADD CONSTRAINT resource_bookings_valid_interval CHECK (end_at > start_at),
  ADD CONSTRAINT resource_bookings_no_overlap
  EXCLUDE USING gist (resource_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&);

CREATE OR REPLACE FUNCTION public.claim_outbound_messages(p_limit integer DEFAULT 10)
RETURNS SETOF public.outbound_messages
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH selected AS (
    SELECT id FROM public.outbound_messages
    WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= now())
    ORDER BY created_at ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10), 100))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.outbound_messages AS outbound
  SET status = 'sending', locked_at = now(), last_attempt_at = now(),
      attempt_count = outbound.attempt_count + 1, updated_at = now()
  FROM selected WHERE outbound.id = selected.id
  RETURNING outbound.*;
END;
$$;
