import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify caller is authenticated admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: { user: callerUser }, error: callerErr } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (callerErr || !callerUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check caller is admin
    const { data: callerStaff } = await supabaseAdmin
      .from('staff_users')
      .select('role')
      .eq('id', callerUser.id)
      .maybeSingle();
    if (callerStaff?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { staff_user_id } = await req.json() as { staff_user_id: string };
    if (!staff_user_id) {
      return new Response(JSON.stringify({ error: 'staff_user_id is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the target user's auth ID and organization (staff_users.id = auth.users.id)
    const { data: targetStaff } = await supabaseAdmin
      .from('staff_users')
      .select('id, organization_id')
      .eq('id', staff_user_id)
      .maybeSingle();
    if (!targetStaff) {
      return new Response(JSON.stringify({ error: 'Staff user not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // List and delete all TOTP factors for the target user
    const { data: factors } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: staff_user_id });
    if (factors?.factors?.length) {
      for (const factor of factors.factors) {
        await supabaseAdmin.auth.admin.mfa.deleteFactor({ userId: staff_user_id, id: factor.id });
      }
    }

    // Update staff_users record
    await supabaseAdmin.from('staff_users').update({
      mfa_enrolled: false,
      mfa_enrolled_at: null,
    }).eq('id', staff_user_id);

    const forwarded = req.headers.get('x-forwarded-for');
    await supabaseAdmin.from('security_audit_log').insert({
      organization_id: targetStaff?.organization_id ?? null,
      staff_user_id: callerUser.id,
      event_type: 'mfa_admin_reset',
      event_metadata: { target_staff_user_id: staff_user_id },
      ip_address: forwarded ? forwarded.split(',')[0].trim() : undefined,
      user_agent: req.headers.get('user-agent') ?? null,
    });

    return new Response(JSON.stringify({ success: true, message: 'MFA reset successfully' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
