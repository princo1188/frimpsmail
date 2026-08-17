import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { email, password, mailbox_id } = await req.json();
    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'email and password required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Upsert the secret atomically — creates on first save, updates on every subsequent save.
    // vault_upsert_secret returns the UUID regardless of whether it was created or updated.
    const secretName = `mailbox_${email.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_password`;

    const { data: secretId, error: vaultError } = await supabase.rpc('vault_upsert_secret', {
      p_secret:      password,
      p_name:        secretName,
      p_description: `IMAP/SMTP password for ${email}`,
    });

    if (vaultError || !secretId) {
      throw new Error(`Vault error: ${vaultError?.message ?? 'no secret ID returned'}`);
    }

    const vaultRef = secretId as string;

    // If mailbox_id provided, update existing mailbox
    if (mailbox_id) {
      const { error: updateError } = await supabase
        .from('mailboxes')
        .update({ credential_vault_ref: vaultRef })
        .eq('id', mailbox_id);
      if (updateError) throw updateError;
    } else {
      // Return vault ref so caller can insert new mailbox row
      return new Response(JSON.stringify({ vault_ref: vaultRef }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, vault_ref: vaultRef }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
