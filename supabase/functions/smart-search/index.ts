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

    const { query, mailbox_id } = await req.json();
    if (!query || !mailbox_id) {
      return new Response(JSON.stringify({ error: 'query and mailbox_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Detect if natural language
    const nlIndicators = /\b(from|emails? from|sent by|about|regarding|last week|last month|yesterday|today|this week|before|after|between)\b/i;
    const isNL = nlIndicators.test(query);

    let results: unknown[] = [];
    let filters: Record<string, unknown> = {};

    if (isNL) {
      const today = new Date().toISOString().slice(0, 10);
      const systemPrompt = `Today is ${today}. Extract search filters from the user's natural language email search query.
Return a JSON object with these optional fields:
- "from_address": email or name of sender
- "subject_keywords": array of keywords to search in subject
- "body_keywords": array of keywords to search in body
- "date_from": ISO date string (YYYY-MM-DD)
- "date_to": ISO date string (YYYY-MM-DD)
- "folder": one of "inbox", "sent", "drafts", "spam", "trash", "archive"
- "plain_query": simplified keyword query for full-text search fallback`;

      const message = await anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 400,
        messages: [{ role: 'user', content: `Extract search filters from: "${query}"` }],
        system: systemPrompt,
      });

      const raw = message.content[0].type === 'text' ? message.content[0].text : '{}';
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        filters = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      } catch {
        filters = {};
      }

      // Execute structured search
      let q = supabase
        .from('messages')
        .select('id, thread_id, subject, from_address, from_name, body_text, sent_at')
        .eq('mailbox_id', mailbox_id)
        .order('sent_at', { ascending: false })
        .limit(30);

      if (filters.from_address) q = q.ilike('from_address', `%${filters.from_address}%`);
      if (filters.date_from) q = q.gte('sent_at', `${filters.date_from}T00:00:00Z`);
      if (filters.date_to) q = q.lte('sent_at', `${filters.date_to}T23:59:59Z`);

      const keywords = [
        ...(filters.subject_keywords ?? []),
        ...(filters.body_keywords ?? []),
        ...(filters.plain_query ? [filters.plain_query] : []),
      ].filter(Boolean);

      if (keywords.length) {
        const textQ = keywords.join(' | ');
        const { data: ftsData } = await q.textSearch('body_text', textQ, { type: 'websearch' });
        if (ftsData?.length) {
          results = ftsData;
        } else {
          // ilike fallback
          const kw = keywords[0];
          const { data: ilikeData } = await q
            .or(`subject.ilike.%${kw}%,body_text.ilike.%${kw}%`);
          results = ilikeData ?? [];
        }
      } else {
        const { data } = await q;
        results = data ?? [];
      }
    } else {
      // Plain full-text search
      const { data, error } = await supabase
        .from('messages')
        .select('id, thread_id, subject, from_address, from_name, body_text, sent_at')
        .eq('mailbox_id', mailbox_id)
        .textSearch('body_text', query, { type: 'websearch' })
        .order('sent_at', { ascending: false })
        .limit(30);

      if (error || !data?.length) {
        // ilike fallback
        const { data: fallback } = await supabase
          .from('messages')
          .select('id, thread_id, subject, from_address, from_name, body_text, sent_at')
          .eq('mailbox_id', mailbox_id)
          .or(`subject.ilike.%${query}%,from_address.ilike.%${query}%,body_text.ilike.%${query}%`)
          .order('sent_at', { ascending: false })
          .limit(30);
        results = fallback ?? [];
      } else {
        results = data;
      }
    }

    return new Response(JSON.stringify({ results, filters, is_natural_language: isNL }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
