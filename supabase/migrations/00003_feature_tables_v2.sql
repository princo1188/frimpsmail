
-- ============================================================
-- Email Templates
-- ============================================================
CREATE TABLE IF NOT EXISTS public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id),
  name text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  category text DEFAULT 'general',
  is_shared boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_templates_select" ON public.email_templates
  FOR SELECT USING (organization_id = get_my_organization_id());
CREATE POLICY "email_templates_insert" ON public.email_templates
  FOR INSERT WITH CHECK (organization_id = get_my_organization_id());
CREATE POLICY "email_templates_update" ON public.email_templates
  FOR UPDATE USING (organization_id = get_my_organization_id());
CREATE POLICY "email_templates_delete" ON public.email_templates
  FOR DELETE USING (organization_id = get_my_organization_id() AND (created_by = auth.uid() OR is_admin()));

-- ============================================================
-- Contact Groups
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contact_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.contact_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contact_groups_all" ON public.contact_groups USING (organization_id = get_my_organization_id());

CREATE TABLE IF NOT EXISTS public.contact_group_members (
  group_id uuid NOT NULL REFERENCES public.contact_groups(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, contact_id)
);
ALTER TABLE public.contact_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contact_group_members_all" ON public.contact_group_members
  USING (group_id IN (SELECT id FROM public.contact_groups WHERE organization_id = get_my_organization_id()));

-- ============================================================
-- Saved Searches
-- ============================================================
CREATE TABLE IF NOT EXISTS public.saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  query jsonb NOT NULL DEFAULT '{}',
  icon text DEFAULT 'search',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saved_searches_all" ON public.saved_searches USING (staff_user_id = auth.uid());

-- ============================================================
-- Follow-up Reminders
-- ============================================================
ALTER TABLE public.threads ADD COLUMN IF NOT EXISTS follow_up_at timestamptz;
ALTER TABLE public.threads ADD COLUMN IF NOT EXISTS follow_up_note text;

CREATE TABLE IF NOT EXISTS public.follow_up_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  staff_user_id uuid NOT NULL REFERENCES auth.users(id),
  remind_at timestamptz NOT NULL,
  note text,
  is_dismissed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.follow_up_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follow_up_reminders_all" ON public.follow_up_reminders USING (staff_user_id = auth.uid());

-- ============================================================
-- Webhook Endpoints
-- ============================================================
CREATE TABLE IF NOT EXISTS public.webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  url text NOT NULL,
  events text[] DEFAULT ARRAY['message.received','thread.updated'],
  secret_token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  is_active boolean DEFAULT true,
  last_triggered_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook_endpoints_all" ON public.webhook_endpoints USING (organization_id = get_my_organization_id() AND is_admin());

CREATE TABLE IF NOT EXISTS public.webhook_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid NOT NULL REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event text NOT NULL,
  payload jsonb,
  response_status int,
  response_body text,
  delivered_at timestamptz DEFAULT now(),
  success boolean DEFAULT false
);
ALTER TABLE public.webhook_delivery_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook_logs_select" ON public.webhook_delivery_logs
  USING (webhook_id IN (SELECT id FROM public.webhook_endpoints WHERE organization_id = get_my_organization_id()));

-- ============================================================
-- API Keys
-- ============================================================
CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  scopes text[] DEFAULT ARRAY['read'],
  is_active boolean DEFAULT true,
  last_used_at timestamptz,
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_keys_all" ON public.api_keys USING (organization_id = get_my_organization_id() AND is_admin());

-- ============================================================
-- Mailbox Delegates (shared mailbox access)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mailbox_delegates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id uuid NOT NULL REFERENCES public.mailboxes(id) ON DELETE CASCADE,
  delegate_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_level text NOT NULL DEFAULT 'read' CHECK (permission_level IN ('read', 'send', 'full')),
  granted_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (mailbox_id, delegate_user_id)
);
ALTER TABLE public.mailbox_delegates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mailbox_delegates_select" ON public.mailbox_delegates
  USING (delegate_user_id = auth.uid() OR mailbox_id IN (SELECT id FROM mailboxes WHERE staff_user_id = auth.uid()) OR is_admin());
CREATE POLICY "mailbox_delegates_manage" ON public.mailbox_delegates
  FOR ALL USING (mailbox_id IN (SELECT id FROM mailboxes WHERE staff_user_id = auth.uid()) OR is_admin());

-- ============================================================
-- Out-of-office settings (extend mailboxes)
-- ============================================================
ALTER TABLE public.mailboxes ADD COLUMN IF NOT EXISTS ooo_enabled boolean DEFAULT false;
ALTER TABLE public.mailboxes ADD COLUMN IF NOT EXISTS ooo_subject text;
ALTER TABLE public.mailboxes ADD COLUMN IF NOT EXISTS ooo_body_html text;
ALTER TABLE public.mailboxes ADD COLUMN IF NOT EXISTS ooo_start_date date;
ALTER TABLE public.mailboxes ADD COLUMN IF NOT EXISTS ooo_end_date date;

-- ============================================================
-- Extend ai_cache for new AI types
-- ============================================================
ALTER TABLE public.ai_cache DROP CONSTRAINT IF EXISTS ai_cache_type_check;
ALTER TABLE public.ai_cache ADD CONSTRAINT ai_cache_type_check
  CHECK (type IN ('summary','draft_suggestion','sentiment','categorization','meeting_extraction'));

-- ============================================================
-- Thread read receipt tracking index
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_threads_follow_up ON public.threads (follow_up_at) WHERE follow_up_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_templates_org ON public.email_templates (organization_id, category);
CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON public.saved_searches (staff_user_id);
