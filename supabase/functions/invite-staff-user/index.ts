import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const getBearerToken = (req: Request) => {
  const authHeader = req.headers.get('Authorization');
  const [scheme, token] = authHeader?.split(' ') ?? [];
  return scheme?.toLowerCase() === 'bearer' ? token : null;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = getBearerToken(req);
    if (!token) return jsonResponse({ error: 'Missing authorization header' }, 401);

    const { data: { user: callerUser }, error: callerError } = await adminSupabase.auth.getUser(token);
    if (callerError || !callerUser) return jsonResponse({ error: 'Unauthorized' }, 401);

    const { data: callerStaff, error: callerStaffError } = await adminSupabase
      .from('staff_users')
      .select('id, organization_id, role')
      .eq('id', callerUser.id)
      .maybeSingle();
    if (callerStaffError) throw new Error(`Could not verify caller: ${callerStaffError.message}`);
    if (!callerStaff || callerStaff.role !== 'admin') {
      return jsonResponse({ error: 'Admin access required' }, 403);
    }

    const { email, full_name, role, organization_id } = await req.json();
    if (!email || !full_name || !organization_id) {
      return jsonResponse({ error: 'email, full_name, organization_id required' }, 400);
    }
    if (organization_id !== callerStaff.organization_id) {
      return jsonResponse({ error: 'Organization access denied' }, 403);
    }
    if (role && !['admin', 'staff'].includes(role)) {
      return jsonResponse({ error: 'role must be admin or staff' }, 400);
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

    return jsonResponse({ success: true, user_id: authData.user.id });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
