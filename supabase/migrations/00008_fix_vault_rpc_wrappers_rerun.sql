
-- Re-run: ensure vault extension exists and all four public wrapper functions are up to date

create extension if not exists supabase_vault cascade;

-- CREATE wrapper
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

-- READ wrapper
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

-- UPDATE wrapper
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

-- DELETE wrapper
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

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
