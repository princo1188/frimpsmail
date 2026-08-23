CREATE TABLE IF NOT EXISTS public.contact_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  mailbox_id uuid REFERENCES public.mailboxes(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.contact_groups
  ADD COLUMN IF NOT EXISTS mailbox_id uuid REFERENCES public.mailboxes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_contact_groups_mailbox_id ON public.contact_groups(mailbox_id);

ALTER TABLE public.contact_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contact_groups_all" ON public.contact_groups;
CREATE POLICY "contact_groups_all" ON public.contact_groups
  FOR ALL
  USING (organization_id = public.get_my_organization_id())
  WITH CHECK (organization_id = public.get_my_organization_id());

CREATE TABLE IF NOT EXISTS public.contact_group_members (
  group_id uuid NOT NULL REFERENCES public.contact_groups(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, contact_id)
);

ALTER TABLE public.contact_group_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contact_group_members_all" ON public.contact_group_members;
CREATE POLICY "contact_group_members_all" ON public.contact_group_members
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.contact_groups
      WHERE contact_groups.id = contact_group_members.group_id
        AND contact_groups.organization_id = public.get_my_organization_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.contact_groups
      WHERE contact_groups.id = contact_group_members.group_id
        AND contact_groups.organization_id = public.get_my_organization_id()
    )
  );

DELETE FROM public.contacts
WHERE name IN (
  'Abena Frimpong',
  'Akosua Boateng',
  'David Asante',
  'Emmanuel Tetteh',
  'Inspector Mensah',
  'James Quaye',
  'Kwesi Asiedu'
);

UPDATE public.staff_users
SET role = 'admin'
WHERE id IN (
  SELECT id
  FROM auth.users
  WHERE email IN ('paakwesi@frimpsoil.com.gh', 'prince@frimpsoil.com.gh')
);
