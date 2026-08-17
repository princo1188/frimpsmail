import { supabase } from '@/db/supabase';

const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1/log-security-event`;

export async function logSecurityEvent(
  eventType: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return;

    await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionData.session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
      },
      body: JSON.stringify({ event_type: eventType, metadata }),
    });
  } catch {
    // Silent fail — security audit logging must not block UX
  }
}
