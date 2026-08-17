import { SupabaseClient } from '@supabase/supabase-js';
import { createEvent, EventAttributes } from 'ics';
import { SmtpClient } from './smtp-client';

interface IcsEventOptions {
  id: string;
  title: string;
  agenda?: string | null;
  location?: string | null;
  start_at: string;
  end_at: string;
  recurrence_rule?: string | null;
  organizer_email: string;
  organizer_name?: string | null;
  attendees: string[];
}

/** Convert ISO date string to ics date tuple [year, month, day, hour, min] */
function toIcsTuple(iso: string): [number, number, number, number, number] {
  const d = new Date(iso);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()];
}

/** Generate a .ics buffer for a calendar event */
export function generateIcsForEvent(opts: IcsEventOptions): Buffer {
  const eventObj: EventAttributes = {
    uid: `${opts.id}@frimpsoil.com.gh`,
    start: toIcsTuple(opts.start_at),
    end: toIcsTuple(opts.end_at),
    title: opts.title,
    description: opts.agenda ?? '',
    location: opts.location ?? '',
    organizer: { name: opts.organizer_name ?? opts.organizer_email, email: opts.organizer_email },
    attendees: opts.attendees.map(email => ({ email, rsvp: true })),
    status: 'CONFIRMED',
    method: 'REQUEST',
    ...(opts.recurrence_rule ? { recurrenceRule: opts.recurrence_rule.replace(/^RRULE:/i, '') } : {}),
  };

  const { error, value } = createEvent(eventObj);
  if (error || !value) throw new Error(`ICS generation failed: ${error}`);
  return Buffer.from(value, 'utf8');
}

/** Determine which attendees are external (not staff members of the org) */
async function getExternalAttendees(supabase: SupabaseClient, orgId: string, attendees: string[]): Promise<string[]> {
  if (!attendees.length) return [];

  // Get all staff emails for this org
  const { data: staffMailboxes } = await supabase
    .from('mailboxes')
    .select('email_address')
    .eq('organization_id', orgId);

  const staffEmails = new Set((staffMailboxes ?? []).map((m: { email_address: string }) => m.email_address.toLowerCase()));
  return attendees.filter(a => !staffEmails.has(a.toLowerCase()));
}

/** Send a .ics invite email to all external attendees of a calendar event */
export async function sendIcsInvite(
  supabase: SupabaseClient,
  smtp: SmtpClient,
  event: {
    id: string;
    title: string;
    agenda?: string | null;
    location?: string | null;
    start_at: string;
    end_at: string;
    recurrence_rule?: string | null;
    attendees: string[];
    organization_id: string;
  },
  organizer: { email: string; name?: string | null },
): Promise<void> {
  const externalAttendees = await getExternalAttendees(supabase, event.organization_id, event.attendees);
  if (!externalAttendees.length) return;

  let icsBuffer: Buffer;
  try {
    icsBuffer = generateIcsForEvent({
      id: event.id,
      title: event.title,
      agenda: event.agenda,
      location: event.location,
      start_at: event.start_at,
      end_at: event.end_at,
      recurrence_rule: event.recurrence_rule,
      organizer_email: organizer.email,
      organizer_name: organizer.name,
      attendees: event.attendees,
    });
  } catch (err) {
    console.error(`[ICS] Failed to generate .ics for event ${event.id}:`, err);
    return;
  }

  const startFormatted = new Date(event.start_at).toLocaleString('en-GB', {
    dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC',
  });

  const bodyHtml = `
    <p>You have been invited to the following event:</p>
    <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;">
      <tr><td style="font-weight:bold;color:#666">Event</td><td>${event.title}</td></tr>
      <tr><td style="font-weight:bold;color:#666">When</td><td>${startFormatted} (UTC)</td></tr>
      ${event.location ? `<tr><td style="font-weight:bold;color:#666">Where</td><td>${event.location}</td></tr>` : ''}
      ${event.agenda ? `<tr><td style="font-weight:bold;color:#666">Agenda</td><td>${event.agenda}</td></tr>` : ''}
    </table>
    <p style="margin-top:16px">Please find the calendar invite (.ics) attached. Open it to add this event to your calendar.</p>
  `;

  try {
    await smtp.sendMail({
      to: externalAttendees,
      subject: `Calendar Invite: ${event.title}`,
      htmlBody: bodyHtml,
      attachments: [{
        filename: 'invite.ics',
        content: icsBuffer,
        mimeType: 'text/calendar; method=REQUEST',
      }],
    });
    console.log(`[ICS] Sent invite for "${event.title}" to: ${externalAttendees.join(', ')}`);
  } catch (err) {
    console.error(`[ICS] Failed to send invite for event ${event.id}:`, err);
  }
}
