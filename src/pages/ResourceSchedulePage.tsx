import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Calendar, Clock, Info, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { fetchResources, fetchResourceBookings } from '@/services/api';
import type { Resource, ResourceBooking } from '@/types/types';
import {
  format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval,
  isToday, parseISO,
} from 'date-fns';
import { cn } from '@/lib/utils';

const TYPE_LABELS: Record<string, string> = {
  room: 'Room',
  vehicle: 'Vehicle',
  equipment: 'Equipment',
  other: 'Other',
};

export default function ResourceSchedulePage() {
  const { organization } = useAuth();
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [resources, setResources] = useState<Resource[]>([]);
  const [bookings, setBookings] = useState<ResourceBooking[]>([]);
  const [loading, setLoading] = useState(true);

  const rangeStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const rangeEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

  const load = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    try {
      const [res, bks] = await Promise.all([
        fetchResources(organization.id),
        fetchResourceBookings(organization.id, rangeStart, rangeEnd),
      ]);
      setResources(res.filter(r => r.is_active));
      setBookings(bks);
    } catch {
      // silent fail — page is read-only
    } finally {
      setLoading(false);
    }
  }, [organization, currentWeek]);

  useEffect(() => { load(); }, [load]);

  const getBookingsFor = (resourceId: string, day: Date) =>
    bookings.filter(b => {
      const start = parseISO(b.start_at);
      const end = parseISO(b.end_at);
      const sameDay = start.toDateString() === day.toDateString();
      return b.resource_id === resourceId && sameDay && start <= end;
    });

  const grouped = resources.reduce<Record<string, Resource[]>>((acc, r) => {
    const type = r.type ?? 'other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(r);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0">
        <Button variant="ghost" size="icon" asChild className="shrink-0">
          <Link to="/inbox"><ArrowLeft className="w-5 h-5" /></Link>
        </Button>
        <Calendar className="w-5 h-5 text-primary shrink-0" />
        <h1 className="text-base font-semibold truncate">Resource Booking Schedule</h1>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium w-48 text-center">
            {format(rangeStart, 'dd MMM')} — {format(rangeEnd, 'dd MMM yyyy')}
          </span>
          <Button variant="ghost" size="icon" onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentWeek(new Date())}>Today</Button>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6 overflow-y-auto">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">This Week’s Bookings</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">Loading schedule…</div>
            ) : resources.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
                No active resources configured yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-max w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left px-3 py-2 text-muted-foreground font-medium min-w-[160px] whitespace-nowrap sticky left-0 bg-card z-10">Resource</th>
                      {days.map(d => (
                        <th key={d.toISOString()} className={cn('px-2 py-2 text-center font-medium whitespace-nowrap min-w-[120px]', isToday(d) && 'text-primary')}>
                          <div>{format(d, 'EEE')}</div>
                          <div className={cn('inline-flex items-center justify-center w-6 h-6 rounded-full mt-1', isToday(d) && 'bg-primary text-primary-foreground')}>{format(d, 'd')}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(grouped).flatMap(([type, items]) => (
                      <>
                        <tr key={type} className="bg-muted/40">
                          <td colSpan={8} className="px-3 py-1.5 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                            {TYPE_LABELS[type] ?? type}
                          </td>
                        </tr>
                        {items.map(resource => (
                          <tr key={resource.id} className="border-b border-border last:border-0">
                            <td className="px-3 py-3 align-top sticky left-0 bg-card z-10">
                              <div className="font-medium text-sm">{resource.name}</div>
                              {resource.description && (
                                <div className="flex items-center gap-1 text-muted-foreground mt-0.5">
                                  <Info className="w-3 h-3" /> {resource.description}
                                </div>
                              )}
                            </td>
                            {days.map(day => {
                              const dayBookings = getBookingsFor(resource.id, day);
                              return (
                                <td key={day.toISOString()} className="px-2 py-2 align-top border-l border-border">
                                  <div className="space-y-1 min-h-[48px]">
                                    {dayBookings.map(b => (
                                      <div
                                        key={b.id}
                                        className="px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20"
                                      >
                                        <div className="font-medium truncate">{b.calendar_events?.title ?? 'Booking'}</div>
                                        <div className="flex items-center gap-1 text-[10px] opacity-80">
                                          <Clock className="w-3 h-3" />
                                          {format(parseISO(b.start_at), 'HH:mm')}–{format(parseISO(b.end_at), 'HH:mm')}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
