// ============================================================
// Frimps Mail — TypeScript Type Definitions
// ============================================================

export interface Organization {
  id: string;
  name: string;
  domain: string;
  branding_config: BrandingConfig;
  created_at: string;
}

export interface BrandingConfig {
  primary_color?: string;
  accent_color?: string;
  surface_color?: string;
  logo_url?: string;
  theme_mode?: 'light' | 'dark';
}

export interface StaffUser {
  id: string;
  organization_id: string;
  full_name: string | null;
  role: 'admin' | 'staff';
  created_at: string;
}

export interface Mailbox {
  id: string;
  organization_id: string;
  staff_user_id: string | null;
  email_address: string;
  display_name: string | null;
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  credential_vault_ref: string | null;
  sync_status: 'pending' | 'syncing' | 'active' | 'error';
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
  // joined
  staff_users?: StaffUser | null;
}

export interface MailboxFolder {
  id: string;
  mailbox_id: string;
  imap_folder_name: string;
  normalized_type: 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive' | 'custom' | null;
  display_name: string | null;
}

export interface Thread {
  id: string;
  mailbox_id: string;
  subject: string | null;
  participants: string[];
  last_message_at: string | null;
  is_read: boolean;
  is_starred: boolean;
  labels: string[];
  folder_id: string | null;
  snoozed_until: string | null;
  created_at: string;
  latest_read_receipt_at?: string | null;
  // joined
  messages?: Message[];
  spam_flags?: SpamFlag[];
  has_attachments?: boolean;
  message_count?: number;
  latest_snippet?: string;
  latest_from_name?: string;
  latest_from_address?: string;
}

export interface Message {
  id: string;
  thread_id: string;
  mailbox_id: string;
  imap_uid: number;
  imap_uidvalidity: number;
  subject: string | null;
  from_address: string | null;
  from_name: string | null;
  to_addresses: string[];
  cc_addresses: string[];
  bcc_addresses: string[];
  body_html: string | null;
  body_text: string | null;
  sent_at: string | null;
  is_read: boolean;
  is_flagged: boolean;
  spam_score: number | null;
  spam_status: 'clean' | 'flagged' | 'confirmed_spam';
  raw_headers: Record<string, string>;
  read_receipt_confirmed_at: string | null;
  created_at: string;
  // joined
  attachments?: Attachment[];
  spam_flags?: SpamFlag[];
}

export interface Attachment {
  id: string;
  message_id: string;
  storage_path: string;
  filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export interface AiCache {
  id: string;
  thread_id: string;
  type: 'summary' | 'draft_suggestion';
  content: string;
  generated_at: string;
}

export interface SpamFlag {
  id: string;
  message_id: string;
  source: 'spamassassin' | 'ai_second_pass';
  confidence: number | null;
  reason: string | null;
  user_action: 'pending' | 'confirmed' | 'dismissed';
  created_at: string;
}

export interface Signature {
  id: string;
  mailbox_id: string;
  body_html: string;
  is_default: boolean;
  created_at: string;
}

export interface Contact {
  id: string;
  organization_id: string;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Rule {
  id: string;
  mailbox_id: string;
  condition_json: RuleCondition;
  action_json: RuleAction;
  is_active: boolean;
  created_at: string;
}

export interface RuleCondition {
  from_contains?: string;
  subject_contains?: string;
  to_contains?: string;
}

export interface RuleAction {
  add_label?: string;
  move_to_folder?: string;
  mark_as_read?: boolean;
}

export interface CalendarEvent {
  id: string;
  organization_id: string;
  created_by: string | null;
  title: string;
  description: string | null; // kept for backwards compat; agenda is canonical
  agenda: string | null;
  start_at: string;
  end_at: string;
  location: string | null;
  attendees: string[];
  department: 'HR' | 'Finance' | 'Operations' | 'General';
  status: 'confirmed' | 'tentative' | 'cancelled';
  is_task: boolean;
  is_completed: boolean;
  recurrence_rule: string | null;
  recurrence_end_date: string | null;
  parent_event_id: string | null;
  reminder_minutes_before: number | null;
  reminder_sent_at: string | null;
  created_at: string;
  // joined
  calendar_event_attachments?: CalendarEventAttachment[];
  resource_bookings?: ResourceBooking[];
}

export interface CalendarEventAttachment {
  id: string;
  event_id: string;
  storage_path: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export interface Resource {
  id: string;
  organization_id: string;
  name: string;
  type: 'room' | 'vehicle' | 'equipment' | 'other';
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ResourceBooking {
  id: string;
  resource_id: string;
  calendar_event_id: string;
  start_at: string;
  end_at: string;
  created_at: string;
  // joined
  resources?: Resource;
  calendar_events?: Pick<CalendarEvent, 'id' | 'title'>;
}

export interface ScheduledMessage {
  id: string;
  mailbox_id: string;
  to_addresses: string[];
  cc_addresses: string[];
  subject: string | null;
  body_html: string | null;
  attachments_json: unknown[];
  send_at: string;
  sent_at: string | null;
  status: 'pending' | 'sent' | 'failed';
  created_at: string;
}

// UI state types
export type FolderType = 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive';

export interface ComposeData {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  attachments: File[];
  replyToMessageId?: string;
  forwardFromMessageId?: string;
  scheduleAt?: Date;
}

export interface SearchFilters {
  query: string;
  from?: string;
  dateRange?: { from: Date; to: Date };
  folder?: FolderType;
  keywords?: string[];
  isNaturalLanguage?: boolean;
}

// ============================================================
// NEW: Feature Tables v2
// ============================================================

export interface EmailTemplate {
  id: string;
  organization_id: string;
  created_by: string | null;
  name: string;
  subject?: string | null;
  body_html: string;
  category?: string | null;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContactGroup {
  id: string;
  organization_id: string;
  /** When set, this group belongs to a specific mailbox (per-user). Null = org-wide. */
  mailbox_id: string | null;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  members?: Contact[];
  member_count?: number;
}

export interface ContactGroupMember {
  group_id: string;
  contact_id: string;
}

export interface SavedSearch {
  id: string;
  staff_user_id: string;
  name: string;
  query: string;
  filters?: Record<string, unknown>;
  icon?: string;
  created_at: string;
}

export interface FollowUpReminder {
  id: string;
  thread_id: string;
  staff_user_id: string;
  remind_at: string;
  note: string | null;
  is_dismissed: boolean;
  created_at: string;
}

export interface WebhookEndpoint {
  id: string;
  organization_id: string;
  url: string;
  events: string[];
  secret_token: string;
  is_active: boolean;
  last_triggered_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface WebhookDeliveryLog {
  id: string;
  webhook_id: string;
  event: string;
  payload: Record<string, unknown> | null;
  response_status: number | null;
  response_body: string | null;
  delivered_at: string;
  success: boolean;
}

export interface ApiKey {
  id: string;
  organization_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  scopes: string[];
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface MailboxDelegate {
  id: string;
  mailbox_id: string;
  delegate_user_id: string;
  permission_level: 'read' | 'send' | 'full';
  granted_by: string | null;
  created_at: string;
  // joined
  staff_users?: StaffUser | null;
}

export interface NotificationPreference {
  id: string;
  staff_user_id: string;
  push_enabled: boolean;
  sound_enabled: boolean;
  badge_enabled: boolean;
  sound_preset: string;
  custom_sound_url: string | null;
  created_at: string;
  updated_at: string;
}
