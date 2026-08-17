import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.27';

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
    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

    const { thread_id, tone = 'professional' } = await req.json();
    if (!thread_id) {
      return new Response(JSON.stringify({ error: 'thread_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: messages } = await supabase
      .from('messages')
      .select('from_name, from_address, body_text, sent_at')
      .eq('thread_id', thread_id)
      .order('sent_at', { ascending: true })
      .limit(10);

    if (!messages?.length) throw new Error('No messages found');

    const lastMsg = messages[messages.length - 1];
    const context = messages.map((m, i) =>
      `[${i + 1}] ${m.from_name ?? m.from_address}: ${(m.body_text ?? '').slice(0, 600)}`
    ).join('\n\n');

    const systemPrompt = `You are an email assistant for Frimps Oil (frimpsoil.com.gh), a Ghana-based oil company. 
Write a ${tone}, concise email reply. Do not include greetings like "Dear Claude" or meta-commentary.
Output only the plain reply body text (no subject line, no "Best regards" signature — the user will add that).`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 500,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Write a draft reply to this email thread. The last message was from ${lastMsg.from_name ?? lastMsg.from_address}.\n\nThread:\n${context}`,
      }],
    });

    const draft = message.content[0].type === 'text' ? message.content[0].text.trim() : '';

    // Cache draft
    await supabase.from('ai_cache').upsert({
      thread_id,
      cache_type: 'reply_draft',
      content: draft,
    }, { onConflict: 'thread_id,cache_type' });

    return new Response(JSON.stringify({ draft }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
