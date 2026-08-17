-- When a staff user completes MFA enrollment, kick any mailboxes that have
-- credentials but are stuck in pending/error back to pending so the sync service
-- starts them automatically.
CREATE OR REPLACE FUNCTION public.fn_staff_mfa_enrolled_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.mfa_enrolled = true
     AND (OLD IS NULL OR OLD.mfa_enrolled IS DISTINCT FROM NEW.mfa_enrolled)
  THEN
    UPDATE public.mailboxes
    SET sync_status = 'pending',
        last_error = NULL,
        updated_at = now()
    WHERE staff_user_id = NEW.id
      AND credential_vault_ref IS NOT NULL
      AND sync_status IN ('pending', 'error');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_mfa_enrolled_sync ON public.staff_users;
CREATE TRIGGER trg_staff_mfa_enrolled_sync
  BEFORE UPDATE OF mfa_enrolled ON public.staff_users
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_staff_mfa_enrolled_sync();

-- Security audit log for MFA events and other sensitive actions
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  staff_user_id uuid REFERENCES public.staff_users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_metadata jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can read audit logs for their organization
CREATE POLICY "admins_read_org_audit_logs"
  ON public.security_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_users
      WHERE staff_users.id = auth.uid()
        AND staff_users.role = 'admin'
        AND staff_users.organization_id = security_audit_log.organization_id
    )
  );

-- Service role / authenticated inserts (Edge Functions use service role)
CREATE POLICY "authenticated_insert_audit_logs"
  ON public.security_audit_log
  FOR INSERT
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_security_audit_log_org
  ON public.security_audit_log (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_staff
  ON public.security_audit_log (staff_user_id, created_at DESC);
