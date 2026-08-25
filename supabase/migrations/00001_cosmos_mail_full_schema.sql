
-- ============================================================
-- COSMOS MAIL — Full Schema Migration
-- ============================================================

-- 1. ORGANIZATIONS
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  domain text NOT NULL UNIQUE,
  branding_config jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- 2. STAFF USERS
CREATE TABLE staff_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name text,
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE staff_users ENABLE ROW LEVEL SECURITY;

-- 3. MAILBOXES
CREATE TABLE mailboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  staff_user_id uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  email_address text NOT NULL,
  display_name text,
  imap_host text NOT NULL,
  imap_port int NOT NULL DEFAULT 993,
  smtp_host text NOT NULL,
  smtp_port int NOT NULL DEFAULT 587,
  credential_vault_ref text,
  sync_status text NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending','syncing','active','error')),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE mailboxes ENABLE ROW LEVEL SECURITY;

-- 4. MAILBOX FOLDERS
CREATE TABLE mailbox_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id uuid NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  imap_folder_name text NOT NULL,
  normalized_type text CHECK (normalized_type IN ('inbox','sent','drafts','trash','spam','archive','custom')),
  display_name text
);

ALTER TABLE mailbox_folders ENABLE ROW LEVEL SECURITY;

-- 5. THREADS
CREATE TABLE threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id uuid NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  subject text,
  participants text[] DEFAULT '{}',
  last_message_at timestamptz,
  is_read boolean DEFAULT false,
  is_starred boolean DEFAULT false,
  labels text[] DEFAULT '{}',
  folder_id uuid REFERENCES mailbox_folders(id) ON DELETE SET NULL,
  snoozed_until timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_threads_mailbox_id ON threads(mailbox_id);
CREATE INDEX idx_threads_last_message_at ON threads(last_message_at DESC);
CREATE INDEX idx_threads_folder_id ON threads(folder_id);

-- 6. MESSAGES
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  mailbox_id uuid NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  imap_uid bigint NOT NULL,
  imap_uidvalidity bigint NOT NULL,
  subject text,
  from_address text,
  from_name text,
  to_addresses text[] DEFAULT '{}',
  cc_addresses text[] DEFAULT '{}',
  bcc_addresses text[] DEFAULT '{}',
  body_html text,
  body_text text,
  sent_at timestamptz,
  is_read boolean DEFAULT false,
  is_flagged boolean DEFAULT false,
  spam_score numeric,
  spam_status text DEFAULT 'clean' CHECK (spam_status IN ('clean','flagged','confirmed_spam')),
  raw_headers jsonb DEFAULT '{}',
  read_receipt_confirmed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (mailbox_id, imap_uid, imap_uidvalidity)
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_messages_thread_id ON messages(thread_id);
CREATE INDEX idx_messages_mailbox_id ON messages(mailbox_id);
CREATE INDEX idx_messages_sent_at ON messages(sent_at DESC);
CREATE INDEX idx_messages_fts ON messages USING gin(
  to_tsvector('english', coalesce(subject, '') || ' ' || coalesce(body_text, '') || ' ' || coalesce(from_address, ''))
);

-- 7. ATTACHMENTS
CREATE TABLE attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  filename text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

-- 8. AI CACHE
CREATE TABLE ai_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('summary','draft_suggestion')),
  content text NOT NULL,
  generated_at timestamptz DEFAULT now()
);

ALTER TABLE ai_cache ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX idx_ai_cache_thread_type ON ai_cache(thread_id, type);

