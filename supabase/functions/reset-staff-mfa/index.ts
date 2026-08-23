import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

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
      return jsonResponse({ error: 'Missing authorization header' }, 401);
    }
    const { data: { user: callerUser }, error: callerErr } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (callerErr || !callerUser) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    // Check caller is admin
    const { data: callerStaff, error: callerStaffError } = await supabaseAdmin
      .from('staff_users')
      .select('role, organization_id')
      .eq('id', callerUser.id)
      .maybeSingle();
    if (callerStaffError) throw new Error(`Could not verify caller: ${callerStaffError.message}`);
    if (callerStaff?.role !== 'admin') {
      return jsonResponse({ error: 'Admin access required' }, 403);
    }

    const { staff_user_id } = await req.json() as { staff_user_id: string };
    if (!staff_user_id) {
      return jsonResponse({ error: 'staff_user_id is required' }, 400);
    }

    // Get the target user's auth ID and organization (staff_users.id = auth.users.id)
    const { data: targetStaff, error: targetStaffError } = await supabaseAdmin
      .from('staff_users')
      .select('id, organization_id')
      .eq('id', staff_user_id)
      .maybeSingle();
    if (targetStaffError) throw new Error(`Could not find staff user: ${targetStaffError.message}`);
    if (!targetStaff) {
      return jsonResponse({ error: 'Staff user not found' }, 404);
    }
    if (targetStaff.organization_id !== callerStaff.organization_id) {
      return jsonResponse({ error: 'Organization access denied' }, 403);
    }

    // List and delete all TOTP factors for the target user
    const { data: factors, error: factorsError } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: staff_user_id });
    if (factorsError) throw new Error(`Could not list MFA factors: ${factorsError.message}`);
    if (factors?.factors?.length) {
      for (const factor of factors.factors) {
        const { error: deleteFactorError } = await supabaseAdmin.auth.admin.mfa.deleteFactor({ userId: staff_user_id, id: factor.id });
        if (deleteFactorError) throw new Error(`Could not delete MFA factor: ${deleteFactorError.message}`);
      }
    }

    // Update staff_users record
    const { error: updateError } = await supabaseAdmin.from('staff_users').update({
      mfa_enrolled: false,
      mfa_enrolled_at: null,
    }).eq('id', staff_user_id);
    if (updateError) throw new Error(`Could not update staff MFA status: ${updateError.message}`);

    const forwarded = req.headers.get('x-forwarded-for');
    const { error: auditError } = await supabaseAdmin.from('security_audit_log').insert({
      organization_id: targetStaff?.organization_id ?? null,
      staff_user_id: callerUser.id,
      event_type: 'mfa_admin_reset',
      event_metadata: { target_staff_user_id: staff_user_id },
      ip_address: forwarded ? forwarded.split(',')[0].trim() : undefined,
      user_agent: req.headers.get('user-agent') ?? null,
    });
    if (auditError) throw new Error(`Could not write audit log: ${auditError.message}`);

    return jsonResponse({ success: true, message: 'MFA reset successfully' });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
