import { useState, useEffect, useRef } from 'react';
import { format, formatDistanceToNow, addDays, addHours } from 'date-fns';
import {
  Reply, CornerUpRight, Forward, Star, Trash2, Archive,
  AlertTriangle, ChevronDown, ChevronUp, Paperclip,
  Download, Clock, MailOpen, Sparkles, RefreshCw, Video,
  Printer, X, Calendar, BellRing, Brain, ThumbsUp,
  ThumbsDown, Minus as MinusIcon, MessageSquare, Users,
  MapPin, CheckCircle2, ZoomIn, FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useMail } from '@/contexts/MailContext';
import { useAuth } from '@/contexts/AuthContext';
import { updateSpamFlag, fetchAiCache, upsertAiCache, setFollowUp, dismissFollowUp } from '@/services/api';
import { supabase } from '@/db/supabase';
import type { Message, Attachment, FollowUpReminder } from '@/types/types';
import { cn } from '@/lib/utils';
import ComposePanel from './ComposePanel';
import SnoozePopover from './SnoozePopover';
import VideoCallModal from './VideoCallModal';

// ---- Skeleton ----
function MessageSkeleton() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-6 w-3/4 rounded" />
      <div className="flex items-center gap-3">
        <Skeleton className="w-8 h-8 rounded-full" />
        <div className="space-y-1">
          <Skeleton className="h-4 w-40 rounded" />
          <Skeleton className="h-3 w-24 rounded" />
        </div>
        <Skeleton className="h-3 w-20 rounded ml-auto" />
      </div>
      <Skeleton className="h-32 w-full rounded" />
    </div>
  );
}

// ---- Attachment Preview Gallery ----
interface GalleryItem { url: string; filename: string; mime: string }

