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

    const { thread_id } = await req.json();
    if (!thread_id) {
      return new Response(JSON.stringify({ error: 'thread_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch messages in thread
    const { data: messages, error } = await supabase
      .from('messages')
      .select('from_name, from_address, body_text, sent_at, subject')
      .eq('thread_id', thread_id)
      .order('sent_at', { ascending: true })
      .limit(20);

    if (error || !messages?.length) throw new Error('No messages found');

    // Build transcript
    const transcript = messages.map((m, i) =>
      `[${i + 1}] From: ${m.from_name ?? m.from_address} (${m.sent_at?.slice(0, 10)})\n${(m.body_text ?? '').slice(0, 1500)}`
    ).join('\n\n---\n\n');

    const systemPrompt = `You are an email assistant. Summarize the email thread concisely. 
Output a JSON object with:
- "summary": 2-4 sentence neutral summary of what was discussed
- "key_points": array of up to 5 bullet points (strings)
- "action_items": array of action items with owner and deadline if mentioned (strings)
- "status": one of "resolved", "pending", "ongoing", "informational"`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 800,
      messages: [{ role: 'user', content: `Summarize this email thread:\n\n${transcript}` }],
      system: systemPrompt,
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '';
    let parsed: { summary: string; key_points: string[]; action_items: string[]; status: string };
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: raw, key_points: [], action_items: [], status: 'informational' };
    } catch {
      parsed = { summary: raw, key_points: [], action_items: [], status: 'informational' };
    }

    const summaryText = [
      parsed.summary,
      parsed.key_points?.length ? '\n**Key Points:**\n' + parsed.key_points.map(p => `• ${p}`).join('\n') : '',
      parsed.action_items?.length ? '\n**Action Items:**\n' + parsed.action_items.map(a => `• ${a}`).join('\n') : '',
      parsed.status ? `\n**Status:** ${parsed.status}` : '',
    ].filter(Boolean).join('');

    return new Response(JSON.stringify({ summary: summaryText, parsed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
