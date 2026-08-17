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

    // Check cache
    const { data: cached } = await supabase
      .from('ai_cache')
      .select('content')
      .eq('thread_id', thread_id)
      .eq('cache_type', 'meetings')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (cached?.content) {
      try {
        return new Response(JSON.stringify(JSON.parse(cached.content)), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch { /* rerun */ }
    }

    const { data: messages } = await supabase
      .from('messages')
      .select('from_name, from_address, body_text, sent_at')
      .eq('thread_id', thread_id)
      .order('sent_at', { ascending: true })
      .limit(15);

    if (!messages?.length) throw new Error('No messages found');

    const transcript = messages.map(m =>
      `From: ${m.from_name ?? m.from_address} (${m.sent_at?.slice(0, 10) ?? ''})\n${(m.body_text ?? '').slice(0, 600)}`
    ).join('\n\n---\n\n');

    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `Extract any meetings, appointments, calls or scheduled events mentioned in this email thread.
Respond with JSON: {"meetings": [{"title": "...", "date": "...", "time": "...", "location": "...", "attendees": ["email1","email2"], "notes": "..."}]}
If no meetings are mentioned, respond with {"meetings": []}.

Thread:
${transcript}`,
      }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '{}';
    let result: { meetings: Array<{ title: string; date: string; time: string; location: string; attendees: string[]; notes: string }> };
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      result = match ? JSON.parse(match[0]) : { meetings: [] };
    } catch {
      result = { meetings: [] };
    }

    // Cache
    await supabase.from('ai_cache').upsert({
      thread_id,
      cache_type: 'meetings',
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
