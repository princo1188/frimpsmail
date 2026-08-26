-- Support mailbox list/unread-counter and scheduled-send worker queries.
CREATE INDEX IF NOT EXISTS idx_threads_mailbox_folder_last_message
  ON public.threads (mailbox_id, folder_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_threads_mailbox_unread_folder
  ON public.threads (mailbox_id, folder_id)
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_pending_send_at
  ON public.scheduled_messages (send_at)
  WHERE status = 'pending';
