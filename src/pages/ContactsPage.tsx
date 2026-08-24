import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, Search, UserPlus, Users, UserCheck, X, ChevronDown, ChevronRight, Eye, Mail, Phone, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useMail } from '@/contexts/MailContext';
import {
  fetchContacts, createContact, updateContact, deleteContact,
  fetchContactGroups, createContactGroup, updateContactGroup, deleteContactGroup,
  fetchGroupMembers, addGroupMember, removeGroupMember,
} from '@/services/api';
import type { Contact, ContactGroup } from '@/types/types';

interface ContactForm {
  name: string; email: string; company: string; phone: string; notes: string;
}
const EMPTY_CONTACT: ContactForm = { name: '', email: '', company: '', phone: '', notes: '' };

interface GroupForm { name: string; description: string; }
const EMPTY_GROUP: GroupForm = { name: '', description: '' };

type ContactGroupWithCount = ContactGroup & { contact_group_members?: { count?: number }[] | number | null };

function getGroupMemberCount(group: ContactGroupWithCount) {
  const countRelation = group.contact_group_members;
  if (typeof countRelation === 'number') return countRelation;
  return countRelation?.[0]?.count ?? group.member_count ?? 0;
}

// ─── Contacts Tab ────────────────────────────────────────────────────────────
function ContactsTab() {
  const { organization, staffUser } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [viewing, setViewing] = useState<Contact | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<ContactForm>(EMPTY_CONTACT);
  const [saving, setSaving] = useState(false);
  const [companyFilter, setCompanyFilter] = useState('all');

  const load = useCallback(async () => {
    if (!organization) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await fetchContacts(organization.id);
      setContacts(data);
    } catch (error) {
      console.error('Failed to load contacts', error);
      toast.error('Failed to load contacts');
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [organization]);

  useEffect(() => { load(); }, [load]);

  const companies = Array.from(new Set(contacts.map(c => c.company?.trim()).filter(Boolean) as string[])).sort();

  const filtered = contacts.filter(c => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      (c.company ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (c.phone ?? '').toLowerCase().includes(search.toLowerCase());
    const matchesCompany = companyFilter === 'all' || c.company === companyFilter;
    return matchesSearch && matchesCompany;
  });

  const openAdd = () => { setEditing(null); setForm(EMPTY_CONTACT); setDialogOpen(true); };
  const openEdit = (c: Contact) => {
    setEditing(c);
    setForm({ name: c.name, email: c.email, company: c.company ?? '', phone: c.phone ?? '', notes: c.notes ?? '' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.email) { toast.error('Name and email are required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateContact(editing.id, form);
        toast.success('Contact updated');
      } else {
        await createContact({ ...form, organization_id: organization!.id, created_by: staffUser!.id });
        toast.success('Contact added');
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
    await deleteContact(deleteId);
    toast.success('Contact deleted');
    setDeleteId(null);
    load();
  };

  const getInitials = (name: string) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search contacts…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <div className="flex gap-2">
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All companies</SelectItem>
              {companies.map(company => <SelectItem key={company} value={company}>{company}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-2" /> Add Contact</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{filtered.length} contact{filtered.length !== 1 ? 's' : ''}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Name</TableHead>
                  <TableHead className="whitespace-nowrap">Email</TableHead>
                  <TableHead className="whitespace-nowrap hidden md:table-cell">Company</TableHead>
                  <TableHead className="whitespace-nowrap hidden md:table-cell">Phone</TableHead>
                  <TableHead className="whitespace-nowrap">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">
                    <div className="flex flex-col items-center gap-2">
                      <UserPlus className="w-8 h-8 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">{search ? 'No matches' : 'No contacts yet'}</p>
                    </div>
                  </TableCell></TableRow>
                ) : filtered.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                          {getInitials(c.name)}
                        </div>
                        <span className="font-medium">{c.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{c.email}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground hidden md:table-cell">{c.company ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground hidden md:table-cell">{c.phone ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewing(c)}><Eye className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Contact' : 'New Contact'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {(['name', 'email', 'company', 'phone'] as const).map(field => (
              <div key={field} className="space-y-1.5">
                <Label className="capitalize">{field}{(field === 'name' || field === 'email') && ' *'}</Label>
                <Input value={form[field]} onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))} placeholder={field === 'email' ? 'user@company.com' : ''} />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : (editing ? 'Save' : 'Add Contact')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {viewing && (
        <Dialog open onOpenChange={open => !open && setViewing(null)}>
          <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
            <DialogHeader><DialogTitle>{viewing.name}</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                <a href={`mailto:${viewing.email}`} className="truncate text-primary hover:underline">{viewing.email}</a>
              </div>
              {viewing.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                  <a href={`tel:${viewing.phone}`} className="text-primary hover:underline">{viewing.phone}</a>
                </div>
              )}
              {viewing.company && (
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span>{viewing.company}</span>
                </div>
              )}
              {viewing.notes && (
                <div className="rounded-md border border-border bg-muted/30 p-3 text-muted-foreground whitespace-pre-wrap">{viewing.notes}</div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setViewing(null); openEdit(viewing); }}>Edit</Button>
              <Button onClick={() => setViewing(null)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the contact.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Group Member Manager Dialog ─────────────────────────────────────────────
function GroupMembersDialog({
  group, orgId, onClose,
}: { group: ContactGroup; orgId: string; onClose: () => void }) {
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [members, setMembers] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [all, grpMembers] = await Promise.all([
        fetchContacts(orgId),
        fetchGroupMembers(group.id),
      ]);
      setAllContacts(all);
      setMembers(grpMembers);
    } catch (error) {
      console.error('Failed to load group members', error);
      toast.error('Failed to load group members');
      setAllContacts([]);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, group.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const memberIds = new Set((members ?? []).filter(Boolean).map(m => m.id));

  const filtered = (allContacts ?? []).filter((c): c is Contact => Boolean(c)).filter(c =>
    (c.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (c.email ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const toggle = async (contact: Contact) => {
    if (memberIds.has(contact.id)) {
      await removeGroupMember(group.id, contact.id);
      setMembers(prev => prev.filter(m => m.id !== contact.id));
    } else {
      await addGroupMember(group.id, contact.id);
      setMembers(prev => [...prev, contact]);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Manage Members — {group.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Current member chips */}
          <div>
            <p className="text-xs text-muted-foreground mb-1.5 font-medium">
              {members.length} member{members.length !== 1 ? 's' : ''}
            </p>
            {members.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2 bg-muted/40 rounded-md min-h-[36px]">
                {members.filter(Boolean).map(m => (
                  <Badge key={m.id} variant="secondary" className="flex items-center gap-1 py-0.5 text-xs">
                    {m.name || m.email}
                    <button onClick={() => toggle(m)} className="ml-0.5 hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Search + toggle list */}
          <div>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search contacts to add…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>
            ) : (
              <div className="border border-border rounded-md max-h-56 overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No contacts found</p>
                ) : filtered.map(c => {
                  const isMember = memberIds.has(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggle(c)}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted transition-colors text-left border-b border-border last:border-0"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center text-[10px] font-semibold text-primary shrink-0">
                          {c.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{c.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                        </div>
                      </div>
                      {isMember
                        ? <Badge variant="default" className="shrink-0 text-xs bg-primary/15 text-primary hover:bg-primary/20">Added</Badge>
                        : <Badge variant="outline" className="shrink-0 text-xs">Add</Badge>
                      }
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Groups Tab ───────────────────────────────────────────────────────────────
function GroupsTab() {
  const { organization, staffUser } = useAuth();
  const { activeMailbox } = useMail();

  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ContactGroup | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<GroupForm>(EMPTY_GROUP);
  const [saving, setSaving] = useState(false);
  const [membersGroup, setMembersGroup] = useState<ContactGroup | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [groupMembers, setGroupMembers] = useState<Record<string, Contact[]>>({});

  const load = useCallback(async () => {
    if (!organization) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = await fetchContactGroups(organization.id, activeMailbox?.id);
      setGroups(data);
    } catch (error) {
      console.error('Failed to load contact groups', error);
      toast.error('Failed to load contact groups');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [organization, activeMailbox?.id]);

  useEffect(() => { load(); }, [load]);

  const filtered = (groups ?? []).filter((g): g is ContactGroup => Boolean(g)).filter(g =>
    (g.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (g.description ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => { setEditing(null); setForm(EMPTY_GROUP); setDialogOpen(true); };
  const openEdit = (g: ContactGroup) => {
    setEditing(g);
    setForm({ name: g.name, description: g.description ?? '' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Group name is required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateContactGroup(editing.id, { name: form.name, description: form.description || null });
        toast.success('Group updated');
      } else {
        await createContactGroup({
          organization_id: organization!.id,
          mailbox_id: activeMailbox?.id ?? null,
          name: form.name.trim(),
          description: form.description.trim() || null,
          created_by: staffUser!.id,
        });
        toast.success('Group created');
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
    await deleteContactGroup(deleteId);
    toast.success('Group deleted');
    setDeleteId(null);
    load();
  };

  const toggleExpand = async (g: ContactGroup) => {
    const next = new Set(expandedIds);
    if (next.has(g.id)) {
      next.delete(g.id);
    } else {
      next.add(g.id);
      if (!groupMembers[g.id]) {
        try {
          const members = await fetchGroupMembers(g.id);
          setGroupMembers(prev => ({ ...prev, [g.id]: members }));
        } catch (error) {
          console.error('Failed to load group members', error);
          toast.error('Failed to load group members');
          setGroupMembers(prev => ({ ...prev, [g.id]: [] }));
        }
      }
    }
    setExpandedIds(next);
  };

  const isOwned = (g: ContactGroup) => g.mailbox_id === activeMailbox?.id;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search groups…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-2" /> New Group</Button>
      </div>

      {activeMailbox && (
        <p className="text-xs text-muted-foreground mb-3">
          Groups are saved to <span className="font-medium text-foreground">{activeMailbox.email_address}</span>. Org-wide groups are also shown.
        </p>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{filtered.length} group{filtered.length !== 1 ? 's' : ''}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-center py-8 text-muted-foreground text-sm">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10">
              <Users className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{search ? 'No matches' : 'No groups yet — create your first group'}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map(g => {
                const isExpanded = expandedIds.has(g.id);
                const memberCount = getGroupMemberCount(g as ContactGroupWithCount);
                const owned = isOwned(g);

                return (
                  <div key={g.id}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <button
                        onClick={() => toggleExpand(g)}
                        className="text-muted-foreground hover:text-foreground shrink-0"
                      >
                        {isExpanded
                          ? <ChevronDown className="w-4 h-4" />
                          : <ChevronRight className="w-4 h-4" />}
                      </button>

                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Users className="w-4 h-4 text-primary" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{g.name}</span>
                          {!owned && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">Org-wide</Badge>
                          )}
                        </div>
                        {g.description && (
                          <p className="text-xs text-muted-foreground truncate">{g.description}</p>
                        )}
                      </div>

                      <Badge variant="secondary" className="shrink-0 text-xs">
                        {memberCount} member{memberCount !== 1 ? 's' : ''}
                      </Badge>

                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          title="Manage members"
                          onClick={() => setMembersGroup(g)}
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                        </Button>
                        {owned && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(g)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeleteId(g.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Expanded member list */}
                    {isExpanded && (
                      <div className="px-4 pb-3 pl-14 space-y-1">
                        {groupMembers[g.id] === undefined ? (
                          <p className="text-xs text-muted-foreground">Loading members…</p>
                        ) : !(groupMembers[g.id]?.length) ? (
                          <p className="text-xs text-muted-foreground">No members yet. Click <UserCheck className="w-3 h-3 inline" /> to add members.</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {(groupMembers[g.id] ?? []).filter(Boolean).map(m => (
                              <Badge key={m.id} variant="secondary" className="text-xs">
                                {m.name ? `${m.name} <${m.email}>` : m.email}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Group Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Group' : 'New Email Group'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Group Name *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. HSE Team, Management"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                rows={2}
                placeholder="Optional description…"
              />
            </div>
            {!editing && (
              <p className="text-xs text-muted-foreground">
                This group will be saved to <span className="font-medium">{activeMailbox?.email_address ?? 'your mailbox'}</span>. You can add members after creating it.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : (editing ? 'Save Changes' : 'Create Group')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Group</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the group and all its members.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Member Manager */}
      {membersGroup && organization && (
        <GroupMembersDialog
          group={membersGroup}
          orgId={organization.id}
          onClose={() => { setMembersGroup(null); load(); }}
        />
      )}
    </>
  );
}

// ─── Page Root ────────────────────────────────────────────────────────────────
export default function ContactsPage() {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'groups' ? 'groups' : 'contacts';

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card px-6 py-4 flex items-center gap-4">
        <Link to="/inbox"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button></Link>
        <h1 className="text-lg font-semibold">Contacts &amp; Groups</h1>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        <Tabs key={tab} defaultValue={tab}>
          <TabsList className="mb-6">
            <TabsTrigger value="contacts" className="flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5" /> Contacts
            </TabsTrigger>
            <TabsTrigger value="groups" className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Groups
            </TabsTrigger>
          </TabsList>

          <TabsContent value="contacts"><ContactsTab /></TabsContent>
          <TabsContent value="groups"><GroupsTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
