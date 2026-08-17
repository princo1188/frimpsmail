
-- Atomic upsert: create OR update a vault secret by name.
-- Returns the UUID of the secret (existing or newly created).
-- Accessible only by service_role.
CREATE OR REPLACE FUNCTION public.vault_upsert_secret(
  p_secret      text,
  p_name        text,
  p_description text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Check if a secret with this name already exists
  SELECT id INTO v_id
  FROM vault.secrets
  WHERE name = p_name
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    -- Update the existing secret
    PERFORM vault.update_secret(v_id, p_secret);
    RETURN v_id;
  ELSE
    -- Create a new secret and return its UUID
    v_id := vault.create_secret(p_secret, p_name, p_description);
    RETURN v_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.vault_upsert_secret FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vault_upsert_secret TO service_role;

NOTIFY pgrst, 'reload schema';
