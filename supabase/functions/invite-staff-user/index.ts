import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { email, full_name, role, organization_id } = await req.json();
    if (!email || !full_name || !organization_id) {
      return new Response(JSON.stringify({ error: 'email, full_name, organization_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create auth user with invite (sends magic link email)
    const siteUrl = Deno.env.get('SITE_URL') ?? Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.vercel.app') ?? '';
    const { data: authData, error: authError } = await adminSupabase.auth.admin.inviteUserByEmail(email, {
      data: { full_name, role: role ?? 'staff' },
      redirectTo: `${siteUrl}/login`,
    });

    if (authError) throw new Error(`Auth error: ${authError.message}`);

    // Create staff_users row
    const { error: staffError } = await adminSupabase
      .from('staff_users')
      .insert({
        id: authData.user.id,
        organization_id,
        full_name,
        role: role ?? 'staff',
      });

    if (staffError && !staffError.message.includes('duplicate')) {
      throw new Error(`Staff user error: ${staffError.message}`);
    }

    return new Response(JSON.stringify({ success: true, user_id: authData.user.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
