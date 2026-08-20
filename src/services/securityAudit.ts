import { supabase } from '@/db/supabase';

export async function logSecurityEvent(
  eventType: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return;

    await supabase.functions.invoke('log-security-event', {
      body: { event_type: eventType, metadata },
    });
  } catch {
    // Silent fail — security audit logging must not block UX
  }
}
