import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const getBearerToken = (req: Request) => {
  const authHeader = req.headers.get('Authorization');
  const [scheme, token] = authHeader?.split(' ') ?? [];
  return scheme?.toLowerCase() === 'bearer' ? token : null;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = getBearerToken(req);
    if (!token) return jsonResponse({ error: 'Missing authorization header' }, 401);

    const { data: { user: callerUser }, error: callerError } = await supabase.auth.getUser(token);
    if (callerError || !callerUser) return jsonResponse({ error: 'Unauthorized' }, 401);

    const { data: callerStaff, error: callerStaffError } = await supabase
      .from('staff_users')
      .select('id, organization_id, role')
      .eq('id', callerUser.id)
      .maybeSingle();
    if (callerStaffError) throw new Error(`Could not verify caller: ${callerStaffError.message}`);
    if (!callerStaff) return jsonResponse({ error: 'Staff profile not found' }, 403);

    const { email, password, mailbox_id } = await req.json();
    if (!email || !password) {
      return jsonResponse({ error: 'email and password required' }, 400);
    }

    if (mailbox_id) {
      const { data: mailbox, error: mailboxError } = await supabase
        .from('mailboxes')
        .select('id, organization_id, staff_user_id')
        .eq('id', mailbox_id)
        .maybeSingle();
      if (mailboxError) throw new Error(`Could not verify mailbox: ${mailboxError.message}`);
      if (!mailbox) return jsonResponse({ error: 'Mailbox not found' }, 404);
      const isOwner = mailbox.staff_user_id === callerStaff.id;
      const isOrgAdmin = callerStaff.role === 'admin' && mailbox.organization_id === callerStaff.organization_id;
      if (!isOwner && !isOrgAdmin) return jsonResponse({ error: 'Mailbox access denied' }, 403);
    } else if (callerStaff.role !== 'admin') {
      return jsonResponse({ error: 'Admin access required' }, 403);
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
      return jsonResponse({ vault_ref: vaultRef });
    }

    return jsonResponse({ success: true, vault_ref: vaultRef });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
