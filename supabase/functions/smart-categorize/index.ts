import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk@0.27';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CATEGORIES = [
  'Invoice / Payment',
  'Meeting Request',
  'Support Request',
  'Contract / Legal',
  'Newsletter',
  'Internal',
  'Notification / Alert',
  'Enquiry',
  'Follow-up',
  'Urgent',
];

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
      .eq('cache_type', 'categories')
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

    const { data: thread } = await supabase
      .from('threads')
      .select('subject, snippet')
      .eq('id', thread_id)
      .single();

    const { data: messages } = await supabase
      .from('messages')
      .select('from_address, body_text, subject')
      .eq('thread_id', thread_id)
      .order('sent_at', { ascending: true })
      .limit(5);

    if (!thread && !messages?.length) throw new Error('Thread not found');

    const sample = `Subject: ${thread?.subject ?? messages?.[0]?.subject ?? 'Unknown'}\n${messages?.map(m => m.body_text?.slice(0, 400)).join('\n\n').slice(0, 1200) ?? ''}`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Classify this email into 1-3 of these categories: ${CATEGORIES.join(', ')}.\nRespond with JSON: {"categories": ["cat1", "cat2"]}.\n\nEmail:\n${sample}`,
      }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '{}';
    let result: { categories: string[] };
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      result = match ? JSON.parse(match[0]) : { categories: [] };
    } catch {
      result = { categories: [] };
    }

    // Cache + apply labels to thread
    await supabase.from('ai_cache').upsert({
      thread_id,
      cache_type: 'categories',
      content: JSON.stringify(result),
    }, { onConflict: 'thread_id,cache_type' });

    if (result.categories?.length) {
      await supabase
        .from('threads')
        .update({ labels: result.categories })
        .eq('id', thread_id);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
