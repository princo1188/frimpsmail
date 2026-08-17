
-- Fix for: "Could not find the function public.vault.create_secret(...)"
-- Root cause: PostgREST only exposes RPC functions living in the `public` schema.
-- Vault's functions live in the `vault` schema, so they need public wrappers.

-- 1. Confirm the Vault extension is enabled (safe to run even if already enabled)
create extension if not exists supabase_vault cascade;

-- 2. Wrapper to CREATE a secret (used when a mailbox password is first saved)
create or replace function public.vault_create_secret(
  secret text,
  secret_name text default null,
  secret_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = vault, public
as $$
declare
  new_secret_id uuid;
begin
  new_secret_id := vault.create_secret(secret, secret_name, secret_description);
  return new_secret_id;
end;
$$;

revoke all on function public.vault_create_secret from public, anon, authenticated;
grant execute on function public.vault_create_secret to service_role;

-- 3. Wrapper to READ/decrypt a secret (used by the sync service to get the mailbox password)
create or replace function public.vault_read_secret(secret_id uuid)
returns text
language plpgsql
security definer
set search_path = vault, public
as $$
declare
  decrypted text;
begin
  select decrypted_secret into decrypted
  from vault.decrypted_secrets
  where id = secret_id;
  return decrypted;
end;
$$;

revoke all on function public.vault_read_secret from public, anon, authenticated;
grant execute on function public.vault_read_secret to service_role;

-- 4. Wrapper to UPDATE a secret (used when a mailbox password is changed/rotated)
create or replace function public.vault_update_secret(
  secret_id uuid,
  new_secret text
)
returns void
language plpgsql
security definer
set search_path = vault, public
as $$
begin
  perform vault.update_secret(secret_id, new_secret);
end;
$$;

revoke all on function public.vault_update_secret from public, anon, authenticated;
grant execute on function public.vault_update_secret to service_role;

-- 5. Wrapper to DELETE a secret (used when a mailbox is removed)
create or replace function public.vault_delete_secret(secret_id uuid)
returns void
language plpgsql
security definer
set search_path = vault, public
as $$
begin
  delete from vault.secrets where id = secret_id;
end;
$$;

revoke all on function public.vault_delete_secret from public, anon, authenticated;
grant execute on function public.vault_delete_secret to service_role;

-- 6. Force PostgREST to reload its schema cache so the new functions are visible immediately
notify pgrst, 'reload schema';
