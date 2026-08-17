// @refresh reset
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, Copy, Eye, EyeOff, Zap, Key,
  CheckCircle2, XCircle, RefreshCw, Shield
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchWebhooks, createWebhook, updateWebhook, deleteWebhook, fetchWebhookLogs,
  fetchApiKeys, createApiKey, revokeApiKey, deleteApiKey
} from '@/services/api';
import type { WebhookEndpoint, WebhookDeliveryLog, ApiKey } from '@/types/types';
import { format, formatDistanceToNow } from 'date-fns';

const WEBHOOK_EVENTS = [
  { value: 'message.received', label: 'Message received' },
  { value: 'thread.updated', label: 'Thread updated' },
  { value: 'thread.archived', label: 'Thread archived' },
  { value: 'message.sent', label: 'Message sent' },
  { value: 'spam.detected', label: 'Spam detected' },
  { value: 'mailbox.error', label: 'Mailbox sync error' },
];

const API_SCOPES = [
  { value: 'read', label: 'Read threads & messages' },
  { value: 'send', label: 'Send emails' },
  { value: 'contacts', label: 'Read/write contacts' },
  { value: 'admin', label: 'Admin operations' },
];

// ---- Webhooks Tab ----
function WebhooksTab() {
  const { organization } = useAuth();
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [logsWebhookId, setLogsWebhookId] = useState<string | null>(null);
  const [logs, setLogs] = useState<WebhookDeliveryLog[]>([]);
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>(['message.received']);
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});

  const load = async () => {
    if (!organization) return;
    setWebhooks(await fetchWebhooks(organization.id));
  };
  useEffect(() => { load(); }, [organization]); // eslint-disable-line

  const handleCreate = async () => {
    if (!url.trim() || !organization) { toast.error('URL is required'); return; }
    try {
      await createWebhook({ organization_id: organization.id, url, events: selectedEvents, is_active: true, created_by: null });
      toast.success('Webhook created');
      setDialogOpen(false); setUrl(''); setSelectedEvents(['message.received']); load();
    } catch { toast.error('Failed to create webhook'); }
  };

  const toggleActive = async (wh: WebhookEndpoint) => {
    await updateWebhook(wh.id, { is_active: !wh.is_active });
    toast.success(wh.is_active ? 'Webhook disabled' : 'Webhook enabled');
    load();
  };

  const copySecret = (token: string) => {
    navigator.clipboard.writeText(token);
    toast.success('Secret token copied');
  };

  const loadLogs = async (id: string) => {
    setLogsWebhookId(id);
    const data = await fetchWebhookLogs(id);
    setLogs(data as WebhookDeliveryLog[]);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Receive real-time HTTP POST notifications for mail events.</p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-2" /> Add Endpoint</Button>
      </div>

      {webhooks.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">
          No webhook endpoints yet. Add one to receive mail event notifications.
        </CardContent></Card>
      ) : webhooks.map(wh => (
        <Card key={wh.id}>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-start gap-3">
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded truncate max-w-xs">{wh.url}</code>
                  <Badge variant={wh.is_active ? 'default' : 'secondary'}>{wh.is_active ? 'Active' : 'Paused'}</Badge>
                </div>
                <div className="flex flex-wrap gap-1">
                  {wh.events.map(e => <Badge key={e} variant="outline" className="text-xs">{e}</Badge>)}
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">
                    Secret: {showSecret[wh.id] ? wh.secret_token : '••••••••••••••••'}
                  </p>
                  <button onClick={() => setShowSecret(p => ({ ...p, [wh.id]: !p[wh.id] }))} className="text-muted-foreground hover:text-foreground">
                    {showSecret[wh.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => copySecret(wh.secret_token)} className="text-muted-foreground hover:text-foreground">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                {wh.last_triggered_at && (
                  <p className="text-xs text-muted-foreground">
                    Last triggered {formatDistanceToNow(new Date(wh.last_triggered_at), { addSuffix: true })}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => loadLogs(wh.id)}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1" /> Logs
                </Button>
                <Switch checked={wh.is_active} onCheckedChange={() => toggleActive(wh)} />
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(wh.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Delivery Logs */}
      {logsWebhookId && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Delivery Logs</CardTitle>
              <button onClick={() => setLogsWebhookId(null)} className="text-muted-foreground hover:text-foreground text-xs">Close</button>
            </div>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No deliveries yet.</p>
            ) : (
              <div className="space-y-2">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-center gap-3 text-xs py-1.5 border-b border-border last:border-0">
                    {log.success ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-destructive shrink-0" />
                    )}
                    <Badge variant="outline" className="text-xs">{log.event}</Badge>
                    <span className="text-muted-foreground">HTTP {log.response_status ?? '—'}</span>
                    <span className="text-muted-foreground ml-auto">
                      {log.delivered_at ? format(new Date(log.delivered_at), 'dd MMM HH:mm') : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader><DialogTitle>Add Webhook Endpoint</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Endpoint URL</Label>
              <Input placeholder="https://your-server.com/webhook" value={url} onChange={e => setUrl(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Events to send</Label>
              <div className="grid grid-cols-2 gap-2">
                {WEBHOOK_EVENTS.map(ev => (
                  <div key={ev.value} className="flex items-center gap-2">
                    <Checkbox
                      id={ev.value}
                      checked={selectedEvents.includes(ev.value)}
                      onCheckedChange={checked => setSelectedEvents(prev =>
                        checked ? [...prev, ev.value] : prev.filter(e => e !== ev.value)
                      )}
                    />
                    <label htmlFor={ev.value} className="text-sm cursor-pointer">{ev.label}</label>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">A secret token will be generated. Use it to verify request authenticity via HMAC-SHA256.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create Endpoint</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <AlertDialogHeader><AlertDialogTitle>Delete Webhook</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { if (deleteId) { await deleteWebhook(deleteId); toast.success('Deleted'); setDeleteId(null); load(); } }} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---- API Keys Tab ----
function ApiKeysTab() {
  const { organization, staffUser } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newKeyDialog, setNewKeyDialog] = useState<{ key: string } | null>(null);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['read']);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    if (!organization) return;
    setKeys(await fetchApiKeys(organization.id));
  };
  useEffect(() => { load(); }, [organization]); // eslint-disable-line

  const handleCreate = async () => {
    if (!name.trim() || !organization || !staffUser) { toast.error('Name is required'); return; }
    try {
      const { key } = await createApiKey(organization.id, staffUser.id, name, scopes);
      toast.success('API key created');
      setDialogOpen(false); setName(''); setScopes(['read']);
      setNewKeyDialog({ key });
      load();
    } catch { toast.error('Failed to create API key'); }
  };

  const handleRevoke = async (id: string) => {
    await revokeApiKey(id); toast.success('Key revoked'); load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">API keys allow external systems to access mail data programmatically.</p>
        <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-2" /> New API Key</Button>
      </div>

      {keys.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">No API keys yet.</CardContent></Card>
      ) : keys.map(k => (
        <Card key={k.id}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{k.name}</p>
                  <Badge variant={k.is_active ? 'default' : 'secondary'}>{k.is_active ? 'Active' : 'Revoked'}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{k.key_prefix}••••••••</code>
                  <div className="flex gap-1 flex-wrap">
                    {k.scopes.map(s => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Created {format(new Date(k.created_at), 'dd MMM yyyy')}
                  {k.last_used_at && ` · Last used ${formatDistanceToNow(new Date(k.last_used_at), { addSuffix: true })}`}
                  {k.expires_at && ` · Expires ${format(new Date(k.expires_at), 'dd MMM yyyy')}`}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                {k.is_active && (
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleRevoke(k.id)}>
                    Revoke
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(k.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader><DialogTitle>Create API Key</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Key Name</Label>
              <Input placeholder="e.g. Zapier Integration" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Permissions (Scopes)</Label>
              <div className="space-y-2">
                {API_SCOPES.map(s => (
                  <div key={s.value} className="flex items-center gap-2">
                    <Checkbox
                      id={s.value}
                      checked={scopes.includes(s.value)}
                      onCheckedChange={checked => setScopes(prev =>
                        checked ? [...prev, s.value] : prev.filter(x => x !== s.value)
                      )}
                    />
                    <label htmlFor={s.value} className="text-sm cursor-pointer">{s.label}</label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Generate Key</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show new key once */}
      <Dialog open={!!newKeyDialog} onOpenChange={() => setNewKeyDialog(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Key className="w-5 h-5 text-primary" /> Your New API Key</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
              <code className="text-sm font-mono flex-1 break-all">{newKeyDialog?.key}</code>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { navigator.clipboard.writeText(newKeyDialog?.key ?? ''); toast.success('Copied!'); }}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-start gap-2 p-3 bg-destructive/5 border border-destructive/30 rounded-md">
              <Shield className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">Copy this key now — it will never be shown again. Store it securely.</p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewKeyDialog(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <AlertDialogHeader><AlertDialogTitle>Delete API Key</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { if (deleteId) { await deleteApiKey(deleteId); toast.success('Deleted'); setDeleteId(null); load(); } }} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function WebhooksPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link to="/admin/dashboard">
            <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="w-4 h-4" /></Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold" style={{ fontFamily: 'Playfair Display, serif' }}>Webhooks & API Keys</h1>
            <p className="text-sm text-muted-foreground">Integrate Frimps Mail with external systems</p>
          </div>
        </div>
      </div>
      <div className="max-w-4xl mx-auto px-6 py-6">
        <Tabs defaultValue="webhooks">
          <TabsList className="mb-6">
            <TabsTrigger value="webhooks"><Zap className="w-4 h-4 mr-2" /> Webhooks</TabsTrigger>
            <TabsTrigger value="apikeys"><Key className="w-4 h-4 mr-2" /> API Keys</TabsTrigger>
          </TabsList>
          <TabsContent value="webhooks"><WebhooksTab /></TabsContent>
          <TabsContent value="apikeys"><ApiKeysTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
