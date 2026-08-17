import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { fetchResources, createResource, updateResource, deleteResource } from '@/services/api';
import type { Resource } from '@/types/types';

const RESOURCE_TYPES = ['room', 'vehicle', 'equipment', 'other'] as const;

const TYPE_BADGE: Record<string, string> = {
  room: 'bg-blue-100 text-blue-700',
  vehicle: 'bg-amber-100 text-amber-700',
  equipment: 'bg-teal-100 text-teal-700',
  other: 'bg-muted text-muted-foreground',
};

interface ResourceForm {
  name: string;
  type: Resource['type'];
  description: string;
  is_active: boolean;
}

const EMPTY_FORM: ResourceForm = { name: '', type: 'room', description: '', is_active: true };

export default function AdminResourcesPage() {
  const { organization } = useAuth();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<ResourceForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!organization) return;
    setLoading(true);
    try {
      setResources(await fetchResources(organization.id));
    } catch {
      toast.error('Failed to load resources');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [organization]); // eslint-disable-line

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (r: Resource) => {
    setEditing(r);
    setForm({ name: r.name, type: r.type, description: r.description ?? '', is_active: r.is_active });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateResource(editing.id, {
          name: form.name.trim(),
          type: form.type,
          description: form.description || null,
          is_active: form.is_active,
        });
        toast.success('Resource updated');
      } else {
        await createResource({
          organization_id: organization!.id,
          name: form.name.trim(),
          type: form.type,
          description: form.description || null,
          is_active: form.is_active,
        });
        toast.success('Resource created');
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
    try {
      await deleteResource(deleteId);
      toast.success('Resource deleted');
    } catch {
      toast.error('Failed to delete — resource may have existing bookings');
    }
    setDeleteId(null);
    load();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4 flex items-center gap-4 shrink-0">
        <Link to="/admin/mailboxes">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-2" /> Admin</Button>
        </Link>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Layers className="w-5 h-5 text-primary shrink-0" />
          <h1 className="text-lg font-semibold truncate">Resources</h1>
        </div>
        <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-2" /> Add Resource</Button>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 max-w-3xl mx-auto w-full">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : resources.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Layers className="w-14 h-14 mx-auto mb-4 opacity-30" />
            <p className="text-base font-medium">No resources yet</p>
            <p className="text-sm mt-1 mb-4">Add rooms, vehicles, or equipment that staff can book for meetings.</p>
            <Button onClick={openAdd}><Plus className="w-4 h-4 mr-2" /> Add First Resource</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {resources.map(r => (
              <div key={r.id} className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium truncate">{r.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${TYPE_BADGE[r.type]}`}>{r.type}</span>
                    {!r.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                  </div>
                  {r.description && <p className="text-sm text-muted-foreground truncate">{r.description}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteId(r.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Resource' : 'Add Resource'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Conference Room A, Toyota Hilux, Projector 1…" />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v as Resource['type'] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RESOURCE_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Capacity, location, notes…" />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))} id="is-active" />
              <Label htmlFor="is-active">Active (bookable by staff)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : (editing ? 'Save' : 'Create')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Resource</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the resource. Existing bookings linked to this resource will also be removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
