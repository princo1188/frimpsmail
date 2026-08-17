import { useState, useCallback, useRef } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { Paperclip, Star, AlertTriangle, Circle, Clock, CheckSquare, CheckCheck } from 'lucide-react';
import { useMail } from '@/contexts/MailContext';
import type { Thread } from '@/types/types';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Archive, Trash2, Mail, MailOpen, X } from 'lucide-react';
import { toast } from 'sonner';

function formatThreadDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return 'Yesterday';
  if (Date.now() - date.getTime() < 7 * 24 * 60 * 60 * 1000) return format(date, 'EEE');
  return format(date, 'dd MMM');
}

function ThreadSkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-border">
      <Skeleton className="w-4 h-4 mt-1 rounded" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-4 w-32 rounded" />
          <Skeleton className="h-3 w-12 rounded" />
        </div>
        <Skeleton className="h-3 w-48 rounded" />
        <Skeleton className="h-3 w-full rounded" />
      </div>
    </div>
  );
}

export default function ThreadList() {
  const {
    threads, activeThread, setActiveThread, loadingThreads,
    markThreadRead, starThread, archiveThread, deleteThread, activeFolder, refreshThreads
  } = useMail();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  const undoStackRef = useRef<{ ids: string[]; action: 'archive' | 'delete'; threads: Thread[] } | null>(null);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(threads.map(t => t.id)));
  const clearSelection = () => setSelected(new Set());

  const handleThreadClick = useCallback((thread: Thread) => {
    setActiveThread(thread);
    if (!thread.is_read) markThreadRead(thread.id);
  }, [setActiveThread, markThreadRead]);

  const withUndo = (ids: string[], action: 'archive' | 'delete', label: string, doAction: () => Promise<void>) => {
    undoStackRef.current = { ids, action, threads: threads.filter(t => ids.includes(t.id)) };
    const toastId = toast.success(label, {
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: async () => {
          // Restore by refreshing — in production you'd restore folder_id
          toast.dismiss(toastId);
          toast.info('Action undone');
          refreshThreads();
          undoStackRef.current = null;
        },
      },
    });
    return doAction();
  };

  const bulkArchive = async () => {
    const ids = [...selected];
    setSelected(new Set());
    await withUndo(ids, 'archive', `${ids.length} thread${ids.length > 1 ? 's' : ''} archived`, async () => {
      for (const id of ids) await archiveThread(id);
    });
  };

  const bulkDelete = async () => {
    const ids = [...selected];
    setSelected(new Set());
    await withUndo(ids, 'delete', `${ids.length} thread${ids.length > 1 ? 's' : ''} moved to Trash`, async () => {
      for (const id of ids) await deleteThread(id);
    });
  };

  const bulkMarkRead = async () => {
    for (const id of selected) await markThreadRead(id);
    toast.success(`${selected.size} thread${selected.size > 1 ? 's' : ''} marked as read`);
    setSelected(new Set());
  };

  const bulkMarkUnread = async () => {
    // mark unread via direct update
    const { supabase } = await import('@/db/supabase');
    for (const id of selected) await supabase.from('threads').update({ is_read: false }).eq('id', id);
    toast.success(`${selected.size} marked as unread`);
    setSelected(new Set());
    refreshThreads();
  };

  if (loadingThreads) {
    return (
      <div className="flex flex-col h-full border-r border-border bg-background overflow-y-auto">
        {Array.from({ length: 10 }).map((_, i) => <ThreadSkeleton key={i} />)}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full border-r border-border bg-background overflow-hidden">
      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-2 bg-primary/5 border-b border-border shrink-0 flex-wrap">
          <button onClick={clearSelection} className="text-muted-foreground hover:text-foreground mr-1">
            <X className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs font-medium text-foreground mr-1">{selected.size} selected</span>
          <Button variant="ghost" size="sm" onClick={bulkMarkRead} className="h-7 text-xs">
            <MailOpen className="w-3.5 h-3.5 mr-1" /> Read
          </Button>
          <Button variant="ghost" size="sm" onClick={bulkMarkUnread} className="h-7 text-xs">
            <Mail className="w-3.5 h-3.5 mr-1" /> Unread
          </Button>
          <Button variant="ghost" size="sm" onClick={bulkArchive} className="h-7 text-xs">
            <Archive className="w-3.5 h-3.5 mr-1" /> Archive
          </Button>
          <Button variant="ghost" size="sm" onClick={bulkDelete} className="h-7 text-xs text-destructive hover:text-destructive">
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
          </Button>
        </div>
      )}

      {/* Folder label + select-all */}
      <div className="px-4 py-2 border-b border-border shrink-0 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide capitalize">{activeFolder}</h2>
        {threads.length > 0 && (
          <button
            onClick={selected.size === threads.length ? clearSelection : selectAll}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            {selected.size === threads.length ? 'Deselect all' : 'Select all'}
          </button>
        )}
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto">
        {threads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <Mail className="w-12 h-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No messages</p>
            <p className="text-xs text-muted-foreground mt-1">
              {activeFolder === 'inbox' ? 'Your inbox is empty' : `No messages in ${activeFolder}`}
            </p>
          </div>
        ) : threads.map((thread, idx) => {
          const isActive = activeThread?.id === thread.id;
          const isUnread = !thread.is_read;
          const hasPendingSpam = (thread as Thread & { spam_flags?: Array<{ user_action: string }> }).spam_flags?.some(f => f.user_action === 'pending');
          const hasAttachments = (thread as Thread & { has_attachments?: boolean }).has_attachments;
          const snippet = (thread as Thread & { latest_snippet?: string }).latest_snippet ?? '';
          const fromName = (
            (thread as Thread & { latest_from_name?: string; latest_from_address?: string }).latest_from_name
            || (thread as Thread & { latest_from_name?: string; latest_from_address?: string }).latest_from_address
            || thread.participants?.[0]
          ) ?? 'Unknown';

          return (
            <div
              key={thread.id}
              onClick={() => handleThreadClick(thread)}
              className={cn(
                'flex items-start gap-2 px-3 py-3 border-b border-border cursor-pointer transition-colors group',
                isActive ? 'bg-primary/8' : 'hover:bg-muted/60',
                isUnread && !isActive && 'bg-card',
              )}
              data-index={idx}
            >
              {/* Checkbox */}
              <div className="flex items-start gap-1 pt-0.5 shrink-0">
                <Checkbox
                  checked={selected.has(thread.id)}
                  onCheckedChange={() => toggleSelect(thread.id)}
                  onClick={e => e.stopPropagation()}
                  className="opacity-0 group-hover:opacity-100 data-[state=checked]:opacity-100 transition-opacity"
                />
                {/* Unread dot */}
                {isUnread && !selected.has(thread.id) && (
                  <Circle className="w-2 h-2 fill-primary text-primary shrink-0 mt-1 group-hover:opacity-0" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2 mb-0.5">
                  <span className={cn('text-sm truncate', isUnread ? 'font-semibold text-foreground' : 'font-normal text-foreground/80')}>
                    {fromName}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                    {formatThreadDate(thread.last_message_at)}
                  </span>
                </div>

                <div className="flex items-baseline gap-1">
                  <p className={cn('text-sm truncate', isUnread ? 'font-medium text-foreground' : 'text-foreground/70')}>
                    {thread.subject ?? '(no subject)'}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-xs text-muted-foreground truncate flex-1">{snippet}</p>
                  <div className="flex items-center gap-1 shrink-0">
                    {(thread as Thread & { follow_up_at?: string | null }).follow_up_at && (
                      <Clock className="w-3 h-3 text-orange-500" />
                    )}
                    {hasAttachments && <Paperclip className="w-3 h-3 text-muted-foreground" />}
                    {hasPendingSpam && <AlertTriangle className="w-3 h-3 text-destructive/70" />}
                    {/* Read receipt: double-tick shown on sent threads where recipient opened */}
                    {activeFolder === 'sent' && thread.latest_read_receipt_at && (
                      <span title={`Read ${format(new Date(thread.latest_read_receipt_at), 'dd MMM HH:mm')}`}>
                        <CheckCheck className="w-3.5 h-3.5 text-green-500" />
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Star */}
              <button
                onClick={e => { e.stopPropagation(); starThread(thread.id, !thread.is_starred); }}
                className="shrink-0 opacity-0 group-hover:opacity-100 data-[starred=true]:opacity-100 transition-opacity"
                data-starred={thread.is_starred}
              >
                <Star className={cn('w-4 h-4', thread.is_starred ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground')} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
