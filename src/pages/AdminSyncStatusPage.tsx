import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, CheckCircle2, AlertCircle, Loader2, Clock, WifiOff, ArrowLeft, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import type { Mailbox } from '@/types/types';

type SyncMailbox = Mailbox & { unread_count?: number };

const STATUS_CONFIG = {
  active:  { label: 'Active',   color: 'bg-green-500',  textColor: 'text-green-600 dark:text-green-400',  icon: CheckCircle2 },
  syncing: { label: 'Syncing',  color: 'bg-yellow-500 animate-pulse', textColor: 'text-yellow-600 dark:text-yellow-400', icon: Loader2 },
  error:   { label: 'Error',    color: 'bg-destructive', textColor: 'text-destructive', icon: AlertCircle },
  pending: { label: 'Pending',  color: 'bg-muted-foreground', textColor: 'text-muted-foreground', icon: Clock },
};

function StatusDot({ status }: { status: SyncMailbox['sync_status'] }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return <span className={cn('inline-block w-2.5 h-2.5 rounded-full shrink-0', cfg.color)} />;
}

function StatusBadge({ status }: { status: SyncMailbox['sync_status'] }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={cn('gap-1.5 font-medium', cfg.textColor)}>
      <Icon className={cn('w-3 h-3', status === 'syncing' && 'animate-spin')} />
      {cfg.label}
    </Badge>
  );
}

function SyncRow({ mb, onForceSync }: { mb: SyncMailbox; onForceSync: (id: string) => Promise<void> }) {
  const [syncing, setSyncing] = useState(false);
  const lastSynced = mb.last_synced_at
    ? formatDistanceToNow(new Date(mb.last_synced_at), { addSuffix: true })
    : 'Never';

  const handleForce = async () => {
    setSyncing(true);
    await onForceSync(mb.id);
    setSyncing(false);
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-3 border-b border-border last:border-0">
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <StatusDot status={mb.sync_status} />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{mb.email_address}</p>
          <p className="text-xs text-muted-foreground truncate">{mb.imap_host ?? '—'}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 pl-5 sm:pl-0">
        <StatusBadge status={mb.sync_status} />

        <div className="text-right min-w-[100px] hidden sm:block">
          <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
            <Clock className="w-3 h-3" />
            {lastSynced}
          </p>
        </div>

        <Button
          variant="ghost" size="icon"
          className="h-7 w-7 shrink-0"
          title="Force re-sync this mailbox"
          onClick={handleForce}
          disabled={syncing || mb.sync_status === 'syncing'}
        >
          <RotateCcw className={cn('w-3.5 h-3.5', syncing && 'animate-spin')} />
        </Button>
      </div>

      {mb.sync_status === 'error' && mb.last_error && (
        <div className="pl-5 sm:pl-0 w-full sm:w-auto sm:max-w-xs">
          <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1 truncate" title={mb.last_error}>
            {mb.last_error}
          </p>
        </div>
      )}
    </div>
  );
}

export default function AdminSyncStatusPage() {
  const { organization } = useAuth();
  const navigate = useNavigate();
  const [mailboxes, setMailboxes] = useState<SyncMailbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const load = useCallback(async () => {
    if (!organization) return;
    const { data } = await supabase
      .from('mailboxes')
      .select('*')
      .eq('organization_id', organization.id)
      .order('email_address');
    setMailboxes((data as SyncMailbox[]) ?? []);
    setLastRefresh(new Date());
    setLoading(false);
  }, [organization]);

  const forceSync = useCallback(async (mailboxId: string) => {
    try {
      const { error } = await supabase.functions.invoke('trigger-mailbox-sync', {
        body: { mailbox_id: mailboxId },
      });
      if (error) throw error;
      toast.success('Re-sync triggered — mailbox marked as pending');
      // Optimistically update local state so the row shows "Pending" immediately
      setMailboxes(prev => prev.map(mb =>
        mb.id === mailboxId ? { ...mb, sync_status: 'pending' as const, last_error: null } : mb
      ));
    } catch (e) {
      toast.error('Failed to trigger re-sync: ' + (e as Error).message);
    }
  }, []);

  // Operational status is refreshed at a low fixed cadence rather than via a
  // Realtime stream for each worker heartbeat.
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(); }, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const filtered = mailboxes.filter(mb =>
    mb.email_address.toLowerCase().includes(search.toLowerCase()) ||
    (mb.imap_host ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const counts = {
    active:  mailboxes.filter(m => m.sync_status === 'active').length,
    syncing: mailboxes.filter(m => m.sync_status === 'syncing').length,
    error:   mailboxes.filter(m => m.sync_status === 'error').length,
    pending: mailboxes.filter(m => m.sync_status === 'pending').length,
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 md:px-8 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold leading-tight">Sync Status</h1>
          <p className="text-xs text-muted-foreground">
            Updated {formatDistanceToNow(lastRefresh, { addSuffix: true })}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={load} disabled={loading}>
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          Refresh
        </Button>
      </header>

      <main className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(Object.entries(counts) as [keyof typeof counts, number][]).map(([status, count]) => {
            const cfg = STATUS_CONFIG[status];
            const Icon = cfg.icon;
            return (
              <Card key={status} className="border-border">
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={cn('text-2xl font-bold', cfg.textColor)}>{count}</p>
                      <p className="text-xs text-muted-foreground capitalize">{cfg.label}</p>
                    </div>
                    <Icon className={cn('w-6 h-6', cfg.textColor, status === 'syncing' && 'animate-spin')} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Mailbox list */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <CardTitle className="text-base flex-1">
                All Mailboxes
                <span className="ml-2 text-sm font-normal text-muted-foreground">({mailboxes.length})</span>
              </CardTitle>
              <Input
                placeholder="Filter by address or host…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-8 text-sm sm:w-64"
              />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading mailboxes…</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                <WifiOff className="w-8 h-8 opacity-40" />
                <p className="text-sm">{search ? 'No mailboxes match that filter' : 'No mailboxes found'}</p>
              </div>
            ) : (
              <div>
                {filtered.map(mb => <SyncRow key={mb.id} mb={mb} onForceSync={forceSync} />)}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="font-medium">Poll intervals:</span>
          <span>INBOX / Archive → 30s</span>
          <span>Sent / Drafts → 5s</span>
          <span>Junk / Trash / Spam → 90s</span>
        </div>
      </main>
    </div>
  );
}
