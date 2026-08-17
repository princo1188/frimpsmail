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

    // Check cache first
    const { data: cached } = await supabase
      .from('ai_cache')
      .select('content, created_at')
      .eq('thread_id', thread_id)
      .eq('cache_type', 'sentiment')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (cached?.content) {
      try {
        const parsed = JSON.parse(cached.content);
        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch { /* re-run analysis */ }
    }

    const { data: messages } = await supabase
      .from('messages')
      .select('from_address, body_text, sent_at')
      .eq('thread_id', thread_id)
      .order('sent_at', { ascending: true })
      .limit(10);

    if (!messages?.length) throw new Error('No messages found');

    const transcript = messages.map(m =>
      `From: ${m.from_address}\n${(m.body_text ?? '').slice(0, 800)}`
    ).join('\n\n---\n\n');

    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 300,
      messages: [{ role: 'user', content: `Analyse the sentiment of this email thread and respond with a JSON object with fields: "label" (one of: positive, neutral, negative, urgent, concerned), "score" (0.0 to 1.0 where 1.0 is most intense), "reasoning" (1 sentence max).\n\nThread:\n${transcript}` }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '{}';
    let result: { label: string; score: number; reasoning: string };
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      result = match ? JSON.parse(match[0]) : { label: 'neutral', score: 0.5, reasoning: 'Analysis unavailable' };
    } catch {
      result = { label: 'neutral', score: 0.5, reasoning: 'Analysis unavailable' };
    }

    // Cache result
    await supabase.from('ai_cache').upsert({
      thread_id,
      cache_type: 'sentiment',
      content: JSON.stringify(result),
    }, { onConflict: 'thread_id,cache_type' });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
