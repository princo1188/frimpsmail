-- Ensure neither direct table writes nor the edge function can make the
-- service-role worker fetch an attachment from another mailbox.
CREATE OR REPLACE FUNCTION public.validate_outbound_attachment_paths()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  attachment jsonb;
  attachment_path text;
BEGIN
  IF jsonb_typeof(COALESCE(NEW.attachments_json, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'attachments_json must be an array';
  END IF;

  FOR attachment IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.attachments_json, '[]'::jsonb))
  LOOP
    attachment_path := attachment->>'path';
    IF attachment_path IS NULL
      OR attachment_path NOT LIKE 'attachments/' || NEW.mailbox_id::text || '/compose/%' THEN
      RAISE EXCEPTION 'attachment path must belong to the sending mailbox compose area';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_outbound_message_attachments ON public.outbound_messages;
CREATE TRIGGER validate_outbound_message_attachments
  BEFORE INSERT OR UPDATE OF mailbox_id, attachments_json ON public.outbound_messages
  FOR EACH ROW EXECUTE FUNCTION public.validate_outbound_attachment_paths();

DROP TRIGGER IF EXISTS validate_scheduled_message_attachments ON public.scheduled_messages;
CREATE TRIGGER validate_scheduled_message_attachments
  BEFORE INSERT OR UPDATE OF mailbox_id, attachments_json ON public.scheduled_messages
  FOR EACH ROW EXECUTE FUNCTION public.validate_outbound_attachment_paths();

-- A single grouped query replaces three exact-count queries for every mailbox.
CREATE OR REPLACE FUNCTION public.get_admin_mailbox_message_counts(
  p_organization_id uuid,
  p_since timestamptz
)
RETURNS TABLE (
  mailbox_id uuid,
  total_messages bigint,
  unread_messages bigint,
  today_messages bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    mailbox.id,
    count(message.id) AS total_messages,
    count(message.id) FILTER (WHERE message.is_read = false) AS unread_messages,
    count(message.id) FILTER (WHERE message.sent_at >= p_since) AS today_messages
  FROM public.mailboxes AS mailbox
  LEFT JOIN public.messages AS message ON message.mailbox_id = mailbox.id
  WHERE mailbox.organization_id = p_organization_id
    AND EXISTS (
      SELECT 1
      FROM public.staff_users AS caller
      WHERE caller.id = auth.uid()
        AND caller.organization_id = p_organization_id
        AND caller.role = 'admin'
    )
  GROUP BY mailbox.id;
$$;

REVOKE ALL ON FUNCTION public.get_admin_mailbox_message_counts(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_mailbox_message_counts(uuid, timestamptz) TO authenticated;
