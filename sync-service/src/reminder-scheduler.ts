import { SupabaseClient } from '@supabase/supabase-js';

const REMINDER_CHECK_INTERVAL = 2 * 60 * 1000; // 2 minutes

/**
 * Check for calendar events whose reminder time has arrived but hasn't been sent.
 * Delivers an in-app notification via Supabase Realtime by inserting into a
 * calendar_reminders_sent channel broadcast, which the frontend subscribes to.
 */
export async function checkDueReminders(supabase: SupabaseClient): Promise<void> {
  const now = new Date();

  // Find events where reminder window has arrived (start_at - reminder_minutes_before <= now)
  // and reminder_sent_at is null
  const { data: events, error } = await supabase
    .from('calendar_events')
    .select('id, title, start_at, agenda, reminder_minutes_before, organization_id, created_by, attendees')
    .not('reminder_minutes_before', 'is', null)
    .is('reminder_sent_at', null)
    .gt('start_at', now.toISOString()); // only future events

  if (error) {
    console.error('[REMINDER] Failed to fetch events:', error);
    return;
  }

  if (!events?.length) return;

  for (const event of events) {
    const startAt = new Date(event.start_at);
    const reminderAt = new Date(startAt.getTime() - (event.reminder_minutes_before as number) * 60 * 1000);

    if (reminderAt <= now) {
      try {
        // Broadcast the reminder notification via Supabase Realtime
        await supabase.channel('calendar-reminders').send({
          type: 'broadcast',
          event: 'reminder',
          payload: {
            event_id: event.id,
            title: event.title,
            start_at: event.start_at,
            minutes_before: event.reminder_minutes_before,
            organization_id: event.organization_id,
          },
        });

        // Mark reminder as sent to prevent re-delivery
        await supabase
          .from('calendar_events')
          .update({ reminder_sent_at: now.toISOString() })
          .eq('id', event.id);

        console.log(`[REMINDER] Sent reminder for event "${event.title}" (starts ${event.start_at})`);
      } catch (err) {
        console.error(`[REMINDER] Failed to send reminder for event ${event.id}:`, err);
        // Mark reminder as sent even on error to avoid notification spam
        await supabase
          .from('calendar_events')
          .update({ reminder_sent_at: now.toISOString() })
          .eq('id', event.id)
          .then(() => { /* best effort */ }, () => { /* ignore */ });
      }
    }
  }
}

/** Start the reminder scheduler loop — runs every 2 minutes */
export function scheduleReminders(supabase: SupabaseClient): () => void {
  console.log('[REMINDER] Scheduler started — checking every 2 minutes');
  // Run immediately on start, then on interval
  checkDueReminders(supabase).catch(err => console.error('[REMINDER] Initial check error:', err));
  const timer = setInterval(() => {
    checkDueReminders(supabase).catch(err => console.error('[REMINDER] Check error:', err));
  }, REMINDER_CHECK_INTERVAL);
  return () => clearInterval(timer);
}
