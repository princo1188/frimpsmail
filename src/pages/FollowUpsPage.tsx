import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock, MailOpen, Plus, Search, Trash2 } from 'lucide-react';
import { format, isPast, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { createFollowUpTask, fetchPendingFollowUps, updateFollowUp } from '@/services/api';
import type { FollowUpReminder } from '@/types/types';
import { cn } from '@/lib/utils';

const EMPTY_FORM = {
  title: '',
  note: '',
  remind_at: '',
  due_at: '',
  priority: 'normal' as FollowUpReminder['priority'],
};

const priorityClasses: Record<FollowUpReminder['priority'], string> = {
  low: 'bg-muted text-muted-foreground',
  normal: 'bg-primary/10 text-primary',
  high: 'bg-amber-100 text-amber-700',
  urgent: 'bg-destructive/10 text-destructive',
};

export default function FollowUpsPage() {
  const { staffUser } = useAuth();
  const [items, setItems] = useState<FollowUpReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [priority, setPriority] = useState<'all' | FollowUpReminder['priority']>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!staffUser) return;
    setLoading(true);
    try {
      setItems(await fetchPendingFollowUps(staffUser.id));
    } catch (error) {
      console.error(error);
      toast.error('Could not load follow-ups');
    } finally {
      setLoading(false);
    }
  }, [staffUser]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(item => {
      const title = item.title ?? item.threads?.subject ?? '(no subject)';
      const text = `${title} ${item.note ?? ''} ${item.threads?.participants?.join(' ') ?? ''}`.toLowerCase();
      return (!q || text.includes(q)) && (priority === 'all' || item.priority === priority);
    });
  }, [items, priority, query]);

  const counts = useMemo(() => ({
    overdue: items.filter(item => isPast(parseISO(item.due_at ?? item.remind_at))).length,
    urgent: items.filter(item => item.priority === 'urgent').length,
  }), [items]);

  const handleCreate = async () => {
    if (!staffUser) return;
    if (!form.title.trim() || !form.remind_at) {
      toast.error('Title and reminder time are required');
      return;
    }
    setSaving(true);
    try {
      await createFollowUpTask({
        staff_user_id: staffUser.id,
        title: form.title.trim(),
        note: form.note.trim() || null,
        remind_at: new Date(form.remind_at).toISOString(),
        due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
        priority: form.priority,
      });
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      await load();
      toast.success('Follow-up task created');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create follow-up');
    } finally {
      setSaving(false);
    }
  };

  const complete = async (item: FollowUpReminder) => {
    await updateFollowUp(item.id, { completed_at: new Date().toISOString(), is_dismissed: true });
    setItems(prev => prev.filter(existing => existing.id !== item.id));
    toast.success('Follow-up completed');
  };

  const dismiss = async (item: FollowUpReminder) => {
    await updateFollowUp(item.id, { is_dismissed: true });
    setItems(prev => prev.filter(existing => existing.id !== item.id));
    toast.success('Follow-up dismissed');
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card px-6 py-4 flex items-center gap-4">
        <Link to="/inbox"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button></Link>
        <h1 className="text-lg font-semibold">Follow-ups</h1>
        <div className="flex-1" />
        <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-2" /> New Task</Button>
      </div>

      <div className="max-w-5xl mx-auto p-6 space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Pending</p><p className="text-2xl font-semibold">{items.length}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Overdue</p><p className="text-2xl font-semibold text-destructive">{counts.overdue}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Urgent</p><p className="text-2xl font-semibold text-amber-700">{counts.urgent}</p></CardContent></Card>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search follow-ups" className="pl-9" />
          </div>
          <Select value={priority} onValueChange={v => setPriority(v as typeof priority)}>
            <SelectTrigger className="w-full md:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-12">Loading...</p>
            ) : filtered.length === 0 ? (
              <div className="text-center py-14 text-muted-foreground">
                <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">{query || priority !== 'all' ? 'No matching follow-ups' : 'No pending follow-ups'}</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map(item => {
                  const title = item.title ?? item.threads?.subject ?? '(no subject)';
                  const due = parseISO(item.due_at ?? item.remind_at);
                  const overdue = isPast(due);
                  return (
                    <div key={item.id} className="flex items-start gap-3 p-4">
                      <button onClick={() => complete(item)} className="mt-1 text-muted-foreground hover:text-green-600" title="Complete">
                        <CheckCircle2 className="w-5 h-5" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate">{title}</p>
                          <Badge className={cn('text-xs', priorityClasses[item.priority])}>{item.priority}</Badge>
                          {overdue && <Badge variant="destructive" className="text-xs">Overdue</Badge>}
                        </div>
                        {item.note && <p className="text-sm text-muted-foreground mt-1">{item.note}</p>}
                        <p className="text-xs text-muted-foreground mt-1">
                          Due {format(due, 'dd MMM yyyy, HH:mm')}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {item.thread_id && (
                          <Link to={`/inbox?thread=${item.thread_id}&mailbox=${item.threads?.mailbox_id ?? ''}`}>
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Open thread"><MailOpen className="w-4 h-4" /></Button>
                          </Link>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => dismiss(item)} title="Dismiss">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader><DialogTitle>New Follow-up Task</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Reminder *</Label>
              <Input type="datetime-local" value={form.remind_at} onChange={e => setForm(p => ({ ...p, remind_at: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Due date</Label>
              <Input type="datetime-local" value={form.due_at} onChange={e => setForm(p => ({ ...p, due_at: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={v => setForm(p => ({ ...p, priority: v as FollowUpReminder['priority'] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Textarea value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? 'Saving...' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