-- 9. SPAM FLAGS
CREATE TABLE spam_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('spamassassin','ai_second_pass')),
  confidence numeric,
  reason text,
  user_action text DEFAULT 'pending' CHECK (user_action IN ('pending','confirmed','dismissed')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE spam_flags ENABLE ROW LEVEL SECURITY;

-- 10. SIGNATURES
CREATE TABLE signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id uuid NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  body_html text NOT NULL,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE signatures ENABLE ROW LEVEL SECURITY;

-- 11. CONTACTS
CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  company text,
  phone text,
  notes text,
  created_by uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- 12. RULES
CREATE TABLE rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id uuid NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  condition_json jsonb NOT NULL DEFAULT '{}',
  action_json jsonb NOT NULL DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE rules ENABLE ROW LEVEL SECURITY;

-- 13. CALENDAR EVENTS
CREATE TABLE calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  location text,
  attendees text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- 14. SCHEDULED MESSAGES
CREATE TABLE scheduled_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id uuid NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  to_addresses text[] NOT NULL DEFAULT '{}',
  cc_addresses text[] DEFAULT '{}',
  subject text,
  body_html text,
  attachments_json jsonb DEFAULT '[]',
  send_at timestamptz NOT NULL,
  sent_at timestamptz,
  status text DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE scheduled_messages ENABLE ROW LEVEL SECURITY;

-- 15. FEATURE INTEREST
CREATE TABLE feature_interest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  feature text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE feature_interest ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================
CREATE OR REPLACE FUNCTION get_my_organization_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT organization_id FROM staff_users WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role = 'admin' FROM staff_users WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_my_mailbox_ids()
RETURNS SETOF uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id FROM mailboxes 
  WHERE staff_user_id = auth.uid()
     OR (organization_id = get_my_organization_id() AND is_admin());
$$;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- ORGANIZATIONS — anon can read for branding lookup; authenticated scoped to own org
CREATE POLICY "org_anon_select" ON organizations FOR SELECT TO anon USING (true);
CREATE POLICY "org_auth_select" ON organizations FOR SELECT TO authenticated USING (id = get_my_organization_id());

-- STAFF USERS
CREATE POLICY "staff_select" ON staff_users FOR SELECT TO authenticated 
  USING (id = auth.uid() OR organization_id = get_my_organization_id());
CREATE POLICY "staff_update_own" ON staff_users FOR UPDATE TO authenticated USING (id = auth.uid());

-- MAILBOXES
CREATE POLICY "mailbox_select" ON mailboxes FOR SELECT TO authenticated
  USING (staff_user_id = auth.uid() OR (is_admin() AND organization_id = get_my_organization_id()));
CREATE POLICY "mailbox_admin_insert" ON mailboxes FOR INSERT TO authenticated
  WITH CHECK (is_admin() AND organization_id = get_my_organization_id());
CREATE POLICY "mailbox_admin_update" ON mailboxes FOR UPDATE TO authenticated
  USING (is_admin() AND organization_id = get_my_organization_id());
CREATE POLICY "mailbox_admin_delete" ON mailboxes FOR DELETE TO authenticated
  USING (is_admin() AND organization_id = get_my_organization_id());

-- MAILBOX FOLDERS
CREATE POLICY "folders_select" ON mailbox_folders FOR SELECT TO authenticated
  USING (mailbox_id IN (SELECT get_my_mailbox_ids()));
CREATE POLICY "folders_insert" ON mailbox_folders FOR INSERT TO authenticated
  WITH CHECK (mailbox_id IN (SELECT get_my_mailbox_ids()));
CREATE POLICY "folders_update" ON mailbox_folders FOR UPDATE TO authenticated
  USING (mailbox_id IN (SELECT get_my_mailbox_ids()));
CREATE POLICY "folders_delete" ON mailbox_folders FOR DELETE TO authenticated
  USING (mailbox_id IN (SELECT get_my_mailbox_ids()));

-- THREADS
CREATE POLICY "threads_select" ON threads FOR SELECT TO authenticated USING (mailbox_id IN (SELECT get_my_mailbox_ids()));
CREATE POLICY "threads_insert" ON threads FOR INSERT TO authenticated WITH CHECK (mailbox_id IN (SELECT get_my_mailbox_ids()));
CREATE POLICY "threads_update" ON threads FOR UPDATE TO authenticated USING (mailbox_id IN (SELECT get_my_mailbox_ids()));
CREATE POLICY "threads_delete" ON threads FOR DELETE TO authenticated USING (mailbox_id IN (SELECT get_my_mailbox_ids()));

-- MESSAGES
CREATE POLICY "messages_select" ON messages FOR SELECT TO authenticated USING (mailbox_id IN (SELECT get_my_mailbox_ids()));
CREATE POLICY "messages_insert" ON messages FOR INSERT TO authenticated WITH CHECK (mailbox_id IN (SELECT get_my_mailbox_ids()));
CREATE POLICY "messages_update" ON messages FOR UPDATE TO authenticated USING (mailbox_id IN (SELECT get_my_mailbox_ids()));
CREATE POLICY "messages_delete" ON messages FOR DELETE TO authenticated USING (mailbox_id IN (SELECT get_my_mailbox_ids()));

-- ATTACHMENTS
CREATE POLICY "attachments_select" ON attachments FOR SELECT TO authenticated
  USING (message_id IN (SELECT id FROM messages WHERE mailbox_id IN (SELECT get_my_mailbox_ids())));
CREATE POLICY "attachments_insert" ON attachments FOR INSERT TO authenticated
  WITH CHECK (message_id IN (SELECT id FROM messages WHERE mailbox_id IN (SELECT get_my_mailbox_ids())));

-- AI CACHE
CREATE POLICY "ai_cache_select" ON ai_cache FOR SELECT TO authenticated
  USING (thread_id IN (SELECT id FROM threads WHERE mailbox_id IN (SELECT get_my_mailbox_ids())));
CREATE POLICY "ai_cache_insert" ON ai_cache FOR INSERT TO authenticated
  WITH CHECK (thread_id IN (SELECT id FROM threads WHERE mailbox_id IN (SELECT get_my_mailbox_ids())));
CREATE POLICY "ai_cache_update" ON ai_cache FOR UPDATE TO authenticated
  USING (thread_id IN (SELECT id FROM threads WHERE mailbox_id IN (SELECT get_my_mailbox_ids())));

-- SPAM FLAGS
CREATE POLICY "spam_flags_select" ON spam_flags FOR SELECT TO authenticated
  USING (message_id IN (SELECT id FROM messages WHERE mailbox_id IN (SELECT get_my_mailbox_ids())));
CREATE POLICY "spam_flags_insert" ON spam_flags FOR INSERT TO authenticated
  WITH CHECK (message_id IN (SELECT id FROM messages WHERE mailbox_id IN (SELECT get_my_mailbox_ids())));
CREATE POLICY "spam_flags_update" ON spam_flags FOR UPDATE TO authenticated
  USING (message_id IN (SELECT id FROM messages WHERE mailbox_id IN (SELECT get_my_mailbox_ids())));

-- SIGNATURES
CREATE POLICY "signatures_select" ON signatures FOR SELECT TO authenticated USING (mailbox_id IN (SELECT get_my_mailbox_ids()));
CREATE POLICY "signatures_insert" ON signatures FOR INSERT TO authenticated WITH CHECK (mailbox_id IN (SELECT get_my_mailbox_ids()));
CREATE POLICY "signatures_update" ON signatures FOR UPDATE TO authenticated USING (mailbox_id IN (SELECT get_my_mailbox_ids()));
CREATE POLICY "signatures_delete" ON signatures FOR DELETE TO authenticated USING (mailbox_id IN (SELECT get_my_mailbox_ids()));

-- CONTACTS
CREATE POLICY "contacts_select" ON contacts FOR SELECT TO authenticated USING (organization_id = get_my_organization_id());
CREATE POLICY "contacts_insert" ON contacts FOR INSERT TO authenticated WITH CHECK (organization_id = get_my_organization_id());
CREATE POLICY "contacts_update" ON contacts FOR UPDATE TO authenticated USING (organization_id = get_my_organization_id());
CREATE POLICY "contacts_delete" ON contacts FOR DELETE TO authenticated USING (organization_id = get_my_organization_id());

-- RULES
CREATE POLICY "rules_select" ON rules FOR SELECT TO authenticated USING (mailbox_id IN (SELECT get_my_mailbox_ids()));
CREATE POLICY "rules_insert" ON rules FOR INSERT TO authenticated WITH CHECK (mailbox_id IN (SELECT get_my_mailbox_ids()));
CREATE POLICY "rules_update" ON rules FOR UPDATE TO authenticated USING (mailbox_id IN (SELECT get_my_mailbox_ids()));
CREATE POLICY "rules_delete" ON rules FOR DELETE TO authenticated USING (mailbox_id IN (SELECT get_my_mailbox_ids()));

-- CALENDAR EVENTS
CREATE POLICY "calendar_select" ON calendar_events FOR SELECT TO authenticated USING (organization_id = get_my_organization_id());
CREATE POLICY "calendar_insert" ON calendar_events FOR INSERT TO authenticated WITH CHECK (organization_id = get_my_organization_id());
CREATE POLICY "calendar_update" ON calendar_events FOR UPDATE TO authenticated USING (organization_id = get_my_organization_id());
CREATE POLICY "calendar_delete" ON calendar_events FOR DELETE TO authenticated
  USING (organization_id = get_my_organization_id() AND (created_by = auth.uid() OR is_admin()));

-- SCHEDULED MESSAGES
CREATE POLICY "scheduled_select" ON scheduled_messages FOR SELECT TO authenticated USING (mailbox_id IN (SELECT get_my_mailbox_ids()));
CREATE POLICY "scheduled_insert" ON scheduled_messages FOR INSERT TO authenticated WITH CHECK (mailbox_id IN (SELECT get_my_mailbox_ids()));
CREATE POLICY "scheduled_update" ON scheduled_messages FOR UPDATE TO authenticated USING (mailbox_id IN (SELECT get_my_mailbox_ids()));
CREATE POLICY "scheduled_delete" ON scheduled_messages FOR DELETE TO authenticated USING (mailbox_id IN (SELECT get_my_mailbox_ids()));

-- FEATURE INTEREST
CREATE POLICY "feature_interest_select" ON feature_interest FOR SELECT TO authenticated USING (staff_user_id = auth.uid());
CREATE POLICY "feature_interest_insert" ON feature_interest FOR INSERT TO authenticated WITH CHECK (staff_user_id = auth.uid());

-- ============================================================
-- ENABLE REALTIME
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE threads;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE mailboxes;

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES 
  ('attachments', 'attachments', false, 52428800),
  ('logos', 'logos', true, 5242880)
ON CONFLICT (id) DO NOTHING;

-- Restrict attachment objects to a mailbox the caller can access or to a
-- calendar event in the caller's organization. The two path formats below are
-- already used by the mail and calendar clients respectively.
CREATE POLICY "attachments_auth_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'attachments'
    AND (
      ((storage.foldername(name))[1] = 'attachments' AND EXISTS (
        SELECT 1 FROM mailboxes
        WHERE mailboxes.id::text = (storage.foldername(name))[2]
          AND mailboxes.id IN (SELECT get_my_mailbox_ids())
      ))
      OR ((storage.foldername(name))[1] = 'calendar-attachments' AND EXISTS (
        SELECT 1 FROM calendar_events
        WHERE calendar_events.id::text = (storage.foldername(name))[2]
          AND calendar_events.organization_id = get_my_organization_id()
      ))
    )
  );
