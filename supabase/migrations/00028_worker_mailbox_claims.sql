-- Distributed mailbox leases and incremental IMAP folder cursors.

ALTER TABLE public.mailboxes
  ADD COLUMN IF NOT EXISTS sync_worker_id uuid,
  ADD COLUMN IF NOT EXISTS sync_lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS sync_started_at timestamptz;

ALTER TABLE public.mailbox_folders
  ADD COLUMN IF NOT EXISTS uid_validity bigint,
  ADD COLUMN IF NOT EXISTS last_seen_uid bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_successful_sync_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS mailbox_folders_mailbox_name_unique
  ON public.mailbox_folders (mailbox_id, imap_folder_name);

CREATE OR REPLACE FUNCTION public.claim_mailboxes(
  p_worker_id uuid,
  p_limit integer DEFAULT 5,
  p_lease_seconds integer DEFAULT 300
)
RETURNS SETOF public.mailboxes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT id
    FROM public.mailboxes
    WHERE credential_vault_ref IS NOT NULL
      AND (
        sync_status IN ('pending', 'error')
        OR (sync_status = 'syncing' AND sync_lease_until < now())
      )
    ORDER BY last_synced_at NULLS FIRST, created_at
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 5), 25))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.mailboxes AS mailbox
  SET sync_status = 'syncing',
      sync_worker_id = p_worker_id,
      sync_started_at = now(),
      sync_lease_until = now() + make_interval(secs => GREATEST(60, p_lease_seconds)),
      last_error = NULL
  FROM claimed
  WHERE mailbox.id = claimed.id
  RETURNING mailbox.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_mailboxes(uuid, integer, integer)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mailboxes(uuid, integer, integer)
  TO service_role;
