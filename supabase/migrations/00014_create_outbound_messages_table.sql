CREATE TABLE IF NOT EXISTS outbound_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id UUID NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  to_addresses TEXT[] NOT NULL DEFAULT '{}',
  cc_addresses TEXT[] NOT NULL DEFAULT '{}',
  bcc_addresses TEXT[] NOT NULL DEFAULT '{}',
  subject TEXT NOT NULL DEFAULT '',
  body_html TEXT,
  reply_to_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  attachments_json JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  error TEXT,
  message_id TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbound_messages_status_created
  ON outbound_messages(status, created_at)
  WHERE status IN ('pending', 'sending');

ALTER TABLE outbound_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY outbound_messages_service_all
  ON outbound_messages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