CREATE POLICY "attachments_auth_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'attachments'
    AND (
      ((storage.foldername(name))[1] = 'attachments' AND EXISTS (
        SELECT 1 FROM mailboxes
        WHERE mailboxes.id::text = (storage.foldername(name))[2]
          AND mailboxes.id IN (SELECT get_my_mailbox_ids())
      ))
      OR ((storage.foldername(name))[1] = 'calendar-attachments' AND EXISTS (
        SELECT 1 FROM calendar_events
        WHERE calendar_events.id::text = (storage.foldername(name))[2]
          AND calendar_events.organization_id = get_my_organization_id()
      ))
    )
  );
CREATE POLICY "attachments_auth_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = 'attachments' AND EXISTS (
    SELECT 1 FROM mailboxes WHERE mailboxes.id::text = (storage.foldername(name))[2]
      AND mailboxes.id IN (SELECT get_my_mailbox_ids())
  ));
CREATE POLICY "attachments_auth_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'attachments' AND (
    ((storage.foldername(name))[1] = 'attachments' AND EXISTS (
      SELECT 1 FROM mailboxes WHERE mailboxes.id::text = (storage.foldername(name))[2]
        AND mailboxes.id IN (SELECT get_my_mailbox_ids())
    ))
    OR ((storage.foldername(name))[1] = 'calendar-attachments' AND EXISTS (
      SELECT 1 FROM calendar_events WHERE calendar_events.id::text = (storage.foldername(name))[2]
        AND calendar_events.organization_id = get_my_organization_id()
    ))
  ));
CREATE POLICY "logos_public_select" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'logos');
CREATE POLICY "logos_auth_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'logos');

-- ============================================================
-- SEED: Frimps Oil Organization
-- ============================================================
INSERT INTO organizations (id, name, domain, branding_config)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Frimps Oil Company',
  'frimpsoil.com.gh',
  '{"primary_color": "#E31E24", "accent_color": "#F7941D", "surface_color": "#FFFFFF", "theme_mode": "light", "logo_url": ""}'
) ON CONFLICT (domain) DO NOTHING;
