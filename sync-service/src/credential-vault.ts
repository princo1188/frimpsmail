import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Retrieve a plaintext secret from Supabase Vault by its secret UUID.
 * Uses the new public.vault_read_secret RPC wrapper so the sync service
 * never needs direct access to vault.decrypted_secrets.
 */
export async function getCredential(supabase: SupabaseClient, vaultRef: string): Promise<string> {
  const { data, error } = await supabase.rpc('vault_read_secret', {
    secret_id: vaultRef,
  });
  if (error) throw new Error(`Vault lookup failed for secret "${vaultRef}": ${error.message}`);
  if (!data) throw new Error(`No secret found for vault ref "${vaultRef}"`);
  return data as string;
}
