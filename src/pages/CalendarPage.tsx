import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Plus, ChevronLeft, ChevronRight, Pencil, Trash2,
  CheckSquare, Square, Paperclip, Users, Calendar, Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameMonth, isSameDay, isToday, startOfWeek, endOfWeek,
  addMonths, subMonths, addWeeks, subWeeks, parseISO, addDays,
} from 'date-fns';
import { RRule } from 'rrule';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchCalendarEvents, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent,
  fetchAllCalendarEvents, uploadCalendarAttachment, deleteCalendarAttachment,
  fetchResources, fetchResourceBookings, createResourceBooking, deleteResourceBooking,
} from '@/services/api';
import type { CalendarEvent, CalendarEventAttachment, Resource, ResourceBooking } from '@/types/types';
import { cn } from '@/lib/utils';
import { supabase } from '@/db/supabase';

// ── Department colour tokens ───────────────────────────────────────────────
const DEPT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  General:    { bg: 'bg-primary/15',   text: 'text-primary',   dot: 'bg-primary' },
  HR:         { bg: 'bg-rose-100',     text: 'text-rose-700',  dot: 'bg-rose-500' },
  Finance:    { bg: 'bg-amber-100',    text: 'text-amber-700', dot: 'bg-amber-500' },
  Operations: { bg: 'bg-teal-100',     text: 'text-teal-700',  dot: 'bg-teal-500' },
};
const DEPARTMENTS = ['General', 'HR', 'Finance', 'Operations'] as const;

// ── Form shape ─────────────────────────────────────────────────────────────
interface EventForm {
  title: string;
  agenda: string;
  start_at: string;
  end_at: string;
  location: string;
  attendees_raw: string;
  department: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  is_task: boolean;
  is_completed: boolean;
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly' | 'custom';
  recurrence_custom: string;
  recurrence_end_date: string;
  reminder: '' | '10' | '30' | '60';
  resource_id: string;
}

const EMPTY_FORM: EventForm = {
  title: '', agenda: '', start_at: '', end_at: '',
  location: '', attendees_raw: '',
  department: 'General', status: 'confirmed',
  is_task: false, is_completed: false,
  recurrence: 'none', recurrence_custom: '', recurrence_end_date: '',
  reminder: '', resource_id: '',
};

/** Build RRULE string from form values */
function buildRRule(form: EventForm): string | null {
  if (form.recurrence === 'none') return null;
  if (form.recurrence === 'custom') return form.recurrence_custom || null;
  const map: Record<string, string> = { daily: 'FREQ=DAILY', weekly: 'FREQ=WEEKLY', monthly: 'FREQ=MONTHLY' };
  let rule = map[form.recurrence];
  if (form.recurrence_end_date) rule += `;UNTIL=${form.recurrence_end_date.replace(/-/g, '')}T000000Z`;
  return rule;
}

/** Expand a recurring event into visible occurrences within a date range */
function expandRecurrences(event: CalendarEvent, rangeStart: Date, rangeEnd: Date): CalendarEvent[] {
  if (!event.recurrence_rule) return [event];
  try {
    const rruleStr = event.recurrence_rule.startsWith('RRULE:')
      ? event.recurrence_rule : `RRULE:${event.recurrence_rule}`;
    const rule = RRule.fromString(`DTSTART:${format(parseISO(event.start_at), "yyyyMMdd'T'HHmmss'Z'")}\n${rruleStr}`);
    const durationMs = parseISO(event.end_at).getTime() - parseISO(event.start_at).getTime();
    const dates = rule.between(rangeStart, rangeEnd, true);
    return dates.map(d => ({
      ...event,
      id: `${event.id}::${d.toISOString()}`,
      start_at: d.toISOString(),
      end_at: new Date(d.getTime() + durationMs).toISOString(),
      parent_event_id: event.id,
    }));
  } catch {
    return [event];
  }
}

