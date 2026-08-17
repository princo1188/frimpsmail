
-- Insert pending mailbox rows for new staff members
INSERT INTO mailboxes (
  email_address, display_name,
  imap_host, imap_port,
  smtp_host, smtp_port,
  sync_status,
  organization_id,
  staff_user_id
)
VALUES
  (
    'paakwesi@frimpsoil.com.gh', 'Paakwesi',
    'mail.frimpsoil.com.gh', 993,
    'mail.frimpsoil.com.gh', 587,
    'pending',
    'aaaaaaaa-0000-0000-0000-000000000001',
    'e6bfc467-ed48-4fd9-81e7-6a54e38da651'
  ),
  (
    'prince@frimpsoil.com.gh', 'Prince',
    'mail.frimpsoil.com.gh', 993,
    'mail.frimpsoil.com.gh', 587,
    'pending',
    'aaaaaaaa-0000-0000-0000-000000000001',
    '66fd5bff-21df-4a9e-9693-2fb9483a3a2e'
  )
ON CONFLICT (email_address) DO UPDATE
  SET
    organization_id = EXCLUDED.organization_id,
    staff_user_id   = EXCLUDED.staff_user_id,
    display_name    = EXCLUDED.display_name,
    imap_host       = EXCLUDED.imap_host,
    imap_port       = EXCLUDED.imap_port,
    smtp_host       = EXCLUDED.smtp_host,
    smtp_port       = EXCLUDED.smtp_port;

-- Trigger: reset sync_status = 'pending' whenever credential_vault_ref is newly set
-- Ensures sync service picks up the mailbox on credential store/rotate
CREATE OR REPLACE FUNCTION public.fn_mailbox_credentials_set()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.credential_vault_ref IS NOT NULL
     AND (OLD IS NULL OR OLD.credential_vault_ref IS DISTINCT FROM NEW.credential_vault_ref)
     AND NEW.sync_status IN ('pending', 'error')
  THEN
    NEW.sync_status := 'pending';
    NEW.last_error  := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mailbox_credentials_set ON mailboxes;
CREATE TRIGGER trg_mailbox_credentials_set
  BEFORE INSERT OR UPDATE OF credential_vault_ref
  ON mailboxes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_mailbox_credentials_set();
