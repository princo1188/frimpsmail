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

    const { mailbox_id, to, cc, bcc, subject, body_html, reply_to_message_id, attachments } = await req.json();

    if (!mailbox_id || !to?.length || !subject) {
      return jsonResponse({ error: 'mailbox_id, to[], subject required' }, 400);
    }

    // Verify mailbox exists
    const { data: mailbox, error: mbError } = await supabase
      .from('mailboxes')
      .select('id, organization_id, staff_user_id')
      .eq('id', mailbox_id)
      .single();
    if (mbError || !mailbox) throw new Error('Mailbox not found');
    const isOwner = mailbox.staff_user_id === callerStaff.id;
    const isOrgAdmin = callerStaff.role === 'admin' && mailbox.organization_id === callerStaff.organization_id;
    if (!isOwner && !isOrgAdmin) return jsonResponse({ error: 'Mailbox access denied' }, 403);

    // Queue outbound message for the sync service email-safe pipeline
    const { error: insertErr } = await supabase.from('outbound_messages').insert({
      mailbox_id,
      to_addresses: to as string[],
      cc_addresses: (cc ?? []) as string[],
      bcc_addresses: (bcc ?? []) as string[],
      subject,
      body_html,
      reply_to_message_id: reply_to_message_id ?? null,
      attachments_json: attachments ?? [],
      status: 'pending',
    });

    if (insertErr) throw new Error(`Failed to queue outbound message: ${insertErr.message}`);

    return jsonResponse({ success: true, queued: true });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
