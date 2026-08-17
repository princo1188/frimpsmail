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

    const { mailbox_id, enabled, subject, body, start_date, end_date } = await req.json();
    if (!mailbox_id) {
      return new Response(JSON.stringify({ error: 'mailbox_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch mailbox credentials
    const { data: mailbox } = await supabase
      .from('mailboxes')
      .select('*')
      .eq('id', mailbox_id)
      .single();
    if (!mailbox) throw new Error('Mailbox not found');

    // Retrieve password from Vault via public RPC wrapper
    const { data: password, error: vaultErr } = await supabase
      .rpc('vault_read_secret', { secret_id: mailbox.credential_vault_ref });
    if (vaultErr) throw new Error(`Vault error: ${vaultErr.message}`);
    if (!password) throw new Error('Mailbox password not found in vault');

    // Call cPanel UAPI via HTTP
    const cpanelHost = mailbox.imap_host.replace(/^mail\./, '');
    const emailUser = mailbox.email_address.split('@')[0];
    const domain = mailbox.email_address.split('@')[1];

    const apiAction = enabled ? 'add_autoresponder' : 'delete_autoresponder';
    const params = new URLSearchParams({
      domain,
      email: emailUser,
      ...(enabled ? {
        subject: subject ?? 'Out of Office',
        body: body ?? 'I am currently out of the office.',
        is_html: '0',
        interval: '1',
        start: start_date ? Math.floor(new Date(start_date).getTime() / 1000).toString() : '',
        stop: end_date ? Math.floor(new Date(end_date).getTime() / 1000).toString() : '',
      } : {}),
    });

    const cpanelRes = await fetch(
      `https://${cpanelHost}:2083/execute/Email/${apiAction}?${params}`,
      {
        headers: {
          Authorization: `Basic ${btoa(`${mailbox.email_address}:${password}`)}`,
        },
      }
    );

    if (!cpanelRes.ok) {
      const errText = await cpanelRes.text();
      throw new Error(`cPanel API error: ${errText}`);
    }

    const cpanelData = await cpanelRes.json();
    if (cpanelData.status !== 1) {
      throw new Error(`cPanel error: ${cpanelData.errors?.join(', ')}`);
    }

    return new Response(JSON.stringify({ success: true, enabled }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