// ── Event chip ─────────────────────────────────────────────────────────────
function EventChip({ event, onClick }: { event: CalendarEvent; onClick: () => void }) {
  const c = DEPT_COLORS[event.department] ?? DEPT_COLORS.General;
  const isTask = event.is_task;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        'w-full text-left text-xs px-1.5 py-0.5 rounded transition-colors truncate font-medium flex items-center gap-1',
        c.bg, c.text,
        event.is_completed && 'opacity-50 line-through',
        event.status === 'tentative' && 'border border-dashed',
        event.status === 'cancelled' && 'opacity-40 line-through',
      )}
      title={event.title}
    >
      {isTask && (event.is_completed
        ? <CheckSquare className="w-3 h-3 shrink-0" />
        : <Square className="w-3 h-3 shrink-0" />
      )}
      {!isTask && <span className={cn('w-2 h-2 rounded-full shrink-0', c.dot)} />}
      <span className="truncate">{!isTask && format(parseISO(event.start_at), 'HH:mm')} {event.title}</span>
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function CalendarPage() {
  const { organization, staffUser } = useAuth();
  const [calView, setCalView] = useState<'month' | 'week' | 'freebusy' | 'resources'>('month');
  const [current, setCurrent] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [allEvents, setAllEvents] = useState<CalendarEvent[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [resourceBookings, setResourceBookings] = useState<ResourceBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [deptFilter, setDeptFilter] = useState<string[]>([...DEPARTMENTS]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [viewingEvent, setViewingEvent] = useState<CalendarEvent | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const rangeStart = calView === 'month'
    ? startOfWeek(startOfMonth(current), { weekStartsOn: 1 })
    : startOfWeek(current, { weekStartsOn: 1 });
  const rangeEnd = calView === 'month'
    ? endOfWeek(endOfMonth(current), { weekStartsOn: 1 })
    : endOfWeek(current, { weekStartsOn: 1 });

  const load = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    try {
      const [evs, allEvs, res] = await Promise.all([
        fetchCalendarEvents(organization.id, rangeStart, rangeEnd),
        fetchAllCalendarEvents(organization.id),
        fetchResources(organization.id),
      ]);
      const expanded = evs.flatMap(e => expandRecurrences(e, rangeStart, rangeEnd));
      setEvents(expanded);
      setAllEvents(allEvs);
      setResources(res);

      // Resource bookings for the current week/month
      const bookings = await fetchResourceBookings(organization.id, rangeStart, rangeEnd);
      setResourceBookings(bookings);
    } catch (err) {
      toast.error('Failed to load calendar');
    } finally {
      setLoading(false);
    }
  }, [organization, current, calView]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  // Keep event cards, free/busy and resource overlays current when another
  // collaborator changes a booking in a separate browser.
  useEffect(() => {
    if (!organization) return;
    const channel = supabase.channel(`calendar-data-${organization.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events', filter: `organization_id=eq.${organization.id}` }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resource_bookings' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resources', filter: `organization_id=eq.${organization.id}` }, () => { void load(); })
      .subscribe();
    return () => { void channel.unsubscribe(); };
  }, [organization, load]);

  // ── Supabase Realtime — reminder notifications ───────────────────────────
  useEffect(() => {
    if (!organization) return;
    const channel = supabase
      .channel('calendar-reminders')
      .on('broadcast', { event: 'reminder' }, (payload) => {
        const p = payload.payload as { title: string; start_at: string; minutes_before: number; organization_id: string };
        if (p.organization_id !== organization.id) return;
        const timeStr = format(parseISO(p.start_at), 'HH:mm');
        toast.info(`⏰ Reminder: ${p.title}`, {
          description: `Starting at ${timeStr} — in ${p.minutes_before} minutes`,
          duration: 10000,
        });
      })
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [organization]);

  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
  const visibleEvents = events.filter(e => deptFilter.includes(e.department));

  const getEventsForDay = (day: Date) =>
    visibleEvents.filter(e => isSameDay(parseISO(e.start_at), day));

  // ── Toggle task completion inline ────────────────────────────────────────
  const toggleComplete = async (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    const baseId = event.id.includes('::') ? event.id.split('::')[0] : event.id;
    try {
      await updateCalendarEvent(baseId, { is_completed: !event.is_completed });
      toast.success(event.is_completed ? 'Task reopened' : 'Task completed');
      load();
    } catch {
      toast.error('Failed to update task');
    }
  };

  // ── Open add / edit ──────────────────────────────────────────────────────
  const openAdd = (date?: Date) => {
    setEditing(null); setPendingFiles([]);
    const d = date ?? new Date();
    setForm({ ...EMPTY_FORM, start_at: format(d, "yyyy-MM-dd'T'09:00"), end_at: format(d, "yyyy-MM-dd'T'10:00") });
    setDialogOpen(true);
  };

  const openEdit = (e: CalendarEvent) => {
    setEditing(e); setPendingFiles([]);
    const rrule = e.recurrence_rule;
    let recurrence: EventForm['recurrence'] = 'none';
    if (rrule) {
      if (rrule.includes('FREQ=DAILY')) recurrence = 'daily';
      else if (rrule.includes('FREQ=WEEKLY')) recurrence = 'weekly';
      else if (rrule.includes('FREQ=MONTHLY')) recurrence = 'monthly';
      else recurrence = 'custom';
    }
    setForm({
      title: e.title,
      agenda: e.agenda ?? e.description ?? '',
      start_at: format(parseISO(e.start_at), "yyyy-MM-dd'T'HH:mm"),
      end_at: format(parseISO(e.end_at), "yyyy-MM-dd'T'HH:mm"),
      location: e.location ?? '',
      attendees_raw: e.attendees?.join(', ') ?? '',
      department: e.department ?? 'General',
      status: e.status ?? 'confirmed',
      is_task: e.is_task ?? false,
      is_completed: e.is_completed ?? false,
      recurrence,
      recurrence_custom: recurrence === 'custom' ? (rrule ?? '') : '',
      recurrence_end_date: e.recurrence_end_date ?? '',
      reminder: (e.reminder_minutes_before ? String(e.reminder_minutes_before) : '') as EventForm['reminder'],
      resource_id: e.resource_bookings?.[0]?.resource_id ?? '',
    });
    setViewingEvent(null);
    setDialogOpen(true);
  };

  // ── Check resource conflict ──────────────────────────────────────────────
  const checkResourceConflict = async (resourceId: string, start: string, end: string, excludeEventId?: string): Promise<string | null> => {
    if (!resourceId) return null;
    const { data } = await supabase
      .from('resource_bookings')
      .select('*, calendar_events(title)')
      .eq('resource_id', resourceId)
      .lt('start_at', end)
      .gt('end_at', start);
    const conflicts = (data ?? []).filter((b: ResourceBooking & { calendar_events?: { title: string } }) =>
      b.calendar_event_id !== excludeEventId
    );
    if (conflicts.length) {
      const c = conflicts[0] as ResourceBooking & { calendar_events?: { title: string } };
      return `Already booked: "${c.calendar_events?.title ?? 'another event'}"`;
    }
    return null;
  };

  // ── Save event ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.title || !form.start_at || !form.end_at) {
      toast.error('Title, start and end are required'); return;
    }
    const startIso = new Date(form.start_at).toISOString();
    const endIso = new Date(form.end_at).toISOString();

    // Resource conflict check
    if (form.resource_id) {
      const conflict = await checkResourceConflict(form.resource_id, startIso, endIso, editing?.id);
      if (conflict) { toast.error(`Resource conflict: ${conflict}`); return; }
    }

    setSaving(true);
    try {
      const payload = {
        title: form.title,
        agenda: form.agenda || null,
        description: form.agenda || null,
        start_at: startIso,
        end_at: endIso,
        location: form.location || null,
        attendees: form.attendees_raw.split(',').map(s => s.trim()).filter(Boolean),
        department: form.department as CalendarEvent['department'],
        status: form.status,
        is_task: form.is_task,
        is_completed: form.is_completed,
        recurrence_rule: buildRRule(form),
        recurrence_end_date: form.recurrence_end_date || null,
        parent_event_id: null as string | null,
        reminder_minutes_before: form.reminder ? parseInt(form.reminder) : null,
        organization_id: organization!.id,
        created_by: staffUser!.id,
        reminder_sent_at: null as string | null,
      };

      let eventId: string;
      if (editing) {
        const baseId = editing.id.includes('::') ? editing.id.split('::')[0] : editing.id;
        await updateCalendarEvent(baseId, payload);
        eventId = baseId;
        // Re-create resource booking
        await deleteResourceBooking(baseId);
        toast.success('Event updated');
      } else {
        const created = await createCalendarEvent(payload);
        eventId = created.id;
        toast.success('Event created');
      }

      // Save resource booking
      if (form.resource_id && eventId) {
        await createResourceBooking({ resource_id: form.resource_id, calendar_event_id: eventId, start_at: startIso, end_at: endIso });
      }

      // Upload pending attachments
      for (const file of pendingFiles) {
        await uploadCalendarAttachment(eventId, file);
      }

      setDialogOpen(false);
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteCalendarEvent(deleteId);
    toast.success('Event deleted');
    setDeleteId(null); setViewingEvent(null);
    load();
  };

  const handleDeleteAttachment = async (att: CalendarEventAttachment) => {
    await deleteCalendarAttachment(att.id, att.storage_path);
    toast.success('Attachment removed');
    load();
  };

  const nav = (dir: 1 | -1) => {
    if (calView === 'month') setCurrent(dir === 1 ? addMonths(current, 1) : subMonths(current, 1));
    else setCurrent(dir === 1 ? addWeeks(current, 1) : subWeeks(current, 1));
  };

  // ── Free/Busy helpers ────────────────────────────────────────────────────
  const staffEmails = Array.from(new Set(allEvents.flatMap(e => [
    ...(e.attendees ?? []),
  ]))).filter(Boolean).sort();

  const getBusyBlocks = (email: string, day: Date) =>
    allEvents.filter(e =>
      isSameDay(parseISO(e.start_at), day) &&
      (e.attendees?.includes(email) || e.created_by === staffUser?.id)
    );

  // ── Resource availability ────────────────────────────────────────────────
  const getResourceBookingsForDay = (resourceId: string, day: Date) =>
    resourceBookings.filter(b => b.resource_id === resourceId && isSameDay(parseISO(b.start_at), day));

  // ── Week days for free/busy ──────────────────────────────────────────────
  const weekDays = eachDayOfInterval({
    start: startOfWeek(current, { weekStartsOn: 1 }),
    end: addDays(startOfWeek(current, { weekStartsOn: 1 }), 6),
  });

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card px-4 py-3 flex items-center gap-2 shrink-0 flex-wrap">
        <Link to="/inbox">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
        </Link>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => nav(-1)}><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-sm font-semibold w-40 text-center">
            {calView === 'month' ? format(current, 'MMMM yyyy') : `Week of ${format(startOfWeek(current, { weekStartsOn: 1 }), 'dd MMM')}`}
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => nav(1)}><ChevronRight className="w-4 h-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setCurrent(new Date())}>Today</Button>
        </div>
        <div className="flex-1" />
        {/* Dept filter pills */}
        <div className="hidden md:flex items-center gap-1 flex-wrap">
          {DEPARTMENTS.map(dept => {
            const c = DEPT_COLORS[dept];
            const active = deptFilter.includes(dept);
            return (
              <button
                key={dept}
                onClick={() => setDeptFilter(f => active ? f.filter(d => d !== dept) : [...f, dept])}
                className={cn(
                  'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-opacity',
                  c.bg, c.text,
                  !active && 'opacity-30',
                )}
              >
                <span className={cn('w-2 h-2 rounded-full', c.dot)} />{dept}
              </button>
            );
          })}
        </div>
        <Tabs value={calView} onValueChange={v => setCalView(v as typeof calView)}>
          <TabsList className="h-8">
            <TabsTrigger value="month" className="text-xs"><Calendar className="w-3 h-3 mr-1" />Month</TabsTrigger>
            <TabsTrigger value="week" className="text-xs"><Calendar className="w-3 h-3 mr-1" />Week</TabsTrigger>
            <TabsTrigger value="freebusy" className="text-xs"><Users className="w-3 h-3 mr-1" />Free/Busy</TabsTrigger>
            <TabsTrigger value="resources" className="text-xs"><Layers className="w-3 h-3 mr-1" />Resources</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button size="sm" onClick={() => openAdd()}><Plus className="w-4 h-4 mr-1" /> New</Button>
      </div>

      {/* ── Month / Week grid ───────────────────────────────────────────── */}
      {(calView === 'month' || calView === 'week') && (
        <div className="flex-1 p-4 overflow-auto min-h-0">
          <div className="grid grid-cols-7 mb-1">
            {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
              <div key={d} className="text-xs font-medium text-muted-foreground text-center py-1">{d}</div>
            ))}
          </div>
          <div className={cn('grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden', calView === 'week' && 'h-[calc(100vh-200px)]')}>
            {days.map(day => {
              const dayEvents = getEventsForDay(day);
              const inMonth = calView === 'month' ? isSameMonth(day, current) : true;
              return (
                <div
                  key={day.toISOString()}
                  className={cn('bg-card p-1.5 cursor-pointer hover:bg-muted/40 transition-colors min-h-[80px]', !inMonth && 'bg-muted/20', calView === 'week' && 'min-h-0')}
                  onClick={() => openAdd(day)}
                >
                  <div className={cn('text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1', isToday(day) ? 'bg-primary text-primary-foreground' : inMonth ? 'text-foreground' : 'text-muted-foreground')}>
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, calView === 'month' ? 3 : 10).map(e => (
                      <div key={e.id} className="flex items-center gap-0.5">
                        {e.is_task && (
                          <button
                            onClick={(ev) => toggleComplete(e, ev)}
                            className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                          >
                            {e.is_completed ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        <EventChip event={e} onClick={() => {
                          const baseId = e.id.includes('::') ? e.id.split('::')[0] : e.id;
                          const orig = events.find(ev => ev.id === baseId || ev.id === e.id) ?? e;
                          setViewingEvent(orig);
                        }} />
                      </div>
                    ))}
                    {calView === 'month' && dayEvents.length > 3 && (
                      <p className="text-xs text-muted-foreground pl-1">+{dayEvents.length - 3} more</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Free/Busy view ──────────────────────────────────────────────── */}
      {calView === 'freebusy' && (
        <div className="flex-1 p-4 overflow-auto min-h-0">
          <h2 className="text-sm font-semibold mb-3 text-muted-foreground">Team Availability — {format(weekDays[0], 'dd MMM')} to {format(weekDays[6], 'dd MMM yyyy')}</h2>
          <div className="overflow-x-auto">
            <table className="min-w-max w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="text-left px-3 py-2 text-muted-foreground font-medium min-w-[140px] whitespace-nowrap">Staff</th>
                  {weekDays.map(d => (
                    <th key={d.toISOString()} className={cn('px-2 py-2 text-center font-medium whitespace-nowrap min-w-[80px]', isToday(d) && 'text-primary')}>
                      {format(d, 'EEE d')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staffEmails.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No event attendees found for this period</td></tr>
                )}
                {staffEmails.map(email => (
                  <tr key={email} className="border-t border-border">
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[140px]" title={email}>{email}</td>
                    {weekDays.map(d => {
                      const blocks = getBusyBlocks(email, d);
                      return (
                        <td key={d.toISOString()} className="px-1 py-1 text-center align-middle">
                          {blocks.length === 0 ? (
                            <span className="inline-block w-12 h-5 rounded bg-green-100 text-green-700 text-[10px] leading-5">Free</span>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              {blocks.map(b => (
                                <span
                                  key={b.id}
                                  title={`${b.title} (${format(parseISO(b.start_at), 'HH:mm')}–${format(parseISO(b.end_at), 'HH:mm')})`}
                                  className={cn(
                                    'inline-block w-12 h-5 rounded text-[10px] leading-5',
                                    b.status === 'tentative'
                                      ? 'bg-amber-100 text-amber-700 border border-dashed border-amber-400'
                                      : b.status === 'cancelled'
                                        ? 'bg-muted text-muted-foreground line-through'
                                        : 'bg-rose-100 text-rose-700',
                                  )}
                                >
                                  {b.status === 'tentative' ? 'Tentative' : 'Busy'}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Resource availability view ──────────────────────────────────── */}
      {calView === 'resources' && (
        <div className="flex-1 p-4 overflow-auto min-h-0">
          <h2 className="text-sm font-semibold mb-3 text-muted-foreground">Resource Availability — {format(weekDays[0], 'dd MMM')} to {format(weekDays[6], 'dd MMM yyyy')}</h2>
          {resources.filter(r => r.is_active).length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Layers className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No active resources yet.</p>
              {staffUser?.role === 'admin' && (
                <Link to="/admin/resources">
                  <Button size="sm" className="mt-3">Manage Resources</Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-max w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="text-left px-3 py-2 text-muted-foreground font-medium min-w-[160px] whitespace-nowrap">Resource</th>
                    {weekDays.map(d => (
                      <th key={d.toISOString()} className={cn('px-2 py-2 text-center font-medium whitespace-nowrap min-w-[90px]', isToday(d) && 'text-primary')}>
                        {format(d, 'EEE d')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resources.filter(r => r.is_active).map(resource => (
                    <tr key={resource.id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <div className="font-medium truncate">{resource.name}</div>
                        <div className="text-muted-foreground capitalize">{resource.type}</div>
                      </td>
                      {weekDays.map(d => {
                        const bookings = getResourceBookingsForDay(resource.id, d);
                        return (
                          <td key={d.toISOString()} className="px-1 py-1 text-center">
                            {bookings.length === 0 ? (
                              <span className="inline-block w-16 h-5 rounded bg-green-100 text-green-700 text-[10px] leading-5">Available</span>
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                {bookings.map(b => (
                                  <span
                                    key={b.id}
                                    title={`${(b.calendar_events as { title: string } | undefined)?.title ?? 'Booked'} (${format(parseISO(b.start_at), 'HH:mm')}–${format(parseISO(b.end_at), 'HH:mm')})`}
                                    className="inline-block w-16 h-5 rounded bg-rose-100 text-rose-700 text-[10px] leading-5 truncate px-1"
                                  >
                                    {(b.calendar_events as { title: string } | undefined)?.title ?? 'Booked'}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── View Event Dialog ───────────────────────────────────────────── */}
      {viewingEvent && (
        <Dialog open onOpenChange={o => !o && setViewingEvent(null)}>
          <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <span className={cn('w-3 h-3 rounded-full', DEPT_COLORS[viewingEvent.department]?.dot ?? 'bg-primary')} />
                <DialogTitle className="flex-1 min-w-0">{viewingEvent.title}</DialogTitle>
                <Badge variant="outline" className="text-xs capitalize shrink-0">{viewingEvent.status}</Badge>
              </div>
            </DialogHeader>
            <div className="space-y-2 py-2 text-sm">
              <p className="text-muted-foreground">
                {format(parseISO(viewingEvent.start_at), 'dd MMM yyyy, HH:mm')} – {format(parseISO(viewingEvent.end_at), 'HH:mm')}
              </p>
              {viewingEvent.location && <p>📍 {viewingEvent.location}</p>}
              {(viewingEvent.agenda || viewingEvent.description) && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-0.5">Agenda</p>
                  <p className="text-muted-foreground">{viewingEvent.agenda ?? viewingEvent.description}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-1 items-center">
                <Badge variant="secondary" className="text-xs">{viewingEvent.department}</Badge>
                {viewingEvent.is_task && <Badge variant="outline" className="text-xs">Task</Badge>}
                {viewingEvent.recurrence_rule && <Badge variant="outline" className="text-xs">Recurring</Badge>}
                {viewingEvent.reminder_minutes_before && (
                  <Badge variant="outline" className="text-xs">⏰ {viewingEvent.reminder_minutes_before}min reminder</Badge>
                )}
              </div>
              {viewingEvent.attendees?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {viewingEvent.attendees.map(a => <Badge key={a} variant="secondary" className="text-xs">{a}</Badge>)}
                </div>
              )}
              {/* Resource bookings */}
              {viewingEvent.resource_bookings && viewingEvent.resource_bookings.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-0.5">Booked Resource</p>
                  {viewingEvent.resource_bookings.map(rb => (
                    <p key={rb.id} className="text-sm">{(rb.resources as Resource | undefined)?.name ?? rb.resource_id}</p>
                  ))}
                </div>
              )}
              {/* Attachments */}
              {viewingEvent.calendar_event_attachments && viewingEvent.calendar_event_attachments.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1"><Paperclip className="w-3 h-3" /> Attachments</p>
                  <div className="space-y-1">
                    {viewingEvent.calendar_event_attachments.map(att => (
                      <div key={att.id} className="flex items-center justify-between gap-2">
                        <a
                          href={supabase.storage.from('attachments').getPublicUrl(att.storage_path).data.publicUrl}
                          target="_blank" rel="noreferrer"
                          className="text-xs text-primary hover:underline truncate flex-1 min-w-0"
                        >{att.filename}</a>
                        <button
                          onClick={() => handleDeleteAttachment(att)}
                          className="text-destructive hover:text-destructive/80 shrink-0"
                        ><Trash2 className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter className="flex-row justify-between">
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { setDeleteId(viewingEvent.id.includes('::') ? viewingEvent.id.split('::')[0] : viewingEvent.id); }}>
                <Trash2 className="w-4 h-4 mr-1" /> Delete
              </Button>
              <Button size="sm" onClick={() => openEdit(viewingEvent)}>
                <Pencil className="w-4 h-4 mr-1" /> Edit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Add/Edit Event Dialog ───────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit Event' : 'New Event'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            {/* Title */}
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Meeting title…" />
            </div>
            {/* Times */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start *</Label>
                <Input type="datetime-local" value={form.start_at} onChange={e => setForm(p => ({ ...p, start_at: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>End *</Label>
                <Input type="datetime-local" value={form.end_at} onChange={e => setForm(p => ({ ...p, end_at: e.target.value }))} />
              </div>
            </div>
            {/* Location */}
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="Office, Zoom, etc." />
            </div>
            {/* Agenda */}
            <div className="space-y-1.5">
              <Label>Agenda</Label>
              <Textarea value={form.agenda} onChange={e => setForm(p => ({ ...p, agenda: e.target.value }))} rows={2} placeholder="Meeting agenda…" />
            </div>
            {/* Attendees */}
            <div className="space-y-1.5">
              <Label>Attendees (comma-separated emails)</Label>
              <Input value={form.attendees_raw} onChange={e => setForm(p => ({ ...p, attendees_raw: e.target.value }))} placeholder="a@co.com, b@co.com" />
            </div>
            {/* Department & Status */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Select value={form.department} onValueChange={v => setForm(p => ({ ...p, department: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v as EventForm['status'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="tentative">Tentative</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Task + completed */}
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox checked={form.is_task} onCheckedChange={v => setForm(p => ({ ...p, is_task: !!v }))} />
                Mark as Task
              </label>
              {form.is_task && (
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <Checkbox checked={form.is_completed} onCheckedChange={v => setForm(p => ({ ...p, is_completed: !!v }))} />
                  Completed
                </label>
              )}
            </div>
            {/* Recurrence */}
            <div className="space-y-1.5">
              <Label>Recurrence</Label>
              <Select value={form.recurrence} onValueChange={v => setForm(p => ({ ...p, recurrence: v as EventForm['recurrence'] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="custom">Custom (RRULE)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.recurrence === 'custom' && (
              <div className="space-y-1.5">
                <Label>RRULE string</Label>
                <Input value={form.recurrence_custom} onChange={e => setForm(p => ({ ...p, recurrence_custom: e.target.value }))} placeholder="FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10" />
              </div>
            )}
            {form.recurrence !== 'none' && (
              <div className="space-y-1.5">
                <Label>Recurrence end date (optional)</Label>
                <Input type="date" value={form.recurrence_end_date} onChange={e => setForm(p => ({ ...p, recurrence_end_date: e.target.value }))} />
              </div>
            )}
            {/* Reminder */}
            <div className="space-y-1.5">
              <Label>Reminder</Label>
              <Select value={form.reminder || 'none'} onValueChange={v => setForm(p => ({ ...p, reminder: v === 'none' ? '' : v as EventForm['reminder'] }))}>
                <SelectTrigger><SelectValue placeholder="No reminder" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No reminder</SelectItem>
                  <SelectItem value="10">10 minutes before</SelectItem>
                  <SelectItem value="30">30 minutes before</SelectItem>
                  <SelectItem value="60">60 minutes before</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Resource booking */}
            {resources.filter(r => r.is_active).length > 0 && (
              <div className="space-y-1.5">
                <Label>Book a Resource (optional)</Label>
                <Select value={form.resource_id || 'none'} onValueChange={v => setForm(p => ({ ...p, resource_id: v === 'none' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Select resource" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {resources.filter(r => r.is_active).map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.name} ({r.type})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* Attachments */}
            <div className="space-y-1.5">
              <Label>Attachments</Label>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <Paperclip className="w-3.5 h-3.5 mr-1" /> Attach file
                </Button>
                <input ref={fileRef} type="file" className="hidden" multiple onChange={e => setPendingFiles(f => [...f, ...Array.from(e.target.files ?? [])])} />
              </div>
              {pendingFiles.length > 0 && (
                <div className="space-y-1 mt-1">
                  {pendingFiles.map((f, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-muted-foreground">{f.name}</span>
                      <button onClick={() => setPendingFiles(p => p.filter((_, j) => j !== i))} className="text-destructive shrink-0">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : (editing ? 'Save' : 'Create Event')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ──────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Event</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete this calendar event and its attachments.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
