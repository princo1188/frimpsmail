-- Mail operations integrity: local drafts, scheduled send metadata and follow-up idempotency.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;

-- The compose UI and scheduler both support BCC and replies.  The original
-- scheduled_messages table pre-dated those fields, which caused scheduled sends
-- to fail at runtime.
ALTER TABLE public.scheduled_messages
  ADD COLUMN IF NOT EXISTS bcc_addresses text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reply_to_message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL;

-- setFollowUp uses an upsert keyed by thread and user.  Make that contract real
-- in the database so repeated edits update one reminder instead of duplicating it.
CREATE UNIQUE INDEX IF NOT EXISTS follow_up_reminders_thread_staff_unique
  ON public.follow_up_reminders (thread_id, staff_user_id);

CREATE INDEX IF NOT EXISTS idx_messages_drafts
  ON public.messages (mailbox_id, is_draft)
  WHERE is_draft;

-- Resource overlays and the standalone schedule subscribe to these tables.
ALTER PUBLICATION supabase_realtime ADD TABLE public.resources;
ALTER PUBLICATION supabase_realtime ADD TABLE public.resource_bookings;
