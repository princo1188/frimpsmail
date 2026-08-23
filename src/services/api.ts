import { supabase } from '@/db/supabase';
import { Thread, Message, Attachment, Contact, Signature, Rule, CalendarEvent, SearchFilters,
  EmailTemplate, ContactGroup, SavedSearch, FollowUpReminder,
  WebhookEndpoint, ApiKey, MailboxDelegate, CalendarEventAttachment, Resource, ResourceBooking
} from '@/types/types';

// ============================================================
// THREADS
// ============================================================
export async function fetchThreads(mailboxId: string, folder: string, folderId?: string, limit = 50, cursor?: string) {
  let q = supabase
    .from('threads')
    .select('*')
    .eq('mailbox_id', mailboxId)
    .or('snoozed_until.is.null,snoozed_until.lte.' + new Date().toISOString())
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (folderId) q = q.eq('folder_id', folderId);
  else if (folder === 'inbox') q = q.is('folder_id', null);

  if (cursor) q = q.lt('last_message_at', cursor);

  const { data, error } = await q;
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as Thread[];
}

export async function searchThreads(mailboxId: string, filters: SearchFilters) {
  const { data, error } = await supabase
    .from('messages')
    .select('thread_id, subject, from_address, from_name, body_text, sent_at')
    .eq('mailbox_id', mailboxId)
    .textSearch('body_text', filters.query, { type: 'websearch' })
    .order('sent_at', { ascending: false })
    .limit(50);
  if (error) {
    // FTS fallback — ilike
    const { data: fallback, error: fallbackError } = await supabase
      .from('messages')
      .select('thread_id, subject, from_address, sent_at')
      .eq('mailbox_id', mailboxId)
      .or(`subject.ilike.%${filters.query}%,from_address.ilike.%${filters.query}%,body_text.ilike.%${filters.query}%`)
      .order('sent_at', { ascending: false })
      .limit(50);
    if (fallbackError) throw fallbackError;
    return Array.isArray(fallback) ? fallback : [];
  }
  return Array.isArray(data) ? data : [];
}

export async function updateThread(threadId: string, updates: Partial<Thread>) {
  const { error } = await supabase.from('threads').update(updates).eq('id', threadId);
  if (error) throw error;
}

