import { useState, useCallback, useRef, useEffect } from 'react';
import {
  X, ChevronDown, Paperclip, Clock, Send, Minus, LayoutTemplate,
  Maximize2, Minimize2, Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useMail } from '@/contexts/MailContext';
import { searchContacts, fetchSignatures, fetchEmailTemplates, fetchContactGroups, expandGroupToEmails } from '@/services/api';
import type { Message, Contact, Signature, EmailTemplate, ContactGroup } from '@/types/types';
import { cn } from '@/lib/utils';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import LinkExt from '@tiptap/extension-link';
import ImageExt from '@tiptap/extension-image';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import FontFamily from '@tiptap/extension-font-family';
import TextAlign from '@tiptap/extension-text-align';
import FontSize from '@tiptap/extension-font-size';
import { format, addHours, addDays, nextMonday, setHours, setMinutes } from 'date-fns';
import RichTextToolbar from './RichTextToolbar';

interface ComposePanelProps {
  mode?: 'compose' | 'reply' | 'replyAll' | 'forward';
  replyTo?: Message;
  onClose: () => void;
  initialContent?: string;
}

function RecipientInput({
  label, value, onChange
}: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState('');
  const { organization } = useAuth();
  const { activeMailbox } = useMail();
  const [suggestions, setSuggestions] = useState<Contact[]>([]);
  const [groupSuggestions, setGroupSuggestions] = useState<ContactGroup[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const search = useCallback(async (q: string) => {
    if (!q || !organization) { setSuggestions([]); setGroupSuggestions([]); return; }
    const [contacts, groups] = await Promise.all([
      searchContacts(organization.id, q),
      fetchContactGroups(organization.id, activeMailbox?.id).then(gs =>
        gs.filter(g => g.name.toLowerCase().includes(q.toLowerCase()))
      ),
    ]);
    setSuggestions(contacts);
    setGroupSuggestions(groups);
    setShowSuggestions(contacts.length > 0 || groups.length > 0);
  }, [organization, activeMailbox?.id]);

  const addAddress = (address: string) => {
    const trimmed = address.trim();
    if (!trimmed) return;
    if (trimmed.includes('@') && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInput('');
    setSuggestions([]);
    setGroupSuggestions([]);
    setShowSuggestions(false);
  };

  const expandGroup = async (group: ContactGroup) => {
    setInput('');
    setSuggestions([]);
    setGroupSuggestions([]);
    setShowSuggestions(false);
    try {
      const emails = await expandGroupToEmails(group.id);
      if (emails.length === 0) { toast.info(`Group "${group.name}" has no members yet`); return; }
      const newAddresses = emails.filter(e => !value.includes(e));
      onChange([...value, ...newAddresses]);
      toast.success(`Added ${newAddresses.length} address${newAddresses.length !== 1 ? 'es' : ''} from "${group.name}"`);
    } catch {
      toast.error('Could not expand group');
    }
  };

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 border-b border-border min-h-[36px]">
        <span className="text-xs text-muted-foreground shrink-0 w-6">{label}</span>
        {value.map(addr => (
          <Badge key={addr} variant="secondary" className="flex items-center gap-1 py-0.5">
            {addr}
            <button onClick={() => onChange(value.filter(a => a !== addr))} className="ml-0.5 hover:text-foreground">
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}
        <input
          className="flex-1 min-w-[120px] text-sm bg-transparent outline-none px-1"
          value={input}
          onChange={e => { setInput(e.target.value); search(e.target.value); }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
              e.preventDefault();
              addAddress(input);
            } else if (e.key === 'Backspace' && !input && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => { if (input) addAddress(input); setTimeout(() => setShowSuggestions(false), 150); }}
          placeholder={value.length === 0 ? 'Type an email or group name…' : ''}
        />
      </div>
      {showSuggestions && (
        <div className="absolute z-50 top-full left-0 right-0 bg-popover border border-border rounded-md shadow-md mt-0.5 max-h-52 overflow-y-auto">
          {/* Contact suggestions */}
          {suggestions.map(c => (
            <button
              key={c.id}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-baseline gap-2"
              onMouseDown={() => addAddress(c.email)}
            >
              <span className="font-medium">{c.name}</span>
              <span className="text-xs text-muted-foreground">{c.email}</span>
            </button>
          ))}
          {/* Group suggestions */}
          {groupSuggestions.length > 0 && (
            <>
              {suggestions.length > 0 && <div className="border-t border-border mx-2" />}
              <div className="px-3 py-1 text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Groups</div>
              {groupSuggestions.map(g => {
                const count = (g as ContactGroup & { contact_group_members?: { count: number }[] })
                  .contact_group_members?.[0]?.count ?? '?';
                return (
                  <button
                    key={g.id}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                    onMouseDown={() => expandGroup(g)}
                  >
                    <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium flex-1">{g.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{count} member{count !== 1 ? 's' : ''}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function ComposePanel({ mode = 'compose', replyTo, onClose, initialContent }: ComposePanelProps) {
  const { activeMailbox } = useMail();
  const { staffUser, organization } = useAuth();

  const [to, setTo] = useState<string[]>(replyTo ? [replyTo.from_address ?? ''] : []);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [subject, setSubject] = useState(() => {
    if (!replyTo) return '';
    if (mode === 'forward') return `Fwd: ${replyTo.subject ?? ''}`;
    const subj = replyTo.subject ?? '';
    return subj.startsWith('Re:') ? subj : `Re: ${subj}`;
  });
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [attachments, setAttachments] = useState<{ file: File; path: string }[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [groupPickerTarget, setGroupPickerTarget] = useState<'to' | 'cc' | 'bcc'>('to');
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [scheduleAt, setScheduleAt] = useState<Date | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [undoTimer, setUndoTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [sendCountdown, setSendCountdown] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const inlineImageRef = useRef<HTMLInputElement>(null);
  const sendAbortRef = useRef<(() => void) | null>(null);

  // Load groups for the insert-group picker
  useEffect(() => {
    if (!organization) return;
    fetchContactGroups(organization.id, activeMailbox?.id).then(setGroups).catch(() => {});
  }, [organization, activeMailbox?.id]);

  const defaultSig = signatures.find(s => s.is_default);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Write your message…' }),
      LinkExt.configure({ openOnClick: false, autolink: true }),
      ImageExt.configure({ allowBase64: false, HTMLAttributes: { class: 'max-w-full h-auto rounded-md' } }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      FontFamily,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      FontSize,
    ],
    content: mode === 'reply' || mode === 'replyAll'
      ? `<p></p><p>—</p><blockquote><p><em>From: ${replyTo?.from_name ?? replyTo?.from_address}</em></p>${replyTo?.body_html ?? ''}</blockquote>`
      : mode === 'forward'
        ? `<p></p><p>—— Forwarded message ——</p><blockquote>${replyTo?.body_html ?? ''}</blockquote>`
        : `<p></p>${defaultSig ? `<hr/>${defaultSig.body_html}` : ''}`,
  });

  // If initialContent (AI draft) provided, populate editor after mount
  useEffect(() => {
    if (initialContent && editor) {
      editor.commands.setContent(initialContent);
    }
  }, [initialContent, editor]); // eslint-disable-line

  // Load signatures
  useEffect(() => {
    if (activeMailbox) {
      fetchSignatures(activeMailbox.id).then(sigs => {
        setSignatures(sigs);
        // Append default sig to editor if compose mode
        if (mode === 'compose' && sigs.find(s => s.is_default) && editor) {
          const sig = sigs.find(s => s.is_default);
          if (sig) editor.commands.setContent(`<p></p><hr/>${sig.body_html}`);
        }
      });
    }
  }, [activeMailbox]); // eslint-disable-line

  // Load templates
  useEffect(() => {
    if (organization) {
      fetchEmailTemplates(organization.id).then(setTemplates);
    }
  }, [organization]);

  // Cleanup undo timer on unmount
  useEffect(() => () => { if (undoTimer) clearTimeout(undoTimer); }, [undoTimer]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !activeMailbox) return;
    setUploadingFile(true);
    try {
      for (const file of files) {
        const path = `attachments/${activeMailbox.id}/compose/${Date.now()}_${file.name}`;
        const { error } = await supabase.storage.from('attachments').upload(path, file);
        if (error) throw error;
        setAttachments(prev => [...prev, { file, path }]);
      }
    } catch {
      toast.error('Failed to upload attachment');
    } finally {
      setUploadingFile(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleInlineImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeMailbox || !editor) return;

    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];
    if (!allowed.includes(file.type)) {
      toast.error('Only image files are allowed for inline images');
      return;
    }

    let uploadFile = file;
    // Auto-compress if over 1 MB
    if (file.size > 1024 * 1024) {
      try {
        uploadFile = await compressImage(file);
        toast.info(`Image compressed to ${formatBytes(uploadFile.size)}`);
      } catch {
        toast.error('Could not compress image, using original');
      }
    }

    try {
      const safeName = uploadFile.name.replace(/[^a-zA-Z0-9.]/g, '_');
      const path = `attachments/${activeMailbox.id}/inline/${Date.now()}_${safeName}`;
      const { error } = await supabase.storage.from('attachments').upload(path, uploadFile);
      if (error) throw error;

      const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path);
      editor.chain().focus().setImage({ src: urlData.publicUrl, alt: uploadFile.name }).run();
    } catch (err) {
      toast.error('Failed to insert inline image');
      console.error(err);
    } finally {
      if (inlineImageRef.current) inlineImageRef.current.value = '';
    }
  };

  const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        const max = 1920;
        if (width > max || height > max) {
          if (width > height) { height = Math.round((height * max) / width); width = max; }
          else { width = Math.round((width * max) / height); height = max; }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('canvas context')); return; }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url);
          if (!blob) { reject(new Error('compression failed')); return; }
          const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' });
          if (compressed.size > 1024 * 1024) {
            // Iteratively degrade quality until under 1 MB
            const tryCompress = (q: number) => {
              canvas.toBlob((b) => {
                if (!b) { reject(new Error('compression failed')); return; }
                const f = new File([b], compressed.name, { type: 'image/webp' });
                if (f.size <= 1024 * 1024 || q <= 0.3) resolve(f);
                else tryCompress(q - 0.1);
              }, 'image/webp', q);
            };
            tryCompress(0.7);
          } else {
            resolve(compressed);
          }
        }, 'image/webp', 0.8);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load error')); };
      img.src = url;
    });
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSend = async () => {
    if (!to.length) { toast.error('Please add at least one recipient'); return; }
    if (!subject.trim()) { toast.error('Please add a subject'); return; }
    if (!activeMailbox) { toast.error('No mailbox selected'); return; }

    // Undo send: 7-second countdown before actually sending
    if (!scheduleAt) {
      let cancelled = false;
      sendAbortRef.current = () => { cancelled = true; };
      setSendCountdown(7);
      const interval = setInterval(() => {
        setSendCountdown(prev => {
          if (prev <= 1) { clearInterval(interval); return 0; }
          return prev - 1;
        });
      }, 1000);

      const toastId = toast('Sending in 7s…', {
        duration: 7000,
        action: {
          label: 'Undo',
          onClick: () => {
            cancelled = true;
            clearInterval(interval);
            setSendCountdown(0);
            sendAbortRef.current = null;
            toast.dismiss(toastId);
            toast.info('Send cancelled');
          },
        },
      });

      const timer = setTimeout(async () => {
        clearInterval(interval);
        setSendCountdown(0);
        if (cancelled) return;
        await doSend();
      }, 7000);
      setUndoTimer(timer);
      return;
    }

    await doSend();
  };

  const doSend = async () => {
    setSending(true);
    try {
      const body = editor?.getHTML() ?? '';

      if (scheduleAt) {
        const { error } = await supabase.from('scheduled_messages').insert({
          mailbox_id: activeMailbox!.id,
          to_addresses: to,
          cc_addresses: cc,
          subject,
          body_html: body,
          attachments_json: attachments.map(a => ({ path: a.path, filename: a.file.name })),
          send_at: scheduleAt.toISOString(),
          status: 'pending',
        });
        if (error) throw error;
        toast.success(`Scheduled for ${format(scheduleAt, 'dd MMM yyyy, HH:mm')}`);
      } else {
        const { error } = await supabase.functions.invoke('send-email', {
          body: {
            mailbox_id: activeMailbox!.id,
            to, cc, bcc, subject,
            body_html: body,
            reply_to_message_id: replyTo?.id,
            attachments: attachments.map(a => ({ path: a.path, filename: a.file.name })),
          },
        });
        if (error) {
          const msg = await error?.context?.text?.();
          throw new Error(msg || error.message);
        }
        toast.success('Message sent');
      }
      onClose();
    } catch (e: unknown) {
      toast.error('Failed to send: ' + (e as Error).message);
    } finally {
      setSending(false);
    }
  };

  const SCHEDULE_OPTIONS = [
    { label: 'Tonight 8:00 PM', value: setMinutes(setHours(new Date(), 20), 0) },
    { label: 'Tomorrow morning', value: setMinutes(setHours(addDays(new Date(), 1), 9), 0) },
    { label: 'Monday morning', value: setMinutes(setHours(nextMonday(new Date()), 9), 0) },
  ];

  if (minimized) {
    return (
      <div className="fixed bottom-0 right-4 w-72 bg-card border border-border rounded-t-lg shadow-lg z-50">
        <div className="flex items-center justify-between px-3 py-2 bg-foreground text-background rounded-t-lg cursor-pointer" onClick={() => setMinimized(false)}>
          <span className="text-sm font-medium truncate">{subject || 'New Message'}</span>
          <div className="flex items-center gap-1">
            <ChevronDown className="w-4 h-4" />
            <button onClick={(e) => { e.stopPropagation(); onClose(); }}><X className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    );
  }

  const composeClasses = mode === 'compose'
    ? expanded
      ? 'fixed inset-4 md:inset-8 w-auto h-auto z-50'
      : 'fixed bottom-4 right-4 w-[min(910px,calc(100vw-2rem))] z-50 max-h-[85vh] md:h-[490px]'
    : 'w-full';

  return (
    <div className={cn('compose-panel flex flex-col', composeClasses)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-foreground text-background rounded-t-lg">
        <span className="text-sm font-medium">{mode === 'compose' ? 'New Message' : mode === 'forward' ? 'Forward' : 'Reply'}</span>
        <div className="flex items-center gap-1">
          {mode === 'compose' && (
            <>
              <button onClick={() => setMinimized(true)} className="hover:text-background/70" title="Minimize">
                <Minus className="w-4 h-4" />
              </button>
              <button onClick={() => setExpanded(e => !e)} className="hover:text-background/70" title={expanded ? 'Shrink' : 'Expand'}>
                {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </>
          )}
          <button onClick={onClose} className="hover:text-background/70" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-col flex-1 overflow-hidden bg-card rounded-b-lg border border-border border-t-0">
        {/* Recipients */}
        <RecipientInput label="To" value={to} onChange={setTo} />
        {showCcBcc && (
          <>
            <RecipientInput label="CC" value={cc} onChange={setCc} />
            <RecipientInput label="BCC" value={bcc} onChange={setBcc} />
          </>
        )}

        {/* Subject */}
        <div className="flex items-center gap-2 px-3 border-b border-border">
          <Input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Subject"
            className="border-0 shadow-none px-0 h-9 text-sm focus-visible:ring-0"
          />
          <button
            onClick={() => setShowCcBcc(!showCcBcc)}
            className="text-xs text-muted-foreground hover:text-foreground shrink-0"
          >
            {showCcBcc ? 'Hide' : 'CC/BCC'}
          </button>
        </div>

        {/* Rich text toolbar */}
        <RichTextToolbar editor={editor} onInlineImage={() => inlineImageRef.current?.click()} />
        <input ref={inlineImageRef} type="file" accept="image/*" className="hidden" onChange={handleInlineImageUpload} />

        {/* Editor */}
        <div className={cn('tiptap-editor flex-1 overflow-y-auto', expanded ? 'min-h-0' : 'min-h-[160px]')}>
          <EditorContent editor={editor} className="h-full" />
        </div>

        {/* Attachments list */}
        {attachments.length > 0 && (
          <div className="px-3 py-2 border-t border-border flex flex-wrap gap-2">
            {attachments.map(({ file, path }) => (
              <Badge key={path} variant="secondary" className="flex items-center gap-1">
                <Paperclip className="w-3 h-3" />
                {file.name}
                <button onClick={() => setAttachments(prev => prev.filter(a => a.path !== path))}>
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {/* Templates picker */}
        {showTemplates && templates.length > 0 && (
          <div className="border-t border-border bg-muted/30 max-h-48 overflow-y-auto">
            <p className="text-xs font-medium px-3 pt-2 pb-1 text-muted-foreground">Email Templates</p>
            {templates.map(t => (
              <button
                key={t.id}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                onClick={() => {
                  if (editor) editor.chain().focus().setContent(t.body_html).run();
                  if (!subject) setSubject(t.subject ?? '');
                  setShowTemplates(false);
                  toast.success(`Template "${t.name}" applied`);
                }}
              >
                <span className="font-medium block truncate">{t.name}</span>
                <span className="text-xs text-muted-foreground truncate block">{t.subject}</span>
              </button>
            ))}
          </div>
        )}

        {/* Group picker panel */}
        {showGroupPicker && (
          <div className="border-t border-border bg-muted/30">
            <div className="flex items-center justify-between px-3 pt-2 pb-1">
              <p className="text-xs font-medium text-muted-foreground">Insert Group into:</p>
              <div className="flex gap-1">
                {(['to', 'cc', 'bcc'] as const).map(field => (
                  <button
                    key={field}
                    onClick={() => setGroupPickerTarget(field)}
                    className={cn(
                      'text-xs px-2 py-0.5 rounded border transition-colors uppercase',
                      groupPickerTarget === field
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:bg-muted'
                    )}
                  >
                    {field}
                  </button>
                ))}
              </div>
            </div>
            {groups.length === 0 ? (
              <p className="text-xs text-muted-foreground px-3 pb-3">No groups yet. Create groups in Contacts → Groups.</p>
            ) : (
              <div className="max-h-44 overflow-y-auto pb-1">
                {groups.map(g => {
                  const count = (g as ContactGroup & { contact_group_members?: { count: number }[] })
                    .contact_group_members?.[0]?.count ?? '?';
                  return (
                    <button
                      key={g.id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center gap-2"
                      onClick={async () => {
                        try {
                          const emails = await expandGroupToEmails(g.id);
                          if (emails.length === 0) { toast.info(`"${g.name}" has no members`); return; }
                          const setter = groupPickerTarget === 'to' ? setTo : groupPickerTarget === 'cc' ? setCc : setBcc;
                          setter(prev => {
                            const newAddrs = emails.filter(e => !prev.includes(e));
                            return [...prev, ...newAddrs];
                          });
                          if (groupPickerTarget !== 'to') setShowCcBcc(true);
                          setShowGroupPicker(false);
                          toast.success(`Added "${g.name}" to ${groupPickerTarget.toUpperCase()}`);
                        } catch {
                          toast.error('Could not expand group');
                        }
                      }}
                    >
                      <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="font-medium flex-1 truncate">{g.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{count} member{count !== 1 ? 's' : ''}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Schedule popover */}
        {showSchedule && (
          <div className="px-3 py-2 border-t border-border bg-muted/30">
            <p className="text-xs font-medium mb-2">Schedule send:</p>
            <div className="flex flex-wrap gap-2">
              {SCHEDULE_OPTIONS.map(opt => (
                <button
                  key={opt.label}
                  className={cn('text-xs px-2 py-1 rounded border transition-colors', scheduleAt?.getTime() === opt.value.getTime() ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted')}
                  onClick={() => setScheduleAt(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
              {scheduleAt && (
                <button className="text-xs px-2 py-1 rounded border border-border hover:bg-muted" onClick={() => setScheduleAt(null)}>
                  Clear
                </button>
              )}
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-3 py-2 border-t border-border">
          <Button size="sm" onClick={handleSend} disabled={sending || sendCountdown > 0} className="rounded-full px-4">
            {sending ? (
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 border border-primary-foreground border-t-transparent rounded-full animate-spin" /> Sending…</span>
            ) : sendCountdown > 0 ? (
              <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Undo ({sendCountdown}s)</span>
            ) : (
              <span className="flex items-center gap-1.5"><Send className="w-3.5 h-3.5" /> {scheduleAt ? 'Schedule' : 'Send'}</span>
            )}
          </Button>

          <Button variant="ghost" size="icon" className="h-8 w-8" title="Attach file" onClick={() => fileRef.current?.click()}>
            {uploadingFile ? <span className="h-4 w-4 border border-foreground border-t-transparent rounded-full animate-spin" /> : <Paperclip className="w-4 h-4" />}
          </Button>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={handleFileUpload} />

          <Button variant="ghost" size="icon" className={cn('h-8 w-8', showSchedule && 'text-primary')} title="Schedule send" onClick={() => { setShowSchedule(!showSchedule); setShowTemplates(false); setShowGroupPicker(false); }}>
            <Clock className="w-4 h-4" />
          </Button>

          <Button variant="ghost" size="icon" className={cn('h-8 w-8', showTemplates && 'text-primary')} title="Email templates" onClick={() => { setShowTemplates(!showTemplates); setShowSchedule(false); setShowGroupPicker(false); }}>
            <LayoutTemplate className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost" size="icon"
            className={cn('h-8 w-8', showGroupPicker && 'text-primary')}
            title="Insert group"
            onClick={() => { setShowGroupPicker(p => !p); setShowTemplates(false); setShowSchedule(false); }}
          >
            <Users className="w-4 h-4" />
          </Button>

          <div className="flex-1" />
          {scheduleAt && (
            <span className="text-xs text-muted-foreground">
              Sending {format(scheduleAt, 'dd MMM, HH:mm')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