function AttachmentGallery({ items, initialIndex, onClose }: {
  items: GalleryItem[]; initialIndex: number; onClose: () => void;
}) {
  const [idx, setIdx] = useState(initialIndex);
  const current = items[idx];
  const isImage = current.mime?.startsWith('image/');
  const isPdf = current.mime === 'application/pdf';

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-4xl max-h-[90dvh] flex flex-col p-0 gap-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-medium truncate flex-1">{current.filename}</span>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">{idx + 1} / {items.length}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.open(current.url, '_blank')}>
              <Download className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto flex items-center justify-center bg-muted/20 min-h-[300px] p-4">
          {isImage ? (
            <img src={current.url} alt={current.filename} className="max-w-full max-h-[60vh] object-contain rounded-md shadow-lg" />
          ) : isPdf ? (
            <iframe src={current.url} title={current.filename} className="w-full h-[60vh] rounded-md border border-border" />
          ) : (
            <div className="text-center text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-2" />
              <p className="text-sm">{current.filename}</p>
              <p className="text-xs mt-1">Preview not available</p>
              <Button size="sm" className="mt-3" onClick={() => window.open(current.url, '_blank')}>
                <Download className="w-3.5 h-3.5 mr-1.5" /> Download
              </Button>
            </div>
          )}
        </div>
        {items.length > 1 && (
          <div className="flex gap-2 px-4 py-3 border-t border-border overflow-x-auto">
            {items.map((item, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className={cn(
                  'shrink-0 w-12 h-12 rounded-md overflow-hidden border-2 transition-colors',
                  i === idx ? 'border-primary' : 'border-border hover:border-primary/50'
                )}
              >
                {item.mime?.startsWith('image/') ? (
                  <img src={item.url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    <Paperclip className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---- AttachmentRow with preview trigger ----
function AttachmentRow({ att, onPreview }: { att: Attachment; onPreview: (url: string) => void }) {
  const handleDownload = async () => {
    const { data, error } = await supabase.storage.from('attachments').createSignedUrl(att.storage_path, 60);
    if (error || !data) { toast.error('Failed to get download link'); return; }
    window.open(data.signedUrl, '_blank');
  };

  const handlePreviewClick = async () => {
    const { data, error } = await supabase.storage.from('attachments').createSignedUrl(att.storage_path, 300);
    if (error || !data) { toast.error('Failed to get preview link'); return; }
    onPreview(data.signedUrl);
  };

  const isImage = att.mime_type?.startsWith('image/');
  const isPdf = att.mime_type === 'application/pdf';
  const canPreview = isImage || isPdf;
  const sizeKb = att.size_bytes ? Math.round(att.size_bytes / 1024) : null;

  return (
    <div className="flex items-center gap-2 p-2 rounded-md border border-border bg-muted/40 hover:bg-muted transition-colors group">
      <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="text-xs font-medium truncate flex-1">{att.filename ?? 'Attachment'}</span>
      {sizeKb && <span className="text-xs text-muted-foreground shrink-0">{sizeKb}KB</span>}
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {canPreview && (
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handlePreviewClick} title="Preview">
            <ZoomIn className="w-3 h-3" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={handleDownload} title="Download">
          <Download className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

// ---- AI Panel ----
interface AiResults {
  summary?: string;
  sentiment?: { score: number; label: string; reasoning: string } | null;
  categories?: string[];
  meetings?: Array<{ title: string; date: string; location: string; attendees: string[] }>;
  draftReply?: string;
}

function AiPanel({ threadId, messages, onUseDraft }: {
  threadId: string;
  messages: Message[];
  onUseDraft: (html: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AiResults>({});
  const [expanded, setExpanded] = useState(true);

  const runAll = async () => {
    setLoading(true);
    try {
      const [sumRes, sentRes, catRes, meetRes, draftRes] = await Promise.allSettled([
        supabase.functions.invoke('summarize-thread', { body: { thread_id: threadId } }),
        supabase.functions.invoke('sentiment-analysis', { body: { thread_id: threadId } }),
        supabase.functions.invoke('smart-categorize', { body: { thread_id: threadId } }),
        supabase.functions.invoke('meeting-extract', { body: { thread_id: threadId } }),
        supabase.functions.invoke('reply-draft', { body: { thread_id: threadId } }),
      ]);

      const ai: AiResults = {};
      if (sumRes.status === 'fulfilled' && sumRes.value.data?.summary) ai.summary = sumRes.value.data.summary;
      if (sentRes.status === 'fulfilled' && sentRes.value.data) ai.sentiment = sentRes.value.data;
      if (catRes.status === 'fulfilled' && catRes.value.data?.categories) ai.categories = catRes.value.data.categories;
      if (meetRes.status === 'fulfilled' && meetRes.value.data?.meetings) ai.meetings = meetRes.value.data.meetings;
      if (draftRes.status === 'fulfilled' && draftRes.value.data?.draft) ai.draftReply = draftRes.value.data.draft;

      // Cache summary
      if (ai.summary) await upsertAiCache(threadId, 'summary', ai.summary);
      setResults(ai);
    } catch {
      toast.error('AI analysis failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Load cached summary if available
    fetchAiCache(threadId, 'summary').then(cached => {
      if (cached?.content) setResults(r => ({ ...r, summary: cached.content ?? undefined }));
    });
  }, [threadId]);

  const sentimentIcon = (label: string) =>
    label === 'positive' ? <ThumbsUp className="w-3.5 h-3.5 text-green-500" /> :
    label === 'negative' ? <ThumbsDown className="w-3.5 h-3.5 text-destructive" /> :
    <MinusIcon className="w-3.5 h-3.5 text-muted-foreground" />;

  const hasAnyResults = results.summary || results.sentiment || results.categories?.length || results.meetings?.length || results.draftReply;

  return (
    <div className="mx-4 mb-4 border border-accent/30 rounded-lg bg-accent/5 overflow-hidden">
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-accent/10 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <Brain className="w-4 h-4 text-accent shrink-0" style={{ color: 'hsl(var(--accent))' }} />
        <span className="text-sm font-semibold flex-1" style={{ color: 'hsl(var(--accent))' }}>AI Assistant</span>
        {results.sentiment && (
          <div className="flex items-center gap-1 mr-2">
            {sentimentIcon(results.sentiment.label)}
            <span className="text-xs capitalize text-muted-foreground">{results.sentiment.label}</span>
          </div>
        )}
        {results.categories?.map(c => (
          <Badge key={c} variant="secondary" className="text-xs h-5">{c}</Badge>
        ))}
        <Button
          variant="ghost" size="sm" className="h-7 text-xs ml-2 shrink-0"
          onClick={e => { e.stopPropagation(); runAll(); }}
          disabled={loading}
          style={{ color: 'hsl(var(--accent))' }}
        >
          {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
          {hasAnyResults ? 'Refresh' : 'Analyse'}
        </Button>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </div>

      {expanded && hasAnyResults && (
        <div className="px-4 pb-4 space-y-4 border-t border-accent/20">
          {/* Summary */}
          {results.summary && (
            <div className="pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Summary</p>
              <p className="text-sm text-foreground/80 leading-relaxed">{results.summary}</p>
            </div>
          )}

          {/* Sentiment + Categories */}
          {(results.sentiment || results.categories?.length) && (
            <div className="flex flex-wrap gap-3">
              {results.sentiment && (
                <div className="flex items-center gap-2 p-2 bg-card rounded-md border border-border">
                  {sentimentIcon(results.sentiment.label)}
                  <div>
                    <p className="text-xs font-medium capitalize">{results.sentiment.label} tone</p>
                    {results.sentiment.reasoning && (
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">{results.sentiment.reasoning}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Meetings */}
          {results.meetings && results.meetings.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Detected Meetings</p>
              <div className="space-y-2">
                {results.meetings.map((m, i) => (
                  <div key={i} className="p-3 bg-card rounded-md border border-border text-sm">
                    <div className="flex items-center gap-2 font-medium">
                      <Calendar className="w-4 h-4 text-primary shrink-0" />
                      {m.title}
                    </div>
                    <div className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                      {m.date && <p className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> {m.date}</p>}
                      {m.location && <p className="flex items-center gap-1.5"><MapPin className="w-3 h-3" /> {m.location}</p>}
                      {m.attendees?.length > 0 && (
                        <p className="flex items-center gap-1.5"><Users className="w-3 h-3" /> {m.attendees.join(', ')}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Draft Reply */}
          {results.draftReply && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Suggested Reply</p>
              <div className="p-3 bg-card rounded-md border border-border text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">
                {results.draftReply}
              </div>
              <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={() => onUseDraft(results.draftReply ?? '')}>
                <MessageSquare className="w-3.5 h-3.5 mr-1.5" /> Use This Draft
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Follow-up Popover ----
function FollowUpPopover({ threadId }: { threadId: string }) {
  const { staffUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [priority, setPriority] = useState<FollowUpReminder['priority']>('normal');
  const [custom, setCustom] = useState(false);
  const [customDate, setCustomDate] = useState('');

  const PRESETS = [
    { label: 'In 1 hour', value: addHours(new Date(), 1) },
    { label: 'Tomorrow', value: addDays(new Date(), 1) },
    { label: 'In 3 days', value: addDays(new Date(), 3) },
    { label: 'Next week', value: addDays(new Date(), 7) },
  ];

  const set = async (date: Date) => {
    if (!staffUser) return;
    await setFollowUp(threadId, staffUser.id, date, note || undefined, priority);
    toast.success(`Follow-up set for ${format(date, 'dd MMM, HH:mm')}`);
    setOpen(false);
    setNote('');
  };

  const dismiss = async () => {
    if (!staffUser) return;
    await dismissFollowUp(threadId, staffUser.id);
    toast.success('Follow-up cleared');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Set follow-up reminder">
          <BellRing className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Follow-up Reminder</p>
        <div className="space-y-1.5 mb-3">
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => set(p.value)}
              className="w-full text-left text-sm px-3 py-2 rounded-md hover:bg-muted transition-colors flex items-center justify-between"
            >
              <span>{p.label}</span>
              <span className="text-xs text-muted-foreground">{format(p.value, 'dd MMM, HH:mm')}</span>
            </button>
          ))}
          <button
            onClick={() => setCustom(c => !c)}
            className="w-full text-left text-sm px-3 py-2 rounded-md hover:bg-muted transition-colors"
          >
            Custom date…
          </button>
          {custom && (
            <div className="flex gap-2 pt-1">
              <Input type="datetime-local" value={customDate} onChange={e => setCustomDate(e.target.value)} className="h-8 text-xs" />
              <Button size="sm" className="h-8 shrink-0" onClick={() => customDate && set(new Date(customDate))}>Set</Button>
            </div>
          )}
        </div>
        <div className="border-t border-border pt-2">
          <Label className="text-xs text-muted-foreground">Note (optional)</Label>
          <Input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Check on quote status" className="h-7 text-xs mt-1" />
        </div>
        <div className="pt-2">
          <Label className="text-xs text-muted-foreground">Priority</Label>
          <Select value={priority} onValueChange={v => setPriority(v as FollowUpReminder['priority'])}>
            <SelectTrigger className="h-8 mt-1 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="pt-2 border-t border-border mt-2">
          <button onClick={dismiss} className="text-xs text-destructive hover:underline">Clear follow-up</button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---- Print helper ----
function printThread(subject: string, messages: Message[]) {
  const content = messages.map(m => `
    <div style="margin-bottom:24px;border-bottom:1px solid #eee;padding-bottom:16px">
      <div style="font-size:12px;color:#666;margin-bottom:8px">
        <strong>${m.from_name ?? m.from_address}</strong> &lt;${m.from_address}&gt; · ${m.sent_at ? format(new Date(m.sent_at), 'dd MMM yyyy, HH:mm') : ''}
      </div>
      ${m.body_html ?? `<pre style="white-space:pre-wrap;font-family:sans-serif">${m.body_text ?? ''}</pre>`}
    </div>
  `).join('');
  const win = window.open('', '_blank');
  if (!win) { toast.error('Pop-up blocked. Allow pop-ups and try again.'); return; }
  win.document.write(`
    <!DOCTYPE html>
    <html><head>
      <title>${subject}</title>
      <style>body{font-family:sans-serif;padding:32px;max-width:800px;margin:0 auto}h1{font-size:18px;margin-bottom:24px}@media print{button{display:none}}</style>
    </head><body>
      <button onclick="window.print()" style="margin-bottom:16px;padding:8px 16px;cursor:pointer">🖨 Print / Save as PDF</button>
      <h1>${subject}</h1>${content}
    </body></html>
  `);
  win.document.close();
}

// ---- MessageItem ----
function MessageItem({
  message, isExpanded, onToggle, onReply, isLast, onPreviewAttachment
}: {
  message: Message;
  isExpanded: boolean;
  onToggle: () => void;
  onReply: (m: Message) => void;
  isLast: boolean;
  onPreviewAttachment: (url: string, all: GalleryItem[], idx: number) => void;
}) {
  const { moveToSpam } = useMail();
  const pendingSpamFlag = message.spam_flags?.find(f => f.user_action === 'pending');

  const handleSpamAction = async (action: 'confirmed' | 'dismissed') => {
    if (!pendingSpamFlag) return;
    await updateSpamFlag(pendingSpamFlag.id, action);
    if (action === 'confirmed') {
      await moveToSpam(message.thread_id);
      toast.success('Moved to Spam');
    } else {
      toast.success('Marked as not spam');
    }
  };

  const handleAttachmentPreview = async (att: Attachment, idx: number, allAtts: Attachment[]) => {
    // Get signed URLs for all attachments in this message for gallery
    const gallery: GalleryItem[] = await Promise.all(
      allAtts.map(async a => {
        const { data } = await supabase.storage.from('attachments').createSignedUrl(a.storage_path, 300);
        return { url: data?.signedUrl ?? '', filename: a.filename ?? 'Attachment', mime: a.mime_type ?? '' };
      })
    );
    onPreviewAttachment(gallery[idx].url, gallery, idx);
  };

  return (
    <div className={cn('border-b border-border last:border-0', isLast && 'rounded-b-lg')}>
      <div
        className={cn('flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors', !isExpanded && 'rounded-md')}
        onClick={onToggle}
      >
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0">
          {(message.from_name ?? message.from_address ?? '?')[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium truncate">{message.from_name ?? message.from_address}</span>
            {message.from_name && <span className="text-xs text-muted-foreground truncate">&lt;{message.from_address}&gt;</span>}
          </div>
          {!isExpanded && (
            <p className="text-xs text-muted-foreground truncate">{message.body_text?.slice(0, 80) ?? ''}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {message.read_receipt_confirmed_at && (
            <span
              className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium"
              title={`Read receipt confirmed at ${format(new Date(message.read_receipt_confirmed_at), 'dd MMM yyyy, HH:mm')}`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Read</span>
            </span>
          )}
          {message.sent_at && (
            <span className="text-xs text-muted-foreground hidden sm:block">
              {format(new Date(message.sent_at), 'dd MMM yyyy, HH:mm')}
            </span>
          )}
          {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4">
          <div className="text-xs text-muted-foreground mb-3 space-y-0.5">
            {message.to_addresses?.length > 0 && (
              <p><span className="text-foreground/60">To: </span>{message.to_addresses.join(', ')}</p>
            )}
            {message.cc_addresses?.length > 0 && (
              <p><span className="text-foreground/60">CC: </span>{message.cc_addresses.join(', ')}</p>
            )}
            {message.read_receipt_confirmed_at && (
              <p className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                Read {format(new Date(message.read_receipt_confirmed_at), 'dd MMM yyyy, HH:mm')}
              </p>
            )}
          </div>

          {/* Spam banner */}
          {pendingSpamFlag && (
            <div className="spam-banner flex items-start gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-destructive">This message shows signs of spam</p>
                {pendingSpamFlag.reason && (
                  <p className="text-xs text-muted-foreground mt-0.5">{pendingSpamFlag.reason}</p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleSpamAction('confirmed')}>Move to Spam</Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleSpamAction('dismissed')}>Not Spam</Button>
              </div>
            </div>
          )}

          {/* Body */}
          <div className="email-body">
            {message.body_html ? (
              <div
                dangerouslySetInnerHTML={{ __html: message.body_html }}
                className="prose prose-sm max-w-none dark:prose-invert overflow-x-auto"
              />
            ) : (
              <pre className="whitespace-pre-wrap text-sm font-sans">{message.body_text ?? '(empty message)'}</pre>
            )}
          </div>

          {/* Attachments grid with preview */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                {message.attachments.length} attachment{message.attachments.length > 1 ? 's' : ''}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {message.attachments.map((att, i) => (
                  <AttachmentRow
                    key={att.id}
                    att={att}
                    onPreview={() => handleAttachmentPreview(att, i, message.attachments!)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Reply buttons */}
          <div className="flex gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => onReply(message)}>
              <Reply className="w-3.5 h-3.5 mr-1.5" /> Reply
            </Button>
            <Button variant="outline" size="sm" onClick={() => onReply(message)}>
              <CornerUpRight className="w-3.5 h-3.5 mr-1.5" /> Reply All
            </Button>
            <Button variant="outline" size="sm" onClick={() => onReply(message)}>
              <Forward className="w-3.5 h-3.5 mr-1.5" /> Forward
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- ReadingPane ----
export default function ReadingPane() {
  const { activeThread, activeMessages, loadingMessages, starThread, archiveThread, deleteThread, moveToSpam, setReplyTo } = useMail();
  const { staffUser } = useAuth();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [composingReply, setComposingReply] = useState(false);
  const [replyMessage, setReplyMessage] = useState<Message | null>(null);
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [gallery, setGallery] = useState<{ items: GalleryItem[]; index: number } | null>(null);
  const [showAi, setShowAi] = useState(false);
  const [draftContent, setDraftContent] = useState<string | null>(null);
  const [draftToEdit, setDraftToEdit] = useState<Message | null>(null);

  // Expand latest message by default
  useEffect(() => {
    if (activeMessages.length > 0) {
      setExpandedIds(new Set([activeMessages[activeMessages.length - 1].id]));
    }
    setComposingReply(false);
    setShowAi(false);
    setDraftContent(null);
    setDraftToEdit(null);
  }, [activeMessages]);

  const toggleMessage = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleReply = (message: Message) => {
    setReplyMessage(message);
    setReplyTo(message);
    setComposingReply(true);
    setDraftContent(null);
  };

  const handleUseDraft = (html: string) => {
    setDraftContent(html);
    setReplyMessage(activeMessages[activeMessages.length - 1] ?? null);
    setComposingReply(true);
  };

  const handlePreviewAttachment = (_url: string, items: GalleryItem[], index: number) => {
    setGallery({ items, index });
  };

  if (!activeThread) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background text-center p-8">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <MailOpen className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-base font-semibold mb-1">Select a conversation</h3>
        <p className="text-sm text-muted-foreground max-w-xs">Choose a thread from the list to read your messages</p>
        <div className="mt-4 text-xs text-muted-foreground space-y-1">
          <p><kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">c</kbd> compose · <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">j</kbd>/<kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">k</kbd> navigate · <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">?</kbd> shortcuts</p>
        </div>
      </div>
    );
  }

  if (loadingMessages) {
    return <div className="flex-1 overflow-y-auto"><MessageSkeleton /></div>;
  }

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Action toolbar */}
      <div className="flex items-center gap-0.5 px-3 py-2 border-b border-border shrink-0 flex-wrap">
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Reply (r)" onClick={() => activeMessages.length && handleReply(activeMessages[activeMessages.length - 1])}>
          <Reply className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Reply All (a)" onClick={() => activeMessages.length && handleReply(activeMessages[activeMessages.length - 1])}>
          <CornerUpRight className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Forward (f)" onClick={() => activeMessages.length && handleReply(activeMessages[activeMessages.length - 1])}>
          <Forward className="w-4 h-4" />
        </Button>
        {activeMessages.some(message => message.is_draft) && (
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setDraftToEdit(activeMessages.find(message => message.is_draft) ?? null)}>
            Edit draft
          </Button>
        )}
        <Separator orientation="vertical" className="h-5 mx-1" />
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Star" onClick={() => starThread(activeThread.id, !activeThread.is_starred)}>
          <Star className={cn('w-4 h-4', activeThread.is_starred ? 'fill-yellow-400 text-yellow-400' : '')} />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Archive (e)" onClick={() => archiveThread(activeThread.id)}>
          <Archive className="w-4 h-4" />
        </Button>
        <SnoozePopover open={snoozeOpen} onOpenChange={setSnoozeOpen} threadId={activeThread.id} />
        <FollowUpPopover threadId={activeThread.id} />
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Delete (#)" onClick={() => deleteThread(activeThread.id)}>
          <Trash2 className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Move to Spam" onClick={() => moveToSpam(activeThread.id)}>
          <AlertTriangle className="w-4 h-4" />
        </Button>
        <Separator orientation="vertical" className="h-5 mx-1" />
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Print / Export PDF" onClick={() => printThread(activeThread.subject ?? '(no subject)', activeMessages)}>
          <Printer className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Video Call" onClick={() => setVideoModalOpen(true)}>
          <Video className="w-4 h-4" />
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost" size="sm" className={cn('h-8 text-xs gap-1.5', showAi && 'bg-accent/10')}
          onClick={() => setShowAi(a => !a)}
          style={{ color: 'hsl(var(--accent))' }}
        >
          <Brain className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">AI</span>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-2">
          <h1 className="text-lg font-bold mb-1 text-balance" style={{ fontFamily: 'Playfair Display, serif' }}>
            {activeThread.subject ?? '(no subject)'}
          </h1>
          <p className="text-xs text-muted-foreground mb-4">
            {activeMessages.length} message{activeMessages.length !== 1 ? 's' : ''} · {' '}
            {activeThread.last_message_at && formatDistanceToNow(new Date(activeThread.last_message_at), { addSuffix: true })}
          </p>
        </div>

        {/* AI Panel */}
        {showAi && (
          <AiPanel
            threadId={activeThread.id}
            messages={activeMessages}
            onUseDraft={handleUseDraft}
          />
        )}

        {/* Messages */}
        <div className="mx-4 mb-4 border border-border rounded-lg overflow-hidden">
          {activeMessages.map((message, idx) => (
            <MessageItem
              key={message.id}
              message={message}
              isExpanded={expandedIds.has(message.id)}
              onToggle={() => toggleMessage(message.id)}
              onReply={handleReply}
              isLast={idx === activeMessages.length - 1}
              onPreviewAttachment={handlePreviewAttachment}
            />
          ))}
        </div>

        {/* Quick reply */}
        <div className="px-4 pb-6 flex gap-2">
          <Button variant="outline" size="sm" onClick={() => activeMessages.length && handleReply(activeMessages[activeMessages.length - 1])}>
            <Reply className="w-3.5 h-3.5 mr-1.5" /> Reply
          </Button>
          <Button variant="outline" size="sm" onClick={() => activeMessages.length && handleReply(activeMessages[activeMessages.length - 1])}>
            <Forward className="w-3.5 h-3.5 mr-1.5" /> Forward
          </Button>
        </div>
      </div>

      {/* Reply Compose Panel */}
      {composingReply && replyMessage && (
        <div className="border-t border-border shrink-0 max-h-80">
          <ComposePanel
            mode="reply"
            replyTo={replyMessage}
            onClose={() => { setComposingReply(false); setDraftContent(null); }}
            initialContent={draftContent ?? undefined}
          />
        </div>
      )}

      {draftToEdit && (
        <div className="border-t border-border shrink-0 max-h-80">
          <ComposePanel initialDraft={draftToEdit} onClose={() => setDraftToEdit(null)} />
        </div>
      )}

      {/* Attachment Gallery */}
      {gallery && (
        <AttachmentGallery
          items={gallery.items}
          initialIndex={gallery.index}
          onClose={() => setGallery(null)}
        />
      )}

      <VideoCallModal open={videoModalOpen} onOpenChange={setVideoModalOpen} />
    </div>
  );
}