// ============================================================
// MESSAGES
// ============================================================
export async function fetchMessages(threadId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*, attachments(*), spam_flags(*)')
    .eq('thread_id', threadId)
    .order('sent_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as Message[];
}

export async function markMessageRead(messageId: string) {
  const { error } = await supabase.from('messages').update({ is_read: true }).eq('id', messageId);
  if (error) throw error;
}

export interface LocalDraftInput {
  threadId?: string;
  messageId?: string;
  mailboxId: string;
  folderId: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyHtml: string;
}

/** Persist one local draft message.  The stable thread/message ids prevent every
 * editor debounce from creating another Drafts entry. */
export async function saveLocalDraft(input: LocalDraftInput): Promise<{ threadId: string; messageId: string }> {
  const now = new Date().toISOString();
  const participants = Array.from(new Set([...input.to, ...input.cc, ...input.bcc]));
  let threadId = input.threadId;

  if (threadId) {
    const { error } = await supabase.from('threads').update({
      subject: input.subject || '(no subject)', participants, folder_id: input.folderId,
      last_message_at: now, is_read: true,
    }).eq('id', threadId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from('threads').insert({
      mailbox_id: input.mailboxId, subject: input.subject || '(no subject)', participants,
      folder_id: input.folderId, last_message_at: now, is_read: true, is_starred: false, labels: [],
    }).select('id').single();
    if (error || !data) throw error ?? new Error('Could not create draft thread');
    threadId = data.id;
  }

  const resolvedThreadId = threadId!;
  const message = {
    thread_id: resolvedThreadId,
    mailbox_id: input.mailboxId,
    subject: input.subject || '(no subject)',
    to_addresses: input.to,
    cc_addresses: input.cc,
    bcc_addresses: input.bcc,
    body_html: input.bodyHtml,
    body_text: input.bodyHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
    sent_at: now,
    is_read: true,
    is_flagged: false,
    is_draft: true,
    spam_status: 'clean',
    raw_headers: { 'x-frimps-draft': 'true' },
  };

  if (input.messageId) {
    const { error } = await supabase.from('messages').update(message).eq('id', input.messageId);
    if (error) throw error;
    return { threadId: resolvedThreadId, messageId: input.messageId };
  }
  const { data, error } = await supabase.from('messages').insert(message).select('id').single();
  if (error || !data) throw error ?? new Error('Could not create draft message');
  return { threadId: resolvedThreadId, messageId: data.id };
}

export async function discardLocalDraft(threadId: string) {
  const { error } = await supabase.from('threads').delete().eq('id', threadId);
  if (error) throw error;
}

export async function updateSpamFlag(flagId: string, action: 'confirmed' | 'dismissed') {
  const { error } = await supabase
    .from('spam_flags')
    .update({ user_action: action })
    .eq('id', flagId);
  if (error) throw error;
}

// ============================================================
// AI CACHE
// ============================================================
export async function fetchAiCache(threadId: string, type: 'summary' | 'draft_suggestion') {
  const { data, error } = await supabase
    .from('ai_cache')
    .select('*')
    .eq('thread_id', threadId)
    .eq('type', type)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertAiCache(threadId: string, type: 'summary', content: string) {
  const { error } = await supabase
    .from('ai_cache')
    .upsert({ thread_id: threadId, type, content, generated_at: new Date().toISOString() },
      { onConflict: 'thread_id,type' });
  if (error) throw error;
}

// ============================================================
// CONTACTS
// ============================================================
export async function fetchContacts(organizationId: string): Promise<Contact[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('organization_id', organizationId)
    .order('name', { ascending: true })
    .limit(500);
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as Contact[];
}

export async function createContact(contact: Omit<Contact, 'id' | 'created_at'>) {
  const { error } = await supabase.from('contacts').insert(contact);
  if (error) throw error;
}

export async function updateContact(id: string, updates: Partial<Contact>) {
  const { error } = await supabase.from('contacts').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteContact(id: string) {
  const { error } = await supabase.from('contacts').delete().eq('id', id);
  if (error) throw error;
}

export async function searchContacts(orgId: string, query: string): Promise<Contact[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('id, name, email, company')
    .eq('organization_id', orgId)
    .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
    .order('name')
    .limit(20);
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as Contact[];
}

// ============================================================
// SIGNATURES
// ============================================================
export async function fetchSignatures(mailboxId: string): Promise<Signature[]> {
  const { data, error } = await supabase
    .from('signatures')
    .select('*')
    .eq('mailbox_id', mailboxId)
    .order('is_default', { ascending: false });
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as Signature[];
}

export async function upsertSignature(sig: Omit<Signature, 'id' | 'created_at'> & { id?: string }) {
  if (sig.id) {
    const { error } = await supabase.from('signatures').update(sig).eq('id', sig.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('signatures').insert(sig);
    if (error) throw error;
  }
}

export async function deleteSignature(id: string) {
  const { error } = await supabase.from('signatures').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// RULES
// ============================================================
export async function fetchRules(mailboxId: string): Promise<Rule[]> {
  const { data, error } = await supabase
    .from('rules')
    .select('*')
    .eq('mailbox_id', mailboxId)
    .order('created_at');
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as Rule[];
}

export async function upsertRule(rule: Omit<Rule, 'id' | 'created_at'> & { id?: string }) {
  if (rule.id) {
    const { error } = await supabase.from('rules').update(rule).eq('id', rule.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('rules').insert(rule);
    if (error) throw error;
  }
}

export async function deleteRule(id: string) {
  const { error } = await supabase.from('rules').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// CALENDAR
// ============================================================
export async function fetchCalendarEvents(orgId: string, from: Date, to: Date): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*, calendar_event_attachments(*), resource_bookings(*, resources(*))')
    .eq('organization_id', orgId)
    .gte('start_at', from.toISOString())
    .lte('end_at', to.toISOString())
    .order('start_at');
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as CalendarEvent[];
}

export async function fetchAllCalendarEvents(orgId: string): Promise<CalendarEvent[]> {
  // Used for free/busy — fetch a wider range (±90 days)
  const from = new Date(); from.setDate(from.getDate() - 7);
  const to = new Date(); to.setDate(to.getDate() + 90);
  const { data, error } = await supabase
    .from('calendar_events')
    .select('id, title, start_at, end_at, status, created_by, attendees, is_task')
    .eq('organization_id', orgId)
    .gte('start_at', from.toISOString())
    .lte('start_at', to.toISOString())
    .order('start_at');
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as CalendarEvent[];
}

export async function createCalendarEvent(event: Omit<CalendarEvent, 'id' | 'created_at' | 'calendar_event_attachments' | 'resource_bookings'>) {
  const { data, error } = await supabase.from('calendar_events').insert(event).select('id').single();
  if (error) throw error;
  return data as { id: string };
}

export async function updateCalendarEvent(id: string, updates: Partial<CalendarEvent>) {
  const { error } = await supabase.from('calendar_events').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteCalendarEvent(id: string) {
  const { error } = await supabase.from('calendar_events').delete().eq('id', id);
  if (error) throw error;
}

export async function uploadCalendarAttachment(eventId: string, file: File): Promise<CalendarEventAttachment> {
  const path = `calendar-attachments/${eventId}/${Date.now()}-${file.name}`;
  const { error: upErr } = await supabase.storage.from('attachments').upload(path, file, { upsert: true });
  if (upErr) throw upErr;
  const { data, error } = await supabase.from('calendar_event_attachments').insert({
    event_id: eventId,
    storage_path: path,
    filename: file.name,
    mime_type: file.type || null,
    size_bytes: file.size,
  }).select().single();
  if (error) throw error;
  return data as CalendarEventAttachment;
}

export async function deleteCalendarAttachment(id: string, storagePath: string) {
  const { error: storageError } = await supabase.storage.from('attachments').remove([storagePath]);
  if (storageError) throw storageError;
  const { error } = await supabase.from('calendar_event_attachments').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// RESOURCES
// ============================================================
export async function fetchResources(orgId: string): Promise<Resource[]> {
  const { data, error } = await supabase.from('resources').select('*').eq('organization_id', orgId).order('name');
  if (error) throw error;
  return (data ?? []) as Resource[];
}

export async function createResource(resource: Omit<Resource, 'id' | 'created_at'>) {
  const { error } = await supabase.from('resources').insert(resource);
  if (error) throw error;
}

export async function updateResource(id: string, updates: Partial<Resource>) {
  const { error } = await supabase.from('resources').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteResource(id: string) {
  const { error } = await supabase.from('resources').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchResourceBookings(orgId: string, from: Date, to: Date): Promise<ResourceBooking[]> {
  const { data, error } = await supabase
    .from('resource_bookings')
    .select('*, resources!inner(id,name,type,organization_id), calendar_events(id,title)')
    .eq('resources.organization_id', orgId)
    .gte('start_at', from.toISOString())
    .lte('end_at', to.toISOString())
    .order('start_at');
  if (error) throw error;
  return (data ?? []) as ResourceBooking[];
}

export async function createResourceBooking(booking: Omit<ResourceBooking, 'id' | 'created_at' | 'resources' | 'calendar_events'>) {
  const { error } = await supabase.from('resource_bookings').insert(booking);
  if (error) throw error;
}

export async function deleteResourceBooking(calendarEventId: string) {
  const { error } = await supabase.from('resource_bookings').delete().eq('calendar_event_id', calendarEventId);
  if (error) throw error;
}

// ============================================================
// FEATURE INTEREST
// ============================================================
export async function logFeatureInterest(staffUserId: string, feature: string) {
  const { error } = await supabase.from('feature_interest').insert({ staff_user_id: staffUserId, feature });
  if (error) throw error;
}

// ============================================================
// EMAIL TEMPLATES
// ============================================================
export async function fetchEmailTemplates(orgId: string): Promise<EmailTemplate[]> {
  const { data, error } = await supabase
    .from('email_templates')
    .select('*')
    .eq('organization_id', orgId)
    .order('category')
    .order('name');
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as EmailTemplate[];
}

export async function upsertEmailTemplate(tmpl: Omit<EmailTemplate, 'id' | 'created_at' | 'updated_at'> & { id?: string }) {
  if (tmpl.id) {
    const { error } = await supabase.from('email_templates').update({ ...tmpl, updated_at: new Date().toISOString() }).eq('id', tmpl.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('email_templates').insert(tmpl);
    if (error) throw error;
  }
}

export async function deleteEmailTemplate(id: string) {
  const { error } = await supabase.from('email_templates').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// CONTACT GROUPS
// ============================================================
/** Fetch groups visible to the current user: all org-wide groups + groups scoped to this mailbox */
export async function fetchContactGroups(orgId: string, mailboxId?: string): Promise<ContactGroup[]> {
  let query = supabase
    .from('contact_groups')
    .select('*, contact_group_members(count)')
    .eq('organization_id', orgId)
    .order('name');

  if (mailboxId) {
    // Show groups owned by this mailbox OR org-wide groups (mailbox_id is null)
    query = query.or(`mailbox_id.eq.${mailboxId},mailbox_id.is.null`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as ContactGroup[];
}

export async function createContactGroup(group: Omit<ContactGroup, 'id' | 'created_at' | 'members' | 'member_count'>) {
  const { data, error } = await supabase.from('contact_groups').insert(group).select().single();
  if (error) throw error;
  return data as ContactGroup;
}

export async function updateContactGroup(id: string, updates: Partial<Pick<ContactGroup, 'name' | 'description'>>) {
  const { error } = await supabase.from('contact_groups').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteContactGroup(id: string) {
  const { error } = await supabase.from('contact_groups').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchGroupMembers(groupId: string): Promise<Contact[]> {
  const { data, error } = await supabase
    .from('contact_group_members')
    .select('contacts(*)')
    .eq('group_id', groupId);
  if (error) throw error;
  const contacts = (data ?? []).map((row: Record<string, unknown>) => row.contacts as Contact).filter(Boolean);
  return contacts;
}

export async function addGroupMember(groupId: string, contactId: string) {
  const { error } = await supabase.from('contact_group_members').upsert({ group_id: groupId, contact_id: contactId });
  if (error) throw error;
}

export async function removeGroupMember(groupId: string, contactId: string) {
  const { error } = await supabase.from('contact_group_members').delete().eq('group_id', groupId).eq('contact_id', contactId);
  if (error) throw error;
}

/** Expand a group into its member email addresses (for compose To/CC) */
export async function expandGroupToEmails(groupId: string): Promise<string[]> {
  const members = await fetchGroupMembers(groupId);
  return members.map(m => m.name ? `${m.name} <${m.email}>` : m.email);
}

// ============================================================
// SAVED SEARCHES
// ============================================================
export async function fetchSavedSearches(staffUserId: string): Promise<SavedSearch[]> {
  const { data, error } = await supabase
    .from('saved_searches')
    .select('*')
    .eq('staff_user_id', staffUserId)
    .order('created_at');
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as SavedSearch[];
}

export async function createSavedSearch(s: Omit<SavedSearch, 'id' | 'created_at'>) {
  const { error } = await supabase.from('saved_searches').insert(s);
  if (error) throw error;
}

export async function deleteSavedSearch(id: string) {
  const { error } = await supabase.from('saved_searches').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// FOLLOW-UP REMINDERS
// ============================================================
export async function setFollowUp(threadId: string, staffUserId: string, remindAt: Date, note?: string, priority: FollowUpReminder['priority'] = 'normal') {
  const { error: threadError } = await supabase.from('threads')
    .update({ follow_up_at: remindAt.toISOString(), follow_up_note: note ?? null }).eq('id', threadId);
  if (threadError) throw threadError;
  const { error } = await supabase.from('follow_up_reminders').upsert(
    { thread_id: threadId, staff_user_id: staffUserId, remind_at: remindAt.toISOString(), due_at: remindAt.toISOString(), priority, note: note ?? null, is_dismissed: false, completed_at: null },
    { onConflict: 'thread_id,staff_user_id' }
  );
  if (error) throw error;
}

export async function dismissFollowUp(threadId: string, staffUserId: string) {
  const { error: threadError } = await supabase.from('threads')
    .update({ follow_up_at: null, follow_up_note: null }).eq('id', threadId);
  if (threadError) throw threadError;
  const { error } = await supabase.from('follow_up_reminders')
    .update({ is_dismissed: true }).eq('thread_id', threadId).eq('staff_user_id', staffUserId);
  if (error) throw error;
}

export async function fetchPendingFollowUps(staffUserId: string): Promise<FollowUpReminder[]> {
  const { data, error } = await supabase
    .from('follow_up_reminders')
    .select('*, threads(id,subject,participants,last_message_at,mailbox_id)')
    .eq('staff_user_id', staffUserId)
    .eq('is_dismissed', false)
    .is('completed_at', null)
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('remind_at', { ascending: true });
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as FollowUpReminder[];
}

export async function createFollowUpTask(task: {
  staff_user_id: string;
  title: string;
  note?: string | null;
  remind_at: string;
  due_at?: string | null;
  priority: FollowUpReminder['priority'];
}) {
  const { data, error } = await supabase.from('follow_up_reminders').insert({
    thread_id: null,
    staff_user_id: task.staff_user_id,
    title: task.title,
    note: task.note ?? null,
    remind_at: task.remind_at,
    due_at: task.due_at ?? task.remind_at,
    priority: task.priority,
    is_dismissed: false,
    completed_at: null,
  }).select().single();
  if (error) throw error;
  return data as FollowUpReminder;
}

export async function updateFollowUp(id: string, updates: Partial<Pick<FollowUpReminder, 'title' | 'note' | 'remind_at' | 'due_at' | 'priority' | 'is_dismissed' | 'completed_at'>>) {
  const { error } = await supabase.from('follow_up_reminders').update(updates).eq('id', id);
  if (error) throw error;
}

// ============================================================
// WEBHOOK ENDPOINTS
// ============================================================
export async function fetchWebhooks(orgId: string): Promise<WebhookEndpoint[]> {
  const { data, error } = await supabase
    .from('webhook_endpoints')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as WebhookEndpoint[];
}

export async function createWebhook(wh: Omit<WebhookEndpoint, 'id' | 'created_at' | 'last_triggered_at' | 'secret_token'>) {
  const { data, error } = await supabase.from('webhook_endpoints').insert(wh).select().single();
  if (error) throw error;
  return data as WebhookEndpoint;
}

export async function updateWebhook(id: string, updates: Partial<WebhookEndpoint>) {
  const { error } = await supabase.from('webhook_endpoints').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteWebhook(id: string) {
  const { error } = await supabase.from('webhook_endpoints').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchWebhookLogs(webhookId: string) {
  const { data, error } = await supabase
    .from('webhook_delivery_logs')
    .select('*')
    .eq('webhook_id', webhookId)
    .order('delivered_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

// ============================================================
// API KEYS
// ============================================================
export async function fetchApiKeys(orgId: string): Promise<ApiKey[]> {
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, name, key_prefix, scopes, is_active, last_used_at, expires_at, created_at')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as ApiKey[];
}

export async function createApiKey(orgId: string, createdBy: string, name: string, scopes: string[]): Promise<{ key: string; record: ApiKey }> {
  const rawKey = `cmail_${Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('')}`;
  const prefix = rawKey.slice(0, 14);
  // Hash key for storage (simple SHA-256 via SubtleCrypto)
  const encoder = new TextEncoder();
  const hashBuf = await crypto.subtle.digest('SHA-256', encoder.encode(rawKey));
  const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
  const { data, error } = await supabase.from('api_keys').insert({
    organization_id: orgId, created_by: createdBy,
    name, key_hash: hashHex, key_prefix: prefix, scopes, is_active: true,
  }).select().single();
  if (error) throw error;
  return { key: rawKey, record: data as ApiKey };
}

export async function revokeApiKey(id: string) {
  const { error } = await supabase.from('api_keys').update({ is_active: false }).eq('id', id);
  if (error) throw error;
}

export async function deleteApiKey(id: string) {
  const { error } = await supabase.from('api_keys').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// MAILBOX DELEGATES
// ============================================================
export async function fetchDelegates(mailboxId: string): Promise<MailboxDelegate[]> {
  const { data, error } = await supabase
    .from('mailbox_delegates')
    .select('*, staff_users(full_name)')
    .eq('mailbox_id', mailboxId);
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as MailboxDelegate[];
}

export async function addDelegate(mailboxId: string, delegateUserId: string, permissionLevel: 'read' | 'send' | 'full', grantedBy: string) {
  const { error } = await supabase.from('mailbox_delegates').upsert(
    { mailbox_id: mailboxId, delegate_user_id: delegateUserId, permission_level: permissionLevel, granted_by: grantedBy },
    { onConflict: 'mailbox_id,delegate_user_id' }
  );
  if (error) throw error;
}

export async function removeDelegate(id: string) {
  const { error } = await supabase.from('mailbox_delegates').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// FULL-TEXT SEARCH (enhanced)
// ============================================================
export async function fullTextSearch(mailboxId: string, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return { messages: [], contacts: [], events: [], attachments: [] };

  // Try FTS on messages
  const { data: msgData, error: msgError } = await supabase
    .from('messages')
    .select('thread_id, subject, from_address, from_name, body_text, sent_at')
    .eq('mailbox_id', mailboxId)
    .or(`subject.ilike.%${trimmed}%,from_address.ilike.%${trimmed}%,from_name.ilike.%${trimmed}%,body_text.ilike.%${trimmed}%`)
    .order('sent_at', { ascending: false })
    .limit(50);
  if (msgError) throw msgError;

  // Also search contacts
  const orgQ = await supabase.from('mailboxes').select('organization_id').eq('id', mailboxId).single();
  if (orgQ.error) throw orgQ.error;
  const orgId = orgQ.data?.organization_id;
  let contactMatches: Contact[] = [];
  if (orgId) {
    const { data: cData, error: contactError } = await supabase
      .from('contacts')
      .select('*')
      .eq('organization_id', orgId)
      .or(`name.ilike.%${trimmed}%,email.ilike.%${trimmed}%,company.ilike.%${trimmed}%`)
      .limit(10);
    if (contactError) throw contactError;
    contactMatches = (Array.isArray(cData) ? cData : []) as Contact[];
  }

  let events: CalendarEvent[] = [];
  let attachments: Attachment[] = [];
  if (orgId) {
    const { data: eventData, error: eventError } = await supabase
      .from('calendar_events')
      .select('id, organization_id, created_by, title, description, agenda, start_at, end_at, location, attendees, department, status, is_task, is_completed, recurrence_rule, recurrence_end_date, parent_event_id, reminder_minutes_before, reminder_sent_at, created_at')
      .eq('organization_id', orgId)
      .or(`title.ilike.%${trimmed}%,description.ilike.%${trimmed}%,agenda.ilike.%${trimmed}%,location.ilike.%${trimmed}%`)
      .order('start_at', { ascending: false })
      .limit(10);
    if (eventError) throw eventError;
    events = (Array.isArray(eventData) ? eventData : []) as CalendarEvent[];
  }

  const { data: attachmentData, error: attachmentError } = await supabase
    .from('attachments')
    .select('id, message_id, storage_path, filename, mime_type, size_bytes, created_at, messages!inner(mailbox_id)')
    .eq('messages.mailbox_id', mailboxId)
    .ilike('filename', `%${trimmed}%`)
    .limit(10);
  if (attachmentError) throw attachmentError;
  attachments = (Array.isArray(attachmentData) ? attachmentData : []) as Attachment[];

  return { messages: Array.isArray(msgData) ? msgData : [], contacts: contactMatches, events, attachments };
}

// ============================================================
// OUT-OF-OFFICE (mailbox settings)
// ============================================================
export async function updateOooSettings(mailboxId: string, settings: {
  ooo_enabled: boolean;
  ooo_subject?: string;
  ooo_body_html?: string;
  ooo_start_date?: string;
  ooo_end_date?: string;
}) {
  const { error } = await supabase.from('mailboxes').update(settings).eq('id', mailboxId);
  if (error) throw error;
}
