import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const testName = `smoke_test_${Date.now()}`;
  let secretId: string | null = null;

  try {
    // 1. Create
    const { data: createdId, error: createErr } = await supabase.rpc('vault_create_secret', {
      secret: 'super-secret-test-password-12345',
      secret_name: testName,
      secret_description: 'Edge Function vault RPC wrapper smoke test',
    });
    if (createErr || !createdId) throw new Error(`create failed: ${createErr?.message ?? 'no id'}`);
    secretId = createdId as string;

    // 2. Read
    const { data: read1, error: read1Err } = await supabase.rpc('vault_read_secret', {
      secret_id: secretId,
    });
    if (read1Err) throw new Error(`read failed: ${read1Err.message}`);
    if (read1 !== 'super-secret-test-password-12345') throw new Error(`read mismatch: ${read1}`);

    // 3. Update
    const { error: updateErr } = await supabase.rpc('vault_update_secret', {
      secret_id: secretId,
      new_secret: 'rotated-secret-password-67890',
    });
    if (updateErr) throw new Error(`update failed: ${updateErr.message}`);

    const { data: read2, error: read2Err } = await supabase.rpc('vault_read_secret', {
      secret_id: secretId,
    });
    if (read2Err) throw new Error(`read after update failed: ${read2Err.message}`);
    if (read2 !== 'rotated-secret-password-67890') throw new Error(`update mismatch: ${read2}`);

    // 4. Delete
    const { error: deleteErr } = await supabase.rpc('vault_delete_secret', {
      secret_id: secretId,
    });
    if (deleteErr) throw new Error(`delete failed: ${deleteErr.message}`);

    return new Response(JSON.stringify({ success: true, secret_id: secretId }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // Clean up on failure if we got an id
    if (secretId) {
      try { await supabase.rpc('vault_delete_secret', { secret_id: secretId }); } catch { /* ignore */ }
    }
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
