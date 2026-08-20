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

    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authorization.slice('Bearer '.length),
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: staffUser, error: staffError } = await supabase
      .from('staff_users')
      .select('organization_id, role')
      .eq('id', user.id)
      .maybeSingle();
    if (staffError || staffUser?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Administrator access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { mailbox_id } = await req.json() as { mailbox_id: string };
    if (!mailbox_id) {
      return new Response(JSON.stringify({ error: 'mailbox_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: mailbox, error: mbError } = await supabase
      .from('mailboxes')
      .select('id, sync_status, credential_vault_ref')
      .eq('id', mailbox_id)
      .eq('organization_id', staffUser.organization_id)
      .single();
    if (mbError || !mailbox) throw new Error('Mailbox not found');
    if (!mailbox.credential_vault_ref) throw new Error('Mailbox has no stored credentials');

    const { error: updateError } = await supabase
      .from('mailboxes')
      .update({ sync_status: 'pending', last_error: null })
      .eq('id', mailbox_id);
    if (updateError) throw updateError;

    return new Response(JSON.stringify({
      success: true,
      message: 'Mailbox marked for sync. Ensure the persistent sync service is running.',
      previous_status: mailbox.sync_status,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
