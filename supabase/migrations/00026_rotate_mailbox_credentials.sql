-- Credential rotation must change the mailbox row so persistent workers abandon
-- an authenticated connection that was created with the previous password.
CREATE OR REPLACE FUNCTION public.fn_mailbox_credentials_set()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.credential_vault_ref IS NOT NULL
     AND (OLD IS NULL OR OLD.credential_vault_ref IS DISTINCT FROM NEW.credential_vault_ref)
  THEN
    NEW.sync_status := 'pending';
    NEW.last_error := NULL;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_mailbox_credentials_set() IS
  'Marks a mailbox pending whenever its immutable Vault credential reference rotates.';
