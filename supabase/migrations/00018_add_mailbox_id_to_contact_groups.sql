
-- Add mailbox_id to contact_groups so each email holder has their own private groups
ALTER TABLE public.contact_groups
  ADD COLUMN IF NOT EXISTS mailbox_id uuid REFERENCES public.mailboxes(id) ON DELETE CASCADE;

-- Index for efficient per-mailbox lookup
CREATE INDEX IF NOT EXISTS idx_contact_groups_mailbox_id ON public.contact_groups(mailbox_id);

-- Drop old org-only policy and replace with one that allows both org-shared and per-mailbox groups
DROP POLICY IF EXISTS "contact_groups_all" ON public.contact_groups;

-- New policy: user can see groups in their org (includes their own per-mailbox groups + any org-wide ones)
CREATE POLICY "contact_groups_all" ON public.contact_groups
  USING (organization_id = get_my_organization_id());

-- contact_group_members policy already joins through contact_groups which has the org filter, no change needed
