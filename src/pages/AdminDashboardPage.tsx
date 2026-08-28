// @refresh reset
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, AlertCircle, CheckCircle2, Clock,
  Mail, Activity, Database, Zap, TrendingUp, Shield, ExternalLink
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import type { Mailbox } from '@/types/types';

interface MailboxStats {
  mailbox: Mailbox & { staff_users?: { full_name: string | null } | null };
  totalMessages: number;
  unreadMessages: number;
  todayMessages: number;
  errorCount: number;
  lastError: string | null;
}

function SyncStatusBadge({ status }: { status: string }) {
  const config = {
    active:   { label: 'Active',   cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle2 },
    syncing:  { label: 'Syncing',  cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',     icon: RefreshCw },
    pending:  { label: 'Pending',  cls: 'bg-muted text-muted-foreground',                                        icon: Clock },
    error:    { label: 'Error',    cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',          icon: AlertCircle },
  }[status] ?? { label: status, cls: 'bg-muted text-muted-foreground', icon: Clock };

  const Icon = config.icon;
  return (
    <Badge className={cn('flex items-center gap-1 capitalize', config.cls)}>
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}

export default function AdminDashboardPage() {
  const { organization } = useAuth();
  const [stats, setStats] = useState<MailboxStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalThreads, setTotalThreads] = useState(0);
  const [totalContacts, setTotalContacts] = useState(0);
  const [scheduledCount, setScheduledCount] = useState(0);

  const loadStats = async () => {
    if (!organization) return;
    setLoading(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const [{ data: mailboxes, error: mailboxError }, { data: countRows, error: countError }] = await Promise.all([
        supabase
          .from('mailboxes')
          .select('*, staff_users(full_name)')
          .eq('organization_id', organization.id)
          .order('created_at'),
        supabase.rpc('get_admin_mailbox_message_counts', {
          p_organization_id: organization.id,
          p_since: today.toISOString(),
        }),
      ]);

      if (mailboxError) throw mailboxError;
      if (countError) throw countError;

      if (!mailboxes) { setLoading(false); return; }

      const countsByMailbox = new Map(
        ((countRows ?? []) as Array<{ mailbox_id: string; total_messages: number; unread_messages: number; today_messages: number }>)
          .map(row => [row.mailbox_id, row]),
      );
      const statsArr: MailboxStats[] = mailboxes.map(mb => {
        const counts = countsByMailbox.get(mb.id);
        return {
          mailbox: mb,
          totalMessages: Number(counts?.total_messages ?? 0),
          unreadMessages: Number(counts?.unread_messages ?? 0),
          todayMessages: Number(counts?.today_messages ?? 0),
          errorCount: mb.last_error ? 1 : 0,
          lastError: mb.last_error,
        };
      });

      setStats(statsArr);

      // Org-level stats
      const [{ count: threads }, { count: contacts }, { count: scheduled }] = await Promise.all([
        supabase.from('threads').select('*', { count: 'exact', head: true }),
        supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('organization_id', organization.id),
        supabase.from('scheduled_messages').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);
      setTotalThreads(threads ?? 0);
      setTotalContacts(contacts ?? 0);
      setScheduledCount(scheduled ?? 0);
    } catch {
      toast.error('Failed to load dashboard stats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStats(); }, [organization]); // eslint-disable-line

  const totalMessages = stats.reduce((s, x) => s + x.totalMessages, 0);
  const totalUnread = stats.reduce((s, x) => s + x.unreadMessages, 0);
  const errorMailboxes = stats.filter(s => s.mailbox.sync_status === 'error');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link to="/inbox">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold" style={{ fontFamily: 'Playfair Display, serif' }}>Admin Dashboard</h1>
              <p className="text-sm text-muted-foreground">{organization?.name} · System Health Overview</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadStats} disabled={loading}>
              <RefreshCw className={cn('w-4 h-4 mr-2', loading && 'animate-spin')} />
              Refresh
            </Button>
            <Link to="/admin/webhooks">
              <Button variant="outline" size="sm">
                <Zap className="w-4 h-4 mr-2" /> Webhooks & API
              </Button>
            </Link>
            <Link to="/admin/mailboxes">
              <Button size="sm">
                <Shield className="w-4 h-4 mr-2" /> Manage Mailboxes
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* Error alert */}
        {errorMailboxes.length > 0 && (
          <div className="flex items-start gap-3 p-4 bg-destructive/5 border border-destructive/30 rounded-lg">
            <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-destructive text-sm">
                {errorMailboxes.length} mailbox{errorMailboxes.length > 1 ? 'es have' : ' has'} sync errors
              </p>
              <ul className="mt-1 space-y-0.5">
                {errorMailboxes.map(s => (
                  <li key={s.mailbox.id} className="text-xs text-muted-foreground">
                    <span className="font-medium">{s.mailbox.email_address}</span>
                    {s.lastError && <span> — {s.lastError}</span>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Messages', value: totalMessages.toLocaleString(), icon: Mail, color: 'text-primary' },
            { label: 'Unread Messages', value: totalUnread.toLocaleString(), icon: Activity, color: 'text-orange-500' },
            { label: 'Total Contacts', value: totalContacts.toLocaleString(), icon: Database, color: 'text-blue-500' },
            { label: 'Scheduled Sends', value: scheduledCount.toLocaleString(), icon: TrendingUp, color: 'text-purple-500' },
          ].map(kpi => (
            <Card key={kpi.label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <kpi.icon className={cn('w-4 h-4', kpi.color)} />
                </div>
                <p className="text-2xl font-bold">{loading ? '—' : kpi.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Mailbox Health Cards */}
        <div>
          <h2 className="text-base font-semibold mb-3">Mailbox Health</h2>
          <div className="space-y-4">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-5">
                    <div className="h-16 bg-muted animate-pulse rounded-md" />
                  </CardContent>
                </Card>
              ))
            ) : stats.map(s => {
              const readPercent = s.totalMessages > 0 ? Math.round(((s.totalMessages - s.unreadMessages) / s.totalMessages) * 100) : 100;
              return (
                <Card key={s.mailbox.id} className={cn(s.mailbox.sync_status === 'error' && 'border-destructive/40')}>
                  <CardContent className="p-5">
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      {/* Identity */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0">
                            {s.mailbox.email_address[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{s.mailbox.email_address}</p>
                            <p className="text-xs text-muted-foreground">{s.mailbox.staff_users?.full_name ?? 'Shared mailbox'}</p>
                          </div>
                          <SyncStatusBadge status={s.mailbox.sync_status} />
                        </div>
                        {s.mailbox.last_synced_at && (
                          <p className="text-xs text-muted-foreground ml-10">
                            Last synced {formatDistanceToNow(new Date(s.mailbox.last_synced_at), { addSuffix: true })}
                          </p>
                        )}
                        {s.lastError && (
                          <p className="text-xs text-destructive ml-10 mt-0.5 truncate">{s.lastError}</p>
                        )}
                      </div>

                      <Separator orientation="vertical" className="hidden md:block h-12" />

                      {/* Stats */}
                      <div className="grid grid-cols-3 gap-4 md:w-64">
                        <div className="text-center">
                          <p className="text-lg font-bold">{s.totalMessages.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">Total</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-orange-500">{s.unreadMessages.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">Unread</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-green-600">{s.todayMessages.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">Today</p>
                        </div>
                      </div>

                      <Separator orientation="vertical" className="hidden md:block h-12" />

                      {/* Read progress */}
                      <div className="md:w-40">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-muted-foreground">Read rate</span>
                          <span className="text-xs font-medium">{readPercent}%</span>
                        </div>
                        <Progress value={readPercent} className="h-2" />
                      </div>

                      {/* IMAP/SMTP config */}
                      <div className="md:w-48 text-xs text-muted-foreground space-y-0.5">
                        <p><span className="font-medium">IMAP:</span> {s.mailbox.imap_host}:{s.mailbox.imap_port}</p>
                        <p><span className="font-medium">SMTP:</span> {s.mailbox.smtp_host}:{s.mailbox.smtp_port}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Thread Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Thread Overview</CardTitle>
              <CardDescription>Across all mailboxes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total threads</span>
                <span className="font-medium">{totalThreads.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Active mailboxes</span>
                <span className="font-medium">{stats.filter(s => s.mailbox.sync_status === 'active').length} / {stats.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Scheduled pending</span>
                <span className="font-medium">{scheduledCount}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Quick Actions</CardTitle>
              <CardDescription>Admin shortcuts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link to="/admin/mailboxes" className="flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors text-sm">
                <span>Manage mailboxes</span>
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
              </Link>
              <Link to="/admin/webhooks" className="flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors text-sm">
                <span>Webhooks & API keys</span>
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
              </Link>
              <Link to="/inbox/settings" className="flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors text-sm">
                <span>Organization settings</span>
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
              </Link>
            </CardContent>
          </Card>
        </div>

        <p className="text-xs text-muted-foreground text-center pb-4">
          Data refreshed {format(new Date(), 'dd MMM yyyy, HH:mm')}
        </p>
      </div>
    </div>
  );
}
