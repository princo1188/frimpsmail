-- Cross-process outbound queue reservation and tenant-scoped private storage.

ALTER TABLE public.outbound_messages
  ADD COLUMN IF NOT EXISTS locked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_outbound_messages_pending_created
  ON public.outbound_messages (created_at)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.claim_outbound_messages(p_limit integer DEFAULT 10)
RETURNS SETOF public.outbound_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH selected AS (
    SELECT id
    FROM public.outbound_messages
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10), 100))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.outbound_messages AS outbound
  SET status = 'sending',
      locked_at = now(),
      updated_at = now()
  FROM selected
  WHERE outbound.id = selected.id
  RETURNING outbound.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_outbound_messages(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_outbound_messages(integer) TO service_role;

-- Existing projects already ran migration 00001, so replace its broad policies.
DROP POLICY IF EXISTS "attachments_auth_select" ON storage.objects;
DROP POLICY IF EXISTS "attachments_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "attachments_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "attachments_auth_delete" ON storage.objects;

CREATE POLICY "attachments_auth_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (
      ((storage.foldername(name))[1] = 'attachments' AND EXISTS (
        SELECT 1 FROM public.mailboxes
        WHERE mailboxes.id::text = (storage.foldername(name))[2]
          AND mailboxes.id IN (SELECT public.get_my_mailbox_ids())
      ))
      OR ((storage.foldername(name))[1] = 'calendar-attachments' AND EXISTS (
        SELECT 1 FROM public.calendar_events
        WHERE calendar_events.id::text = (storage.foldername(name))[2]
          AND calendar_events.organization_id = public.get_my_organization_id()
      ))
    )
  );

CREATE POLICY "attachments_auth_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'attachments'
    AND (
      ((storage.foldername(name))[1] = 'attachments' AND EXISTS (
        SELECT 1 FROM public.mailboxes
        WHERE mailboxes.id::text = (storage.foldername(name))[2]
          AND mailboxes.id IN (SELECT public.get_my_mailbox_ids())
      ))
      OR ((storage.foldername(name))[1] = 'calendar-attachments' AND EXISTS (
        SELECT 1 FROM public.calendar_events
        WHERE calendar_events.id::text = (storage.foldername(name))[2]
          AND calendar_events.organization_id = public.get_my_organization_id()
      ))
    )
  );

CREATE POLICY "attachments_auth_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = 'attachments' AND EXISTS (
    SELECT 1 FROM public.mailboxes WHERE mailboxes.id::text = (storage.foldername(name))[2]
      AND mailboxes.id IN (SELECT public.get_my_mailbox_ids())
  ));

CREATE POLICY "attachments_auth_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'attachments' AND (
    ((storage.foldername(name))[1] = 'attachments' AND EXISTS (
      SELECT 1 FROM public.mailboxes WHERE mailboxes.id::text = (storage.foldername(name))[2]
        AND mailboxes.id IN (SELECT public.get_my_mailbox_ids())
    ))
    OR ((storage.foldername(name))[1] = 'calendar-attachments' AND EXISTS (
      SELECT 1 FROM public.calendar_events WHERE calendar_events.id::text = (storage.foldername(name))[2]
        AND calendar_events.organization_id = public.get_my_organization_id()
    ))
  ));
