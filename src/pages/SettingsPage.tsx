// @refresh reset
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Search, Users, BookMarked, FileText, X, Bell, BellOff, Volume2, VolumeX, Hash, Music, Play, Upload, Trash, Lock, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchSignatures, upsertSignature, deleteSignature,
  fetchRules, upsertRule, deleteRule,
  fetchEmailTemplates, upsertEmailTemplate, deleteEmailTemplate,
  fetchContactGroups, createContactGroup, updateContactGroup, deleteContactGroup, fetchGroupMembers, addGroupMember, removeGroupMember,
  fetchSavedSearches, createSavedSearch, deleteSavedSearch,
  updateOooSettings,
} from '@/services/api';
import type { Signature, Rule, Mailbox, EmailTemplate, ContactGroup, SavedSearch, Contact } from '@/types/types';
import {
  getNotificationPermission,
  requestNotificationPermission,
  loadPrefsFromDb,
  savePrefsToDb,
  SOUND_PRESETS,
  playPresetSound,
  playCustomSound,
  uploadCustomSound,
  deleteCustomSound,
  type NotificationPrefs,
} from '@/services/notificationService';
import { NotificationStatusBadge } from '@/components/mail/NotificationPrompt';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import LinkExtension from '@tiptap/extension-link';
import RichTextEditor from '@/components/mail/RichTextEditor';
import SignatureToolbar from '@/components/mail/SignatureToolbar';
import { signaturePreviewPipeline } from '@/lib/signaturePreview';
import DOMPurify from 'dompurify';

const sanitizeTemplateHtml = (html: string) => DOMPurify.sanitize(html, {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['base', 'form', 'iframe', 'object', 'embed', 'svg', 'math'],
});

