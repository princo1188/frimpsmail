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

    const { mailbox_id, to, cc, bcc, subject, body_html, reply_to_message_id, attachments } = await req.json();

    if (!mailbox_id || !to?.length || !subject) {
      return new Response(JSON.stringify({ error: 'mailbox_id, to[], subject required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify mailbox exists
    const { data: mailbox, error: mbError } = await supabase
      .from('mailboxes')
      .select('id')
      .eq('id', mailbox_id)
      .single();
    if (mbError || !mailbox) throw new Error('Mailbox not found');

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

    return new Response(JSON.stringify({ success: true, queued: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
