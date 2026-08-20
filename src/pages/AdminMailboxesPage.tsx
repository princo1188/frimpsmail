import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, UserPlus, RefreshCw, Mail, ArrowLeft, ShieldCheck, ShieldOff, RotateCcw, Activity, Zap, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { supabase } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Mailbox, StaffUser } from '@/types/types';
import { formatDistanceToNow } from 'date-fns';

const SYNC_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  syncing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

interface MailboxForm {
  email_address: string;
  display_name: string;
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  password: string;
  staff_user_id: string;
}

const DEFAULT_MB: MailboxForm = {
  email_address: '', display_name: '', imap_host: 'mail.frimpsoil.com.gh',
  imap_port: 993, smtp_host: 'mail.frimpsoil.com.gh', smtp_port: 587,
  password: '', staff_user_id: 'none',
};

interface StaffForm { email: string; full_name: string; role: 'admin' | 'staff'; }

export default function AdminMailboxesPage() {
  const { staffUser, organization } = useAuth();
  const navigate = useNavigate();
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [mbDialogOpen, setMbDialogOpen] = useState(false);
  const [editingMb, setEditingMb] = useState<Mailbox | null>(null);
  const [deleteMbId, setDeleteMbId] = useState<string | null>(null);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [resetMfaUserId, setResetMfaUserId] = useState<string | null>(null);
  const [resettingMfa, setResettingMfa] = useState(false);
  const [mbForm, setMbForm] = useState<MailboxForm>(DEFAULT_MB);
  const [staffForm, setStaffForm] = useState<StaffForm>({ email: '', full_name: '', role: 'staff' });
  const [submitting, setSubmitting] = useState(false);
  const [diagId, setDiagId] = useState<string | null>(null);
  const [diagResult, setDiagResult] = useState<Record<string, unknown> | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [triggerLoading, setTriggerLoading] = useState<string | null>(null);
  const [resetPwMb, setResetPwMb] = useState<Mailbox | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resettingPw, setResettingPw] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const [{ data: mbs }, { data: staff }] = await Promise.all([
      supabase.from('mailboxes').select('*, staff_users(full_name, role)').order('created_at'),
      supabase.from('staff_users').select('*').eq('organization_id', organization?.id ?? '').order('full_name'),
    ]);
    if (mbs) setMailboxes(mbs as Mailbox[]);
    if (staff) setStaffUsers(staff as StaffUser[]);
    setLoading(false);
  };

  const runDiagnosis = async (mailboxId: string) => {
    setDiagLoading(true);
    setDiagId(mailboxId);
    setDiagResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('diagnose-mailbox', {
        body: { mailbox_id: mailboxId },
      });
      if (error) throw error;
      setDiagResult((data ?? {}) as Record<string, unknown>);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDiagLoading(false);
    }
  };

  const resetMailboxPassword = async () => {
    if (!resetPwMb || !newPassword) { toast.error('Enter a new password'); return; }
    setResettingPw(true);
    try {
      const { error } = await supabase.functions.invoke('store-mailbox-credentials', {
        body: {
          email: resetPwMb.email_address,
          password: newPassword,
          mailbox_id: resetPwMb.id,
        },
      });
      if (error) {
        const msg = await error?.context?.text?.();
        throw new Error(msg || error.message);
      }
      toast.success(`Password updated for ${resetPwMb.email_address}`);
      setResetPwMb(null);
      setNewPassword('');
      loadData();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Failed to reset password');
    } finally {
      setResettingPw(false);
    }
  };

  const triggerSync = async (mailboxId: string) => {
    setTriggerLoading(mailboxId);
    try {
      const { data, error } = await supabase.functions.invoke('trigger-mailbox-sync', {
        body: { mailbox_id: mailboxId },
      });
      if (error) throw error;
      const result = (data ?? {}) as { message?: string };
      toast.success(result.message ?? 'Sync triggered');
      await loadData();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setTriggerLoading(null);
    }
  };

  useEffect(() => { if (organization) loadData(); }, [organization]); // eslint-disable-line

  const openAddMailbox = () => { setEditingMb(null); setMbForm(DEFAULT_MB); setMbDialogOpen(true); };
  const openEditMailbox = (mb: Mailbox) => {
    setEditingMb(mb);
    setMbForm({
      email_address: mb.email_address,
      display_name: mb.display_name ?? '',
      imap_host: mb.imap_host,
      imap_port: mb.imap_port,
      smtp_host: mb.smtp_host,
      smtp_port: mb.smtp_port,
      password: '',
      staff_user_id: mb.staff_user_id ?? 'none',
    });
    setMbDialogOpen(true);
  };

  const submitMailbox = async () => {
    if (!mbForm.email_address || !mbForm.imap_host || !mbForm.smtp_host) {
      toast.error('Please fill required fields'); return;
    }
    if (!editingMb && !mbForm.password) { toast.error('Password is required for new mailboxes'); return; }
    setSubmitting(true);
    try {
      // Store credentials via Edge Function
      if (mbForm.password) {
        const { error: vaultErr } = await supabase.functions.invoke('store-mailbox-credentials', {
          body: {
            email: mbForm.email_address,
            password: mbForm.password,
            mailbox_id: editingMb?.id ?? null,
          },
        });
        if (vaultErr) {
          const msg = await vaultErr?.context?.text?.();
          throw new Error(msg || vaultErr.message);
        }
      } else if (editingMb) {
        // Update mailbox details only (no password change)
        const { error } = await supabase.from('mailboxes').update({
          email_address: mbForm.email_address,
          display_name: mbForm.display_name || null,
          imap_host: mbForm.imap_host,
          imap_port: mbForm.imap_port,
          smtp_host: mbForm.smtp_host,
          smtp_port: mbForm.smtp_port,
          staff_user_id: mbForm.staff_user_id === 'none' ? null : mbForm.staff_user_id,
        }).eq('id', editingMb.id);
        if (error) throw error;
      }
      toast.success(editingMb ? 'Mailbox updated' : 'Mailbox added — pending sync');
      setMbDialogOpen(false);
      loadData();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Failed to save mailbox');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDeleteMailbox = async () => {
    if (!deleteMbId) return;
    // NOTE: Deleting a mailbox removes access but preserves synced mail in DB
    // per Prompt 02 constraint — sync service must not re-sync deleted mailboxes
    const { error } = await supabase.from('mailboxes').delete().eq('id', deleteMbId);
    if (error) { toast.error(error.message); return; }
    toast.success('Mailbox removed');
    setDeleteMbId(null);
    loadData();
  };

  const confirmResetMfa = async () => {
    if (!resetMfaUserId) return;
    setResettingMfa(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase.functions.invoke('reset-staff-mfa', {
        body: { staff_user_id: resetMfaUserId },
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      });
      if (error) {
        const msg = await error?.context?.text?.().catch(() => error.message);
        throw new Error(msg ?? error.message);
      }
      toast.success('MFA reset — user will be prompted to re-enroll on next login');
      setResetMfaUserId(null);
      loadData();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Failed to reset MFA');
    } finally {
      setResettingMfa(false);
    }
  };

  const submitInviteStaff = async () => {
    if (!staffForm.email || !staffForm.full_name) { toast.error('Fill all fields'); return; }
    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke('invite-staff-user', {
        body: {
          email: staffForm.email,
          full_name: staffForm.full_name,
          role: staffForm.role,
          organization_id: organization?.id,
        },
      });
      if (error) {
        const msg = await error?.context?.text?.();
        throw new Error(msg || error.message);
      }
      toast.success(`Invite sent to ${staffForm.email}`);
      setInviteDialogOpen(false);
      setStaffForm({ email: '', full_name: '', role: 'staff' });
      loadData();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Failed to send invite');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/inbox')}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Inbox
          </Button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Mail className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-semibold">Admin Panel</h1>
              <p className="text-xs text-muted-foreground">{organization?.name}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        <Tabs defaultValue="mailboxes">
          <TabsList className="mb-6">
            <TabsTrigger value="mailboxes">Mailboxes</TabsTrigger>
            <TabsTrigger value="staff">Staff Users</TabsTrigger>
          </TabsList>

          {/* MAILBOXES TAB */}
          <TabsContent value="mailboxes">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-4">
                <CardTitle className="text-lg">Mailboxes ({mailboxes.length})</CardTitle>
                <Button size="sm" onClick={openAddMailbox}>
                  <Plus className="w-4 h-4 mr-2" /> Add Mailbox
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Email Address</TableHead>
                        <TableHead className="whitespace-nowrap">Display Name</TableHead>
                        <TableHead className="whitespace-nowrap">Sync Status</TableHead>
                        <TableHead className="whitespace-nowrap">Last Synced</TableHead>
                        <TableHead className="whitespace-nowrap">Linked User</TableHead>
                        <TableHead className="whitespace-nowrap">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                      ) : mailboxes.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No mailboxes yet. Add one above.</TableCell></TableRow>
                      ) : mailboxes.map(mb => (
                        <TableRow key={mb.id}>
                          <TableCell className="font-medium whitespace-nowrap">{mb.email_address}</TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">{mb.display_name ?? '—'}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${SYNC_BADGE[mb.sync_status]}`}>
                              {mb.sync_status}
                            </span>
                            {mb.sync_status === 'error' && mb.last_error && (
                              <p className="text-xs text-destructive mt-0.5 max-w-[200px] truncate" title={mb.last_error}>{mb.last_error}</p>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground text-sm">
                            {mb.last_synced_at ? formatDistanceToNow(new Date(mb.last_synced_at), { addSuffix: true }) : 'Never'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {(mb as Mailbox & { staff_users?: { full_name?: string } }).staff_users?.full_name
                              ? <Badge variant="secondary">{(mb as Mailbox & { staff_users?: { full_name?: string } }).staff_users?.full_name}</Badge>
                              : <span className="text-xs text-muted-foreground">Unassigned</span>}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => runDiagnosis(mb.id)}
                                disabled={diagLoading && diagId === mb.id}
                                className="h-8 w-8"
                                title="Diagnose connection"
                              >
                                <Activity className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => triggerSync(mb.id)}
                                disabled={triggerLoading === mb.id || mb.sync_status === 'syncing'}
                                className="h-8 w-8"
                                title="Force sync"
                              >
                                <Zap className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => { setResetPwMb(mb); setNewPassword(''); }}
                                className="h-8 w-8"
                                title="Reset mailbox password"
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => openEditMailbox(mb)} className="h-8 w-8">
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => setDeleteMbId(mb.id)} className="h-8 w-8 text-destructive hover:text-destructive">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* DIAGNOSTICS CARD */}
          {diagResult && (
            <Card className="mt-6 border-amber-200 dark:border-amber-900 bg-amber-50/30 dark:bg-amber-950/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  Mailbox Diagnostics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><span className="font-medium">Email:</span> {String(diagResult.email_address ?? '')}</p>
                <p><span className="font-medium">IMAP:</span> {diagResult.imap_ok ? <span className="text-green-600 dark:text-green-400 font-medium">OK ({String(diagResult.imap_folders ?? 0)} folders)</span> : <span className="text-destructive font-medium">{String(diagResult.imap_error ?? 'Failed')}</span>}</p>
                <p><span className="font-medium">SMTP:</span> {diagResult.smtp_ok ? <span className="text-green-600 dark:text-green-400 font-medium">OK</span> : <span className="text-destructive font-medium">{String(diagResult.smtp_error ?? 'Failed')}</span>}</p>
                {!diagResult.imap_ok && (
                  <p className="text-xs text-muted-foreground">If IMAP fails, the persistent sync service cannot backfill messages. Check the mailbox password in Vault and that the IMAP host/port are reachable.</p>
                )}
                {!diagResult.smtp_ok && (
                  <p className="text-xs text-muted-foreground">If SMTP fails, the send-email Edge Function will fail. Check TLS/STARTTLS settings and password.</p>
                )}
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => setDiagResult(null)}>Close</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* STAFF TAB */}
          <TabsContent value="staff">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-4">
                <CardTitle className="text-lg">Staff Users ({staffUsers.length})</CardTitle>
                <Button size="sm" onClick={() => setInviteDialogOpen(true)}>
                  <UserPlus className="w-4 h-4 mr-2" /> Invite Staff
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Name</TableHead>
                        <TableHead className="whitespace-nowrap">Role</TableHead>
                        <TableHead className="whitespace-nowrap">2FA Status</TableHead>
                        <TableHead className="whitespace-nowrap">Joined</TableHead>
                        <TableHead className="whitespace-nowrap">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staffUsers.map(su => (
                        <TableRow key={su.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {su.full_name ?? '—'}
                            {su.id === staffUser?.id && <Badge variant="outline" className="ml-2 text-xs">You</Badge>}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <Badge variant={su.role === 'admin' ? 'default' : 'secondary'}>{su.role}</Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {(su as StaffUser & { mfa_enrolled?: boolean }).mfa_enrolled ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                <ShieldCheck className="w-3 h-3" /> Enrolled
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                                <ShieldOff className="w-3 h-3" /> Not enrolled
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground text-sm">
                            {formatDistanceToNow(new Date(su.created_at), { addSuffix: true })}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {(su as StaffUser & { mfa_enrolled?: boolean }).mfa_enrolled && su.id !== staffUser?.id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-destructive"
                                onClick={() => setResetMfaUserId(su.id)}
                                title="Reset 2FA — forces re-enrollment on next login"
                              >
                                <RotateCcw className="w-3 h-3" /> Reset 2FA
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add/Edit Mailbox Dialog */}
      <Dialog open={mbDialogOpen} onOpenChange={setMbDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingMb ? 'Edit Mailbox' : 'Add Mailbox'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Email Address *</Label>
                <Input placeholder="user@frimpsoil.com.gh" value={mbForm.email_address} onChange={e => setMbForm(p => ({ ...p, email_address: e.target.value }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Display Name</Label>
                <Input placeholder="John Doe" value={mbForm.display_name} onChange={e => setMbForm(p => ({ ...p, display_name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>IMAP Host *</Label>
                <Input value={mbForm.imap_host} onChange={e => setMbForm(p => ({ ...p, imap_host: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>IMAP Port</Label>
                <Input type="number" value={mbForm.imap_port} onChange={e => setMbForm(p => ({ ...p, imap_port: parseInt(e.target.value) || 993 }))} />
              </div>
              <div className="space-y-1.5">
                <Label>SMTP Host *</Label>
                <Input value={mbForm.smtp_host} onChange={e => setMbForm(p => ({ ...p, smtp_host: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>SMTP Port</Label>
                <Input type="number" value={mbForm.smtp_port} onChange={e => setMbForm(p => ({ ...p, smtp_port: parseInt(e.target.value) || 587 }))} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>{editingMb ? 'New Password (leave blank to keep current)' : 'Mailbox Password *'}</Label>
                <Input type="password" placeholder="••••••••" value={mbForm.password} onChange={e => setMbForm(p => ({ ...p, password: e.target.value }))} />
                <p className="text-xs text-muted-foreground">Stored securely in Vault — never saved in plain text</p>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Assign to Staff User</Label>
                <Select value={mbForm.staff_user_id} onValueChange={v => setMbForm(p => ({ ...p, staff_user_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select user…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {staffUsers.map(su => (
                      <SelectItem key={su.id} value={su.id}>{su.full_name ?? su.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {!editingMb && (
              <p className="text-xs bg-muted rounded p-2 text-muted-foreground">
                Sync status will be set to <strong>Pending</strong>. The sync service will connect and begin backfilling this mailbox automatically.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMbDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitMailbox} disabled={submitting}>
              {submitting ? 'Saving…' : (editingMb ? 'Save Changes' : 'Add Mailbox')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Mailbox Password */}
      <Dialog open={!!resetPwMb} onOpenChange={o => !o && setResetPwMb(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset Mailbox Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Updating password for <span className="font-medium text-foreground">{resetPwMb?.email_address}</span>. The new password is stored securely in Vault and will be used by the sync service on the next run.
            </p>
            <div className="space-y-1.5">
              <Label>New Password</Label>
              <Input type="password" placeholder="••••••••" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPwMb(null)}>Cancel</Button>
            <Button onClick={resetMailboxPassword} disabled={resettingPw || !newPassword}>
              {resettingPw ? 'Updating…' : 'Update Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteMbId} onOpenChange={o => !o && setDeleteMbId(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Mailbox</AlertDialogTitle>
            <AlertDialogDescription>
              This removes access to the mailbox but preserves all synced mail data. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteMailbox} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset MFA Confirmation */}
      <AlertDialog open={!!resetMfaUserId} onOpenChange={o => !o && setResetMfaUserId(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Reset 2FA for this user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove their enrolled authenticator factor. On next login they will be forced to re-enroll 2FA before accessing the inbox. Use this when a staff member has lost access to their authenticator app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resettingMfa}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmResetMfa}
              disabled={resettingMfa}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {resettingMfa ? 'Resetting…' : 'Reset 2FA'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invite Staff Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <DialogHeader><DialogTitle>Invite Staff Member</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input placeholder="Jane Smith" value={staffForm.full_name} onChange={e => setStaffForm(p => ({ ...p, full_name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Email Address</Label>
              <Input type="email" placeholder="jane@frimpsoil.com.gh" value={staffForm.email} onChange={e => setStaffForm(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={staffForm.role} onValueChange={v => setStaffForm(p => ({ ...p, role: v as 'admin' | 'staff' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">An invite email will be sent with a link to set their password.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitInviteStaff} disabled={submitting}>
              {submitting ? 'Sending…' : 'Send Invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