// ---- Security Tab ----
function SecurityTab({ staffUserId }: { staffUserId: string }) {
  const { updatePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const validate = () => {
    if (!current || !newPw || !confirm) return 'Please fill in all fields';
    if (newPw.length < 8 || !/\d/.test(newPw)) return 'New password must be at least 8 characters and include a number';
    if (newPw !== confirm) return 'New passwords do not match';
    if (newPw === current) return 'New password must be different from the current password';
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const validation = validate();
    if (validation) { setError(validation); return; }

    setLoading(true);
    try {
      // Re-authenticate with current password
      const { data: sessionData } = await supabase.auth.getSession();
      const email = sessionData.session?.user?.email;
      if (!email) throw new Error('Unable to verify session');

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (signInError) {
        setError('Current password is incorrect');
        toast.error('Current password is incorrect');
        setLoading(false);
        return;
      }

      const { error: updateError, requiresSignIn } = await updatePassword(newPw);
      if (updateError) throw new Error(updateError);

      toast.success(requiresSignIn
        ? 'Password updated. Please sign in again with your new password.'
        : 'Password updated successfully');
      setCurrent('');
      setNewPw('');
      setConfirm('');
    } catch (err) {
      const message = (err as Error).message || 'Failed to update password';
      const friendlyMessage = message.includes('Password') || message.includes('weak')
        ? 'Password is too weak. Choose a stronger password.'
        : message;
      setError(friendlyMessage);
      toast.error(friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Lock className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Change Password</h3>
            <p className="text-sm text-muted-foreground">
              This changes your Frimps Mail login password only. Your mailbox itself is managed separately and doesn't need to be changed here.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
          <div className="space-y-1.5">
            <Label htmlFor="current-password">Current Password</Label>
            <div className="relative">
              <Input
                id="current-password"
                type={showCurrent ? 'text' : 'password'}
                value={current}
                onChange={e => setCurrent(e.target.value)}
                required
                className="pr-10"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-password">New Password</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNew ? 'text' : 'password'}
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                required
                className="pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNew(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">At least 8 characters and one number.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirm ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                className="pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/8 border border-destructive/20 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading} className="rounded-full">
            {loading ? 'Updating…' : 'Update Password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ---- Signatures Tab ----
function SignaturesTab({ mailbox }: { mailbox: Mailbox | null }) {
  const [sigs, setSigs] = useState<Signature[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Signature | null>(null);
  const [isDefault, setIsDefault] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [bodyHtml, setBodyHtml] = useState('');

  const load = async () => {
    if (!mailbox) return;
    const data = await fetchSignatures(mailbox.id);
    setSigs(data);
  };

  useEffect(() => { load(); }, [mailbox]); // eslint-disable-line

  const openAdd = () => {
    setEditing(null);
    setIsDefault(false);
    setBodyHtml('');
    setDialogOpen(true);
  };

  const openEdit = (s: Signature) => {
    setEditing(s);
    setIsDefault(s.is_default);
    setBodyHtml(s.body_html);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!mailbox) return;
    if (!bodyHtml || bodyHtml === '<p></p>') { toast.error('Signature cannot be empty'); return; }
    await upsertSignature({ id: editing?.id, mailbox_id: mailbox.id, body_html: bodyHtml, is_default: isDefault });
    toast.success(editing ? 'Signature updated' : 'Signature added');
    setDialogOpen(false);
    setBodyHtml('');
    load();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteSignature(deleteId);
    toast.success('Signature deleted');
    setDeleteId(null);
    load();
  };

  const handleImageUpload = async (file: File): Promise<string> => {
    if (!mailbox) throw new Error('No mailbox selected');
    const ext = file.name.split('.').pop() ?? 'png';
    const path = `signatures/${mailbox.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('logos').upload(path, file, { contentType: file.type });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path);
    return publicUrl;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Signatures auto-append to outgoing emails.</p>
        <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-2" /> New Signature</Button>
      </div>

      {sigs.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No signatures yet.</CardContent></Card>
      ) : sigs.map(s => (
        <Card key={s.id}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {s.is_default && <Badge className="mb-2 text-xs">Default</Badge>}
                {/* Sandboxed iframe so external HTML/images render faithfully without Tailwind bleed */}
                <iframe
                  srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;}img{max-width:100%;height:auto;display:inline-block;}*{box-sizing:border-box;}</style></head><body>${s.body_html}</body></html>`}
                  sandbox="allow-same-origin"
                  className="w-full border border-border rounded-md bg-white"
                  style={{ minHeight: '60px', height: 'auto' }}
                  onLoad={e => {
                    const f = e.currentTarget;
                    const h = f.contentDocument?.body?.scrollHeight;
                    if (h) f.style.height = h + 24 + 'px';
                  }}
                  title="Signature preview"
                />
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? 'Edit Signature' : 'New Signature'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <RichTextEditor
              content={bodyHtml}
              onChange={setBodyHtml}
              placeholder="Build your signature…"
              maxImageWidth={300}
              onInlineImageUpload={handleImageUpload}
            />
            <div className="flex items-center gap-2">
              <Switch checked={isDefault} onCheckedChange={setIsDefault} />
              <Label>Set as default signature</Label>
            </div>
            <div className="border border-border rounded-md overflow-hidden">
              <div className="bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border">
                Live Preview (as seen by recipients)
              </div>
              {/* Sandboxed iframe: no Tailwind/dark-mode bleed, images render at true size */}
              <iframe
                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;}img{max-width:100%;height:auto;display:inline-block;}*{box-sizing:border-box;}</style></head><body>${signaturePreviewPipeline(bodyHtml)}</body></html>`}
                sandbox="allow-same-origin"
                className="w-full bg-white"
                style={{ minHeight: '80px', height: 'auto' }}
                onLoad={e => {
                  const f = e.currentTarget;
                  const h = f.contentDocument?.body?.scrollHeight;
                  if (h) f.style.height = h + 24 + 'px';
                }}
                title="Live signature preview"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <AlertDialogHeader><AlertDialogTitle>Delete Signature</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---- Rules Tab ----
function RulesTab({ mailbox }: { mailbox: Mailbox | null }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    from_contains: '', subject_contains: '', to_contains: '',
    action_label: '', action_folder: '', action_mark_read: false,
    is_active: true,
  });

  const load = async () => {
    if (!mailbox) return;
    const data = await fetchRules(mailbox.id);
    setRules(data);
  };

  useEffect(() => { load(); }, [mailbox]); // eslint-disable-line

  const openAdd = () => {
    setEditing(null);
    setForm({ from_contains: '', subject_contains: '', to_contains: '', action_label: '', action_folder: '', action_mark_read: false, is_active: true });
    setDialogOpen(true);
  };

  const openEdit = (r: Rule) => {
    setEditing(r);
    setForm({
      from_contains: r.condition_json.from_contains ?? '',
      subject_contains: r.condition_json.subject_contains ?? '',
      to_contains: r.condition_json.to_contains ?? '',
      action_label: r.action_json.add_label ?? '',
      action_folder: r.action_json.move_to_folder ?? '',
      action_mark_read: r.action_json.mark_as_read ?? false,
      is_active: r.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!mailbox) return;
    if (!form.from_contains && !form.subject_contains && !form.to_contains) {
      toast.error('Add at least one condition'); return;
    }
    const condition_json = {
      ...(form.from_contains && { from_contains: form.from_contains }),
      ...(form.subject_contains && { subject_contains: form.subject_contains }),
      ...(form.to_contains && { to_contains: form.to_contains }),
    };
    const action_json = {
      ...(form.action_label && { add_label: form.action_label }),
      ...(form.action_folder && { move_to_folder: form.action_folder }),
      ...(form.action_mark_read && { mark_as_read: true }),
    };
    await upsertRule({ id: editing?.id, mailbox_id: mailbox.id, condition_json, action_json, is_active: form.is_active });
    toast.success(editing ? 'Rule updated' : 'Rule created');
    setDialogOpen(false);
    load();
  };

  const toggleRule = async (r: Rule) => {
    await upsertRule({ ...r, is_active: !r.is_active });
    load();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteRule(deleteId);
    toast.success('Rule deleted');
    setDeleteId(null);
    load();
  };

  const describeRule = (r: Rule) => {
    const conds: string[] = [];
    if (r.condition_json.from_contains) conds.push(`From contains "${r.condition_json.from_contains}"`);
    if (r.condition_json.subject_contains) conds.push(`Subject contains "${r.condition_json.subject_contains}"`);
    const acts: string[] = [];
    if (r.action_json.add_label) acts.push(`Label: ${r.action_json.add_label}`);
    if (r.action_json.move_to_folder) acts.push(`Move to ${r.action_json.move_to_folder}`);
    if (r.action_json.mark_as_read) acts.push('Mark as read');
    return { conds, acts };
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Rules are applied by the sync service when new messages arrive.</p>
        <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-2" /> New Rule</Button>
      </div>

      {rules.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No rules yet.</CardContent></Card>
      ) : rules.map(r => {
        const { conds, acts } = describeRule(r);
        return (
          <Card key={r.id} className={r.is_active ? '' : 'opacity-60'}>
            <CardContent className="p-4 flex items-start gap-3">
              <button onClick={() => toggleRule(r)} className="shrink-0 mt-0.5">
                {r.is_active
                  ? <ToggleRight className="w-5 h-5 text-primary" />
                  : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm"><span className="font-medium">If</span> {conds.join(' AND ')}</p>
                <p className="text-sm text-muted-foreground"><span className="font-medium">Then</span> {acts.join(', ') || '(no actions)'}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Rule' : 'New Rule'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Conditions (any match)</p>
            {['from_contains', 'subject_contains', 'to_contains'].map(field => (
              <div key={field} className="space-y-1.5">
                <Label className="capitalize">{field.replace('_', ' ')}</Label>
                <Input value={(form as Record<string, string | boolean>)[field] as string} onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))} placeholder={`e.g. newsletter`} />
              </div>
            ))}
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-2">Actions</p>
            <div className="space-y-1.5">
              <Label>Add Label</Label>
              <Input value={form.action_label} onChange={e => setForm(p => ({ ...p, action_label: e.target.value }))} placeholder="e.g. newsletter" />
            </div>
            <div className="space-y-1.5">
              <Label>Move to Folder</Label>
              <Select value={form.action_folder} onValueChange={v => setForm(p => ({ ...p, action_folder: v }))}>
                <SelectTrigger><SelectValue placeholder="Don't move" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Don't move</SelectItem>
                  <SelectItem value="archive">Archive</SelectItem>
                  <SelectItem value="spam">Spam</SelectItem>
                  <SelectItem value="trash">Trash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.action_mark_read} onCheckedChange={v => setForm(p => ({ ...p, action_mark_read: v }))} />
              <Label>Mark as read</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))} />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save Rule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <AlertDialogHeader><AlertDialogTitle>Delete Rule</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---- Out-of-Office Tab (enhanced: date range + HTML body) ----
function OutOfOfficeTab({ mailbox }: { mailbox: Mailbox | null }) {
  const [enabled, setEnabled] = useState(false);
  const [subject, setSubject] = useState('Out of office');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);

  const bodyEditor = useEditor({
    extensions: [
      StarterKit,
      LinkExtension.configure({ openOnClick: false, autolink: true }),
    ],
    content: '<p>I am currently out of the office. I will respond when I return.</p>',
  });

  useEffect(() => {
    if (mailbox) {
      const m = mailbox as Mailbox & {
        ooo_enabled?: boolean; ooo_subject?: string; ooo_start_date?: string;
        ooo_end_date?: string; ooo_body_html?: string;
      };
      setEnabled(m.ooo_enabled ?? false);
      setSubject(m.ooo_subject ?? 'Out of office');
      setStartDate(m.ooo_start_date?.slice(0, 10) ?? '');
      setEndDate(m.ooo_end_date?.slice(0, 10) ?? '');
      if (m.ooo_body_html && bodyEditor) bodyEditor.commands.setContent(m.ooo_body_html);
    }
  }, [mailbox?.id]); // eslint-disable-line

  const handleSave = async () => {
    if (!mailbox) return;
    setSaving(true);
    try {
      await updateOooSettings(mailbox.id, {
        ooo_enabled: enabled,
        ooo_subject: subject,
        ooo_body_html: bodyEditor?.getHTML() ?? '',
        ooo_start_date: startDate || undefined,
        ooo_end_date: endDate || undefined,
      });
      toast.success(enabled ? 'Out-of-office enabled' : 'Out-of-office disabled');
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 max-w-lg">
      <div className="flex items-center gap-3 p-4 rounded-lg border border-border bg-muted/30">
        <Switch checked={enabled} onCheckedChange={setEnabled} id="ooo-toggle" />
        <div>
          <Label htmlFor="ooo-toggle" className="text-sm font-medium cursor-pointer">Out-of-Office Auto-Reply</Label>
          <p className="text-xs text-muted-foreground">Automatically reply to incoming emails while you're away</p>
        </div>
      </div>

      {enabled && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End date</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Reply subject</Label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Out of office" />
          </div>
          <div className="space-y-1.5">
            <Label>Reply message</Label>
            <div className="border border-border rounded-md overflow-hidden">
              <SignatureToolbar editor={bodyEditor} onImage={() => {}} />
              <div className="tiptap-editor min-h-[120px]">
                <EditorContent editor={bodyEditor} />
              </div>
            </div>
          </div>
        </>
      )}
      <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</Button>
    </div>
  );
}

// ---- Email Templates Tab ----
function TemplatesTab({ orgId }: { orgId: string }) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const uploadRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ allowBase64: false, HTMLAttributes: { class: 'max-w-full h-auto rounded-md' } }),
      LinkExtension.configure({ openOnClick: false, autolink: true }),
    ],
    content: '',
  });

  const load = () => fetchEmailTemplates(orgId).then(setTemplates);
  useEffect(() => { load(); }, [orgId]); // eslint-disable-line

  const openAdd = () => {
    setEditing(null); setName(''); setSubject('');
    editor?.commands.setContent('');
    setDialogOpen(true);
  };
  const openEdit = (t: EmailTemplate) => {
    setEditing(t); setName(t.name); setSubject(t.subject ?? '');
    editor?.commands.setContent(t.body_html);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const body_html = sanitizeTemplateHtml(editor?.getHTML() ?? '');
    if (!name.trim()) { toast.error('Name required'); return; }
    if (!body_html || body_html === '<p></p>') { toast.error('Template body required'); return; }
    await upsertEmailTemplate({ id: editing?.id, organization_id: orgId, name, subject: subject || null, body_html, category: null, is_shared: false, created_by: null });
    toast.success(editing ? 'Template updated' : 'Template created');
    setDialogOpen(false);
    load();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteEmailTemplate(deleteId);
    toast.success('Template deleted');
    setDeleteId(null);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Reusable email templates for common replies.</p>
        <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-2" /> New Template</Button>
      </div>

      {templates.length === 0 ? (
        <Card><CardContent className="py-10 text-center">
          <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No templates yet. Create one to speed up replies.</p>
        </CardContent></Card>
      ) : templates.map(t => (
        <Card key={t.id}>
          <CardContent className="p-4 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{t.name}</p>
              {t.subject && <p className="text-xs text-muted-foreground">Subject: {t.subject}</p>}
              <div
                className="text-xs text-muted-foreground mt-1 line-clamp-2 prose prose-sm max-w-none dark:prose-invert"
                dangerouslySetInnerHTML={{ __html: sanitizeTemplateHtml(t.body_html) }}
              />
            </div>
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}><Pencil className="w-3.5 h-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(t.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? 'Edit Template' : 'New Email Template'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Template name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Invoice follow-up" />
            </div>
            <div className="space-y-1.5">
              <Label>Default subject (optional)</Label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Following up on invoice #123" />
            </div>
            <div className="space-y-1.5">
              <Label>Body *</Label>
              <div className="border border-border rounded-md overflow-hidden">
                <SignatureToolbar editor={editor} onImage={() => uploadRef.current?.click()} />
                <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={async e => {
                  const file = e.target.files?.[0]; if (!file) return;
                  const path = `templates/${orgId}/${Date.now()}_${file.name}`;
                  const { error } = await supabase.storage.from('logos').upload(path, file, { contentType: file.type });
                  if (error) { toast.error('Upload failed'); return; }
                  const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path);
                  editor?.chain().focus().setImage({ src: publicUrl, alt: file.name }).run();
                }} />
                <div className="tiptap-editor min-h-[180px]"><EditorContent editor={editor} /></div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save Template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <AlertDialogHeader><AlertDialogTitle>Delete Template</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---- Saved Searches Tab ----
function SavedSearchesTab({ staffUserId }: { staffUserId: string }) {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', query: '', folder_filter: '', has_attachment: false, is_unread: false });

  const load = () => fetchSavedSearches(staffUserId).then(setSearches);
  useEffect(() => { load(); }, [staffUserId]); // eslint-disable-line

  const handleSave = async () => {
    if (!form.name.trim() && !form.query.trim()) { toast.error('Name and query required'); return; }
    await createSavedSearch({
      staff_user_id: staffUserId,
      name: form.name,
      query: form.query,
      filters: {
        ...(form.folder_filter ? { folder: form.folder_filter } : {}),
        ...(form.has_attachment ? { has_attachment: true } : {}),
        ...(form.is_unread ? { is_unread: true } : {}),
      } as Record<string, unknown>,
    });
    toast.success('Search saved');
    setDialogOpen(false);
    setForm({ name: '', query: '', folder_filter: '', has_attachment: false, is_unread: false });
    load();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteSavedSearch(deleteId);
    toast.success('Search deleted');
    setDeleteId(null);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Save frequently used searches as smart folders.</p>
        <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-2" /> New Search</Button>
      </div>

      {searches.length === 0 ? (
        <Card><CardContent className="py-10 text-center">
          <Search className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No saved searches. Create smart folders to quickly find emails.</p>
        </CardContent></Card>
      ) : searches.map(s => (
        <Card key={s.id}>
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <BookMarked className="w-3.5 h-3.5 text-primary shrink-0" />{s.name}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Query: <span className="font-mono">{s.query || '(no query)'}</span>
                {s.filters?.['folder'] ? ` · Folder: ${String(s.filters['folder'])}` : ''}
                {s.filters?.['has_attachment'] ? ' · Has attachment' : ''}
                {s.filters?.['is_unread'] ? ' · Unread only' : ''}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => setDeleteId(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
          </CardContent>
        </Card>
      ))}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader><DialogTitle>New Saved Search</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Unread invoices" />
            </div>
            <div className="space-y-1.5">
              <Label>Search query</Label>
              <Input value={form.query} onChange={e => setForm(p => ({ ...p, query: e.target.value }))} placeholder='e.g. "invoice" or from:client@example.com' />
              <p className="text-xs text-muted-foreground">Use keywords, from:, subject: prefixes</p>
            </div>
            <div className="space-y-1.5">
              <Label>Folder filter</Label>
              <Select value={form.folder_filter} onValueChange={v => setForm(p => ({ ...p, folder_filter: v }))}>
                <SelectTrigger><SelectValue placeholder="Any folder" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any folder</SelectItem>
                  <SelectItem value="inbox">Inbox</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="archive">Archive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <div className="flex items-center gap-2">
                <Switch checked={form.has_attachment} onCheckedChange={v => setForm(p => ({ ...p, has_attachment: v }))} id="att" />
                <Label htmlFor="att">Has attachment</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_unread} onCheckedChange={v => setForm(p => ({ ...p, is_unread: v }))} id="unread" />
                <Label htmlFor="unread">Unread only</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>Save Search</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <AlertDialogHeader><AlertDialogTitle>Delete Search</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---- Contact Groups Tab ----
function ContactGroupsTab({ orgId }: { orgId: string }) {
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ContactGroup | null>(null);
  const [membersGroup, setMembersGroup] = useState<ContactGroup | null>(null);
  const [members, setMembers] = useState<Contact[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [form, setForm] = useState({ name: '', description: '' });
  const [searchContact, setSearchContact] = useState('');

  const load = () => fetchContactGroups(orgId).then(setGroups);
  useEffect(() => { load(); }, [orgId]); // eslint-disable-line

  const loadContacts = async () => {
    const { data } = await supabase.from('contacts').select('id,name,email').eq('organization_id', orgId).order('name').limit(200);
    setContacts((data ?? []) as Contact[]);
  };

  const openMembers = async (g: ContactGroup) => {
    setMembersGroup(g);
    const [m] = await Promise.all([fetchGroupMembers(g.id), loadContacts()]);
    setMembers(m);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name required'); return; }
    if (editing) {
      await updateContactGroup(editing.id, { name: form.name, description: form.description });
      toast.success('Group updated');
    } else {
      await createContactGroup({ organization_id: orgId, mailbox_id: null, name: form.name, description: form.description, created_by: null });
      toast.success('Group created');
    }
    setDialogOpen(false);
    load();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteContactGroup(deleteId);
    toast.success('Group deleted');
    setDeleteId(null);
    load();
  };

  const toggleMember = async (contact: Contact) => {
    if (!membersGroup) return;
    const isMember = members.some(m => m.id === contact.id);
    if (isMember) {
      await removeGroupMember(membersGroup.id, contact.id);
      setMembers(prev => prev.filter(m => m.id !== contact.id));
    } else {
      await addGroupMember(membersGroup.id, contact.id);
      setMembers(prev => [...prev, contact]);
    }
  };

  const filtered = contacts.filter(c =>
    !searchContact || c.name?.toLowerCase().includes(searchContact.toLowerCase()) || c.email?.toLowerCase().includes(searchContact.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Distribution lists for sending to multiple contacts at once.</p>
        <Button size="sm" onClick={() => { setEditing(null); setForm({ name: '', description: '' }); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" /> New Group
        </Button>
      </div>

      {groups.length === 0 ? (
        <Card><CardContent className="py-10 text-center">
          <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No contact groups. Create one to send to multiple people at once.</p>
        </CardContent></Card>
      ) : groups.map(g => (
        <Card key={g.id}>
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{g.name}</p>
              {g.description && <p className="text-xs text-muted-foreground">{g.description}</p>}
            </div>
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openMembers(g)}>
                <Users className="w-3.5 h-3.5 mr-1" /> Members
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(g); setForm({ name: g.name, description: g.description ?? '' }); setDialogOpen(true); }}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(g.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Group' : 'New Contact Group'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Group name *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Management, Sales Team" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Optional description" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editing ? 'Update' : 'Create Group'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Members Dialog */}
      <Dialog open={!!membersGroup} onOpenChange={o => !o && setMembersGroup(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md max-h-[90dvh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Members — {membersGroup?.name}</DialogTitle>
          </DialogHeader>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchContact}
              onChange={e => setSearchContact(e.target.value)}
              placeholder="Search contacts…"
              className="pl-9"
            />
          </div>
          <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
            {filtered.map(c => {
              const isMember = members.some(m => m.id === c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggleMember(c)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted transition-colors text-left"
                >
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${isMember ? 'bg-primary border-primary' : 'border-border'}`}>
                    {isMember && <X className="w-2.5 h-2.5 text-primary-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.name ?? c.email}</p>
                    {c.name && <p className="text-xs text-muted-foreground truncate">{c.email}</p>}
                  </div>
                  {isMember && <Badge variant="secondary" className="text-xs h-5 shrink-0">Member</Badge>}
                </button>
              );
            })}
            {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No contacts found</p>}
          </div>
          <DialogFooter>
            <Button onClick={() => setMembersGroup(null)}>Done ({members.length} members)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <AlertDialogHeader><AlertDialogTitle>Delete Group</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---- Notifications Tab ----
function NotificationsTab({ staffUserId }: { staffUserId: string }) {
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    push_enabled: true,
    sound_enabled: false,
    badge_enabled: true,
    sound_preset: 'chime',
    custom_sound_url: null,
  });
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [requestingPerm, setRequestingPerm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPermission(getNotificationPermission());
    loadPrefsFromDb(staffUserId).then(setPrefs);
  }, [staffUserId]);

  const persist = async (next: NotificationPrefs) => {
    setPrefs(next);
    setSaving(true);
    await savePrefsToDb(staffUserId, next);
    setSaving(false);
  };

  const handleToggle = async (key: keyof NotificationPrefs, value: boolean) => {
    await persist({ ...prefs, [key]: value });
    toast.success('Preferences saved');
  };

  const handlePresetChange = async (preset: string) => {
    const next = { ...prefs, sound_preset: preset };
    await persist(next);
    if (preset !== 'custom') {
      playPresetSound(preset);
    } else if (next.custom_sound_url) {
      playCustomSound(next.custom_sound_url);
    }
    toast.success('Sound preset saved');
  };

  const handleCustomUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    // Delete previous custom sound if present
    await deleteCustomSound(prefs.custom_sound_url);
    const { url, error } = await uploadCustomSound(staffUserId, file);
    setUploading(false);
    if (error || !url) {
      toast.error(error ?? 'Upload failed');
      return;
    }
    const next = { ...prefs, sound_preset: 'custom', custom_sound_url: url };
    await persist(next);
    playCustomSound(url);
    toast.success('Custom sound uploaded');
  };

  const handleRemoveCustom = async () => {
    await deleteCustomSound(prefs.custom_sound_url);
    const next = { ...prefs, sound_preset: 'chime', custom_sound_url: null };
    await persist(next);
    toast.success('Custom sound removed');
  };

  const handleRequestPermission = async () => {
    setRequestingPerm(true);
    const result = await requestNotificationPermission();
    setPermission(result);
    setRequestingPerm(false);
    if (result === 'granted') {
      toast.success('Push notifications enabled!');
      const next = { ...prefs, push_enabled: true };
      await persist(next);
    } else if (result === 'denied') {
      toast.error('Notifications blocked — enable them in your browser settings.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Permission status */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                <p className="text-sm font-semibold">Browser Permission</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Frimps Mail needs browser permission to show native desktop notifications.
              </p>
              <div className="mt-2">
                <NotificationStatusBadge />
              </div>
            </div>
            {permission !== 'granted' && permission !== 'denied' && (
              <Button
                size="sm"
                onClick={handleRequestPermission}
                disabled={requestingPerm}
                className="shrink-0"
              >
                {requestingPerm ? (
                  <span className="h-3.5 w-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                ) : (
                  'Enable now'
                )}
              </Button>
            )}
            {permission === 'denied' && (
              <Badge variant="outline" className="text-xs text-destructive border-destructive/30 shrink-0">
                Blocked in browser
              </Badge>
            )}
            {permission === 'granted' && (
              <Badge variant="outline" className="text-xs text-green-600 border-green-300 shrink-0">
                ✓ Granted
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Toggle options */}
      <Card>
        <CardContent className="p-5 divide-y divide-border">
          {/* Push enabled */}
          <div className="flex items-center justify-between gap-4 py-4 first:pt-0">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                {prefs.push_enabled ? <Bell className="w-4 h-4 text-primary" /> : <BellOff className="w-4 h-4 text-muted-foreground" />}
              </div>
              <div>
                <p className="text-sm font-medium">Push notifications</p>
                <p className="text-xs text-muted-foreground mt-0.5">Show a desktop alert when a new email arrives.</p>
              </div>
            </div>
            <Switch
              checked={prefs.push_enabled}
              onCheckedChange={v => handleToggle('push_enabled', v)}
              disabled={permission !== 'granted' || saving}
            />
          </div>

          {/* Sound enabled */}
          <div className="flex items-center justify-between gap-4 py-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                {prefs.sound_enabled ? <Volume2 className="w-4 h-4 text-accent-foreground" /> : <VolumeX className="w-4 h-4 text-muted-foreground" />}
              </div>
              <div>
                <p className="text-sm font-medium">Notification sound</p>
                <p className="text-xs text-muted-foreground mt-0.5">Play a brief audio chime alongside each notification.</p>
              </div>
            </div>
            <Switch
              checked={prefs.sound_enabled}
              onCheckedChange={v => handleToggle('sound_enabled', v)}
              disabled={!prefs.push_enabled || permission !== 'granted' || saving}
            />
          </div>

          {/* Sound preset picker */}
          {prefs.sound_enabled && (
            <div className="py-4 space-y-3">
              <div className="flex items-center gap-2">
                <Music className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Choose sound</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SOUND_PRESETS.map(preset => {
                  const isCustom = preset.id === 'custom';
                  const isActive = prefs.sound_preset === preset.id;
                  const disabled = !prefs.sound_enabled || saving || (isCustom && !prefs.custom_sound_url && !isActive);
                  return (
                    <button
                      key={preset.id}
                      onClick={() => handlePresetChange(preset.id)}
                      disabled={disabled}
                      className={`
                        flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-left transition-all
                        ${isActive
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border bg-card hover:bg-muted/50 text-foreground disabled:opacity-50 disabled:hover:bg-card'
                        }
                      `}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{preset.label}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{preset.description}</p>
                      </div>
                      {!isCustom && (
                        <span
                          className="p-1 rounded-md hover:bg-primary/10 shrink-0"
                          onClick={ev => { ev.stopPropagation(); playPresetSound(preset.id); }}
                          title="Preview"
                        >
                          <Play className="w-3 h-3" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Custom upload */}
              {prefs.sound_preset === 'custom' && (
                <div className="mt-3 p-3 border border-dashed border-border rounded-lg bg-muted/30">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    onChange={handleCustomUpload}
                    className="hidden"
                  />
                  {prefs.custom_sound_url ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Music className="w-4 h-4 text-primary shrink-0" />
                        <span className="text-xs truncate">{prefs.custom_sound_url.split('/').pop()?.split('?')[0]}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => playCustomSound(prefs.custom_sound_url!)}>
                          <Play className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={handleRemoveCustom}>
                          <Trash className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="w-full flex flex-col items-center gap-1 py-2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {uploading ? (
                        <span className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                      <span className="text-xs font-medium">{uploading ? 'Uploading...' : 'Upload MP3, WAV or OGG (max 2 MB)'}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Badge */}
          <div className="flex items-center justify-between gap-4 py-4 last:pb-0">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <Hash className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Unread badge count</p>
                <p className="text-xs text-muted-foreground mt-0.5">Show the unread email count in the browser tab title and PWA icon.</p>
              </div>
            </div>
            <Switch
              checked={prefs.badge_enabled}
              onCheckedChange={v => handleToggle('badge_enabled', v)}
              disabled={saving}
            />
          </div>
        </CardContent>
      </Card>

      {permission === 'denied' && (
        <p className="text-xs text-muted-foreground bg-muted rounded-lg px-4 py-3">
          <strong>To re-enable:</strong> click the lock icon in your browser's address bar → Site settings → Notifications → Allow, then refresh the page.
        </p>
      )}
    </div>
  );
}

// ---- Main Settings Page ----
export default function SettingsPage() {
  const { staffUser, organization } = useAuth();
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [activeMailboxId, setActiveMailboxId] = useState<string>('');

  useEffect(() => {
    if (!staffUser) return;
    supabase
      .from('mailboxes')
      .select('*')
      .then(({ data }) => {
        if (data?.length) {
          setMailboxes(data as Mailbox[]);
          setActiveMailboxId(data[0].id);
        }
      });
  }, [staffUser]);

  const activeMailbox = mailboxes.find(m => m.id === activeMailboxId) ?? null;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card px-6 py-4 flex items-center gap-4">
        <Link to="/inbox"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button></Link>
        <h1 className="text-lg font-semibold">Settings</h1>
      </div>

      <div className="max-w-3xl mx-auto p-6">
        {/* Mailbox selector */}
        {mailboxes.length > 1 && (
          <div className="flex items-center gap-3 mb-6">
            <Label>Mailbox:</Label>
            <Select value={activeMailboxId} onValueChange={setActiveMailboxId}>
              <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                {mailboxes.map(m => <SelectItem key={m.id} value={m.id}>{m.email_address}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <Tabs defaultValue="signatures">
          <div className="overflow-x-auto">
            <TabsList className="mb-6 whitespace-nowrap">
              <TabsTrigger value="signatures">Signatures</TabsTrigger>
              <TabsTrigger value="templates">Templates</TabsTrigger>
              <TabsTrigger value="ooo">Out of Office</TabsTrigger>
              <TabsTrigger value="rules">Rules</TabsTrigger>
              <TabsTrigger value="searches">Saved Searches</TabsTrigger>
              <TabsTrigger value="groups">Contact Groups</TabsTrigger>
              <TabsTrigger value="notifications">Notifications</TabsTrigger>
              <TabsTrigger value="mailboxes">Mailboxes</TabsTrigger>
              <TabsTrigger value="security">Security</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="signatures">
            <SignaturesTab mailbox={activeMailbox} />
          </TabsContent>

          <TabsContent value="templates">
            {organization ? <TemplatesTab orgId={organization.id} /> : <p className="text-sm text-muted-foreground">No organisation found.</p>}
          </TabsContent>

          <TabsContent value="ooo">
            <OutOfOfficeTab mailbox={activeMailbox} />
          </TabsContent>

          <TabsContent value="rules">
            <RulesTab mailbox={activeMailbox} />
          </TabsContent>

          <TabsContent value="searches">
            {staffUser ? <SavedSearchesTab staffUserId={staffUser.id} /> : null}
          </TabsContent>

          <TabsContent value="groups">
            {organization ? <ContactGroupsTab orgId={organization.id} /> : null}
          </TabsContent>

          <TabsContent value="notifications">
            {staffUser ? <NotificationsTab staffUserId={staffUser.id} /> : null}
          </TabsContent>

          <TabsContent value="security">
            {staffUser ? <SecurityTab staffUserId={staffUser.id} /> : null}
          </TabsContent>

      <TabsContent value="mailboxes">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Mailboxes linked to your account (read-only).</p>
              {mailboxes.map(m => (
                <Card key={m.id}>
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{m.email_address}</p>
                      <p className="text-xs text-muted-foreground">{m.display_name ?? ''}</p>
                    </div>
                    <Badge className={
                      m.sync_status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                      m.sync_status === 'error' ? 'bg-red-100 text-red-800' : 'bg-muted text-muted-foreground'
                    }>{m.sync_status}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
