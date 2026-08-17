# Requirements Document

## 1. Application Overview

**Application Name:** Cosmos Mail (Phase 1: Frimps Mail)

**Description:** A premium webmail client that connects to standard IMAP/SMTP mail servers and provides a modern UI/UX with AI-powered features. Positioned as a Roundcube replacement with Google Workspace/Outlook-level polish. This is a client + sync layer + intelligence layer on top of existing mail infrastructure.

**Technology Stack:**
- Frontend: React + Vite + TypeScript + Tailwind CSS + shadcn/ui
- Backend: Supabase (Postgres + Auth + Storage + Vault + Edge Functions + Realtime)
- Sync Service: Node/TypeScript service using ImapFlow (IMAP IDLE) + nodemailer (SMTP)
- AI: Anthropic API via Supabase Edge Functions
- Push Notifications: Service Worker + Push API + Supabase Realtime
- Email Processing: juice (CSS inlining) + html-to-text (plain text generation)
- Calendar Recurrence: rrule.js library
- Calendar Invites: ics npm library

**Phase 1 Deployment Target:**
- Customer: Frimps Oil Company (frimpsoil.com.gh)
- Branding: Primary Red #E31E24, Accent Orange #F7941D, Surface White #FFFFFF, light theme
- Logo: frimps-logo.png displayed in app
- Multi-tenant architecture from day 1 (Phase 1 has one org, schema supports multiple orgs)

## 2. Users and Usage Scenarios

**Target Users:**
- Admin: Organization administrator who manages mailboxes, staff users, and resources
- Staff: Organization staff members who use mailboxes for email communication and calendar management
- Public Visitor: Potential customer visiting marketing landing page
- HR: Human Resources staff who manage signature placeholders across multiple users

**Core Usage Scenarios:**
- Public visitor browses marketing landing page, learns about Cosmos Mail features, and logs in via integrated sign-in panel
- Admin provisions staff users and configures mailboxes with IMAP/SMTP credentials
- Admin manages organizational resources (rooms, vehicles, equipment) for booking
- HR bulk updates signature placeholders like [Job Title] across multiple users
- Staff users access their mailboxes to read, compose, reply, and manage emails
- Staff users receive browser push notifications when new emails arrive
- Users leverage AI features for thread summarization and smart search
- Users manage contacts, calendar events with attachments and recurrence, and email rules
- Staff users compose rich-formatted emails that render correctly across all email clients
- Staff users view free/busy status of colleagues and book resources for meetings
- Staff users create recurring events and receive automatic reminders
- Staff users send calendar invites to external attendees via .ics attachments
- Staff users create and manage rich-formatted email signatures with resizable images

## 3. Page Structure and Functionality

### 3.1 Page Hierarchy

```
├── Public Routes
│   └── / (Landing Page with integrated login)
├── Authentication
│   └── /login (redirects to / or remains functional)
├── Admin Routes (role='admin' only)
│   ├── /admin/mailboxes
│   │   ├── Mailbox List
│   │   ├── Add Mailbox Form
│   │   ├── Edit Mailbox
│   │   └── Invite Staff User Form
│   ├── /admin/resources
│   │   ├── Resource List
│   │   ├── Add Resource Form
│   │   ├── Edit Resource
│   │   └── Delete Resource
│   └── /admin/signature-placeholders
│       ├── Placeholder List
│       ├── Bulk Update Form
│       └── User Selection Interface
├── Core Webmail UI
│   ├── /inbox (3-Pane Layout)
│   │   ├── Top Bar
│   │   ├── Left Rail
│   │   ├── Middle Pane (Thread List)
│   │   └── Right Pane (Reading Pane)
│   ├── /inbox/contacts
│   │   ├── Contact List
│   │   └── Contact CRUD Forms
│   ├── /inbox/calendar
│   │   ├── Month/Week View
│   │   ├── Free/Busy View
│   │   ├── Resource Availability View
│   │   ├── Event CRUD Forms
│   │   └── Department Filter Toggle
│   └── /inbox/settings
│       ├── Signatures Management (Rich Text Editor)
│       ├── Linked Mailboxes (read-only)
│       ├── Rules & Filters
│       ├── Out-of-Office
│       ├── Notification Preferences
│       └── Push Notification Settings
└── Sync Service (Separate Node/TS Project)
    └── Background sync process + SMTP send pipeline + reminder scheduler
```

### 3.2 Public Landing Page

**Route:** / (default public route)

**Design Reference:** https://www.privateemail.com/

**Branding:** Frimps Oil Company theme (Primary Red #E31E24, Accent Orange #F7941D, Surface White #FFFFFF, light theme, frimps-logo.png)

**Page Sections:**

**Hero Section:**
- Large headline emphasizing premium webmail for enterprises
- Subheadline highlighting AI-powered features and modern UI
- CTA button: \"Get Started\" (scrolls to sign-in panel)
- Hero image or illustration showcasing inbox interface

**Feature Grid:**
- Display 6-8 key features with icons and short descriptions:
  + AI-Powered Thread Summarization
  + Smart Natural Language Search
  + Real-Time Push Notifications
  + Multi-Mailbox Management
  + Advanced Spam Detection
  + Calendar & Contacts Integration
  + Rules & Filters Automation
  + Out-of-Office Autoresponder

**Pricing/Benefits Section:**
- Highlight enterprise benefits: security, reliability, customization
- Optional pricing tiers or \"Contact Sales\" CTA

**Testimonials:**
- 2-3 customer testimonials with avatar, name, company, quote

**FAQ Section:**
- Accordion-style FAQ with 5-7 common questions

**Integrated Sign-In Panel:**
- Fixed or sticky panel on right side or bottom of page
- Email and password input fields
- \"Sign In\" button
- Supabase Auth email + password authentication
- On successful login, redirect to /inbox
- On failed login, display error message inline

**Footer:**
- Links: Privacy Policy, Terms of Service, Contact
- Copyright notice

**Routing Behavior:**
- Unauthenticated users land on /
- Authenticated users accessing / are redirected to /inbox
- Existing /login route can redirect to / or remain functional as fallback

### 3.3 Authentication

**Login Page (/login):**
- Email and password input fields
- Supabase Auth email + password authentication
- NO open self-signup (internal tool)
- Themeable CSS variables resolved from org branding_config based on domain detected pre-auth
- For Frimps Oil: light theme, white background, red primary button, Frimps logo centered in login card
- Default Cosmos Mail theme: dark indigo #1B1F3B background
- CSS variables: --cosmos-bg, --cosmos-primary, --cosmos-accent, --cosmos-surface, --cosmos-text
- Note: /login may redirect to / or remain as standalone login page

### 3.4 Admin Routes

**Access Control:** role='admin' only, redirect others

**3.4.1 /admin/mailboxes - Mailbox Management**

**Mailbox List:**
- Display table with columns: email, display name, sync status badge, last synced timestamp, linked user
- Sync status values: 'pending', 'syncing', 'active', 'error'
- Actions: Add Mailbox, Edit, Delete

**Add Mailbox Form:**
- Fields: email address, display name, IMAP host, IMAP port (default 993), SMTP host, SMTP port (default 587), password
- Password stored via Edge Function to Supabase Vault, never raw in DB
- Submit creates mailboxes row with credential_vault_ref

**Edit Mailbox:**
- Update email, display name, IMAP/SMTP details
- Password update via Vault Edge Function

**Delete Mailbox:**
- Remove mailbox and associated data

**Invite Staff User Form:**
- Fields: full name, email, role ('admin' or 'staff')
- Submit calls Edge Function to create staff_users row + Supabase auth user via Admin API
- Sends invite email to user

**3.4.2 /admin/resources - Resource Management**

**Resource List:**
- Display table with columns: name, type (room/vehicle/equipment/other), description, is_active status
- Actions: Add Resource, Edit, Delete

**Add Resource Form:**
- Fields: name, type (dropdown: room/vehicle/equipment/other), description, is_active (checkbox, default true)
- Submit creates resources row

**Edit Resource:**
- Update name, type, description, is_active status

**Delete Resource:**
- Remove resource and associated bookings

**3.4.3 /admin/signature-placeholders - Signature Placeholder Management**

**Placeholder List:**
- Display table with columns: placeholder name (e.g., [Job Title], [Department], [Phone]), current value count (number of users using this placeholder)
- Actions: Bulk Update

**Bulk Update Form:**
- Select placeholder from dropdown (e.g., [Job Title])
- Multi-select user list with checkboxes (display user name, email, current placeholder value)
- Input field for new placeholder value
- Preview section showing before/after signature samples
- Submit button applies update to all selected users

**User Selection Interface:**
- Search/filter users by name, email, department
- Select all/deselect all toggle
- Display current placeholder value for each user

### 3.5 Core Webmail UI

**3.5.1 Top Bar:**
- Org logo top-left (from branding_config.logo_url)
- Centered search input
- Notification bell icon with unread count badge
- Settings/account icons right-aligned

**3.5.2 Left Rail:**
- Compose button (pill-shaped, full width)
- Folder list: Inbox (with unread count badge), Drafts, Sent, Spam, Trash, Archive
- Mailbox switcher (if multiple mailboxes)
- Sync/storage status pinned bottom

**3.5.3 Middle Pane (Thread List):**
- Thread rows display:
  - Sender name (bold if unread)
  - Timestamp (right-aligned)
  - Subject
  - Snippet preview
  - Unread dot indicator
  - Paperclip icon for attachments
  - Spam badge if pending flag
- Multi-select for bulk actions
- Supabase Realtime subscriptions for live updates

**3.5.4 Right Pane (Reading Pane):**
- Icon-only action toolbar: reply, reply-all, forward, mark-unread, star, delete, move-to-spam, view-source
- Subject heading
- Sender avatar + name + email + timestamp
- Full message body (HTML or plain text)
- Thread conversation view (most recent expanded, older collapsed)
- Reply buttons pinned at bottom
- AI Summary card (for threads with 3+ messages, collapsible, accent border)

**3.5.5 Compose Modal/Slide-in Panel:**

**Window Size and Controls:**
- Default dimensions: approximately 1300px wide by 700px tall
- Docked to bottom-right corner
- Window chrome includes:
  + Minimize control (collapses to title bar only)
  + Full-screen expand toggle (fills most of viewport, toggles back to docked position)
  + Close (X) control
- Responsive behavior: on tablet/mobile viewports, falls back to full-width single-pane layout

**Compose Fields:**
- To/Cc/Bcc fields with autocomplete (from contacts table + seen addresses)
- Subject field

**Rich Text Editor:**
- Tiptap-based rich text editor
- Formatting toolbar positioned directly above message body with controls:
  + Text formatting: Bold, Italic, Underline, Strikethrough
  + Font family dropdown: sans-serif, serif, monospace
  + Font size dropdown: small, normal, large, huge
  + Text color picker
  + Highlight/background color picker
  + Alignment: left, center, right, justify
  + Lists: ordered list, unordered list, indent, outdent
  + Insert link (opens inline popover for URL + display text)
  + Insert emoji (emoji picker popover)
  + Insert inline image (allows dropping image directly into message body, stored via Supabase Storage, rendered inline in body_html)
  + Remove formatting button
  + Blockquote toggle
- Toolbar styled consistently with Frimps theme (red/orange/white)

**Bottom Action Row:**
- Send button
- Attachment upload to Supabase Storage
- Schedule send option (stores in scheduled_messages table)
- More options grid icon

**Data Storage:**
- Rich text output stored as body_html in messages table
- Inline images stored via Supabase Storage, referenced in body_html

**Reply/Forward Compatibility:**
- Existing Reply/Reply-All/Forward quoting behavior preserved
- Quoted content renders correctly inside rich text editor

**3.5.6 Core Actions:**
- **Reply / Reply All / Forward:** Opens compose panel with pre-filled fields
- **Mark Read/Unread:** Updates is_read flag
- **Star:** Updates is_starred flag
- **Delete:** Moves to Trash folder
- **Move to Spam:** Moves to Spam folder, updates spam_status
- **Archive:** Moves to Archive folder
- **Snooze:** Sets snoozed_until timestamp, hides thread until time passes
- **View Source:** Displays raw_headers and message source

**3.5.7 Search:**
- **Plain Search:** Postgres full-text search across messages.subject/body_text/from_address, all folders + mailboxes
- **Smart Search (Natural Language):** Detects natural-language queries (contains \"from\", \"last\", \"about\", date phrases), calls Edge Function → Anthropic API → extracts structured filters (sender, date range, keywords, folder) → Postgres query. Displays parsed filter chips above results. Fallback to plain search on AI failure.

**3.5.8 Spam UX:**
- Non-intrusive banner on inbox messages with pending spam_flag
- Actions: \"Move to Spam\" or \"Not Spam\"
- Never auto-move silently

### 3.6 Browser Push Notifications

**Notification Permission Handling:**
- On first login or when user navigates to /inbox/settings, display prompt to enable push notifications
- Request browser notification permission via Notification API
- Store user preference in notification_preferences table

**Push Notification Triggers:**
- When sync service inserts new message into messages table, trigger push notification via Supabase Realtime or Edge Function
- Notification payload includes: sender name, subject, snippet preview

**Notification Behavior:**
- Display native desktop/browser alert with sender, subject, snippet
- Click notification opens corresponding thread in /inbox reading pane
- Optional sound indicator (configurable in settings)
- Optional badge indicator on browser tab/icon (unread count)

**Settings Integration:**
- /inbox/settings includes Push Notification Settings section
- Toggle: Enable/Disable push notifications
- Toggle: Enable/Disable notification sound
- Toggle: Enable/Disable badge indicator

**Service Worker:**
- Register service worker for push notification handling
- Service worker listens for push events and displays notifications
- Service worker handles notification click events to open thread

### 3.7 Contacts Management

**3.7.1 /inbox/contacts - Contact List:**
- Display table with columns: name, email, company, phone
- Actions: Add Contact, Edit, Delete
- Auto-suggest adding contact on reply to new address

**3.7.2 Contact CRUD Forms:**
- Fields: name, email, company, phone, notes
- Submit creates/updates contacts row

### 3.8 Calendar

**3.8.1 /inbox/calendar - Calendar Views:**

**Month/Week View:**
- Month/week view toggle
- Display events from calendar_events table
- Color-code events by department (HR, Finance, Operations, General)
- Render tasks (is_task=true) as checkbox-style items (not timed blocks)
- Allow toggling is_completed directly from calendar view
- Completed tasks visually gray out/strike through but remain visible
- Expand recurring events client-side using rrule.js
- Actions: Add Event, Edit, Delete

**Department Filter Toggle:**
- Filter/toggle to show/hide events by department (HR, Finance, Operations, General)

**Free/Busy View:**
- Display all staff as horizontal rows across day/week timeline
- Show colored Busy blocks for confirmed events
- Show tentative events with diagonal stripes
- No event titles/descriptions exposed in this view

**Resource Availability View:**
- Display resources as horizontal rows across day/week timeline
- Show booked time slots with resource name
- Indicate conflicts when resource is double-booked

**3.8.2 Event CRUD Forms:**

**Fields:**
- Title
- Agenda (renamed from description)
- Start date/time
- End date/time
- Location
- Attendees (text array)
- Department (dropdown: HR, Finance, Operations, General — default General)
- Status (dropdown: confirmed, tentative, cancelled)
- Is Task (checkbox, default false)
- Is Completed (checkbox, visible only if is_task=true, default false)
- Recurrence Rule (dropdown: None/Daily/Weekly/Monthly/Custom, opens recurrence picker)
- Recurrence End Date (visible only if recurrence rule set)
- Reminder (dropdown: None/10 minutes/30 minutes/60 minutes before)
- Book a Resource (dropdown with conflict detection)
- Attach File (file upload control)

**Recurrence Picker:**
- None: no recurrence
- Daily: repeat every N days
- Weekly: repeat every N weeks on selected days
- Monthly: repeat every N months on selected day
- Custom: RRULE string input for advanced patterns

**Conflict Detection:**
- When booking resource, check resource_bookings for overlapping time slots
- Display warning if conflict detected

**Editing Recurring Events:**
- Prompt user: \"Edit this occurrence\" or \"Edit entire series\"
- If \"this occurrence\", create new event with parent_event_id
- If \"entire series\", update parent event and all future occurrences

**Attached Files:**
- Display list of attached files in event detail view
- Allow download/delete of attachments

**Submit:**
- Creates/updates calendar_events row
- Creates resource_bookings row if resource selected
- Uploads attachments to Supabase Storage, creates calendar_event_attachments rows
- If external attendees (non-staff emails) present, generate .ics file and queue email with attachment

### 3.9 Settings

**3.9.1 /inbox/settings - Settings Page:**

**Signatures Management:**

**Signature List:**
- Display list of signatures per mailbox
- Actions: Add Signature, Edit, Delete
- Show signature name, is_default flag

**Add/Edit Signature Form:**

**Rich Text Editor:**
- Reuse the same Tiptap-based rich text editor component from Compose as a shared component
- Include the same formatting toolbar:
  + Text formatting: Bold, Italic, Underline, Strikethrough
  + Font family dropdown: sans-serif, serif, monospace
  + Font size dropdown: small, normal, large, huge
  + Text color picker
  + Highlight/background color picker
  + Alignment: left, center, right, justify
  + Lists: ordered list, unordered list, indent, outdent
  + Insert link
  + Insert emoji
  + Insert inline image
  + Remove formatting button
  + Blockquote toggle

**Image Insert and Resize:**
- Image insert control in toolbar (same upload mechanism as Compose)
- Images stored in Supabase Storage, referenced via <img> tag in signature HTML
- After image inserted, display resize handles (corner-drag) for direct in-editor resizing
- Enforce maximum width cap (e.g., 300px) to prevent oversized signature images
- Save resized dimensions as explicit width and height HTML attributes on <img> tag (not just CSS)

**Live Preview Panel:**
- Display live preview below or beside signature editor
- Preview shows signature as it will render after CSS-inlining pipeline (Prompt 09 logic) is applied
- Preview updates in real-time as user edits signature
- Ensures user sees final rendered output matching what recipients will see

**Fields:**
- Signature name (optional, for user reference)
- is_default flag (checkbox)
- body_html (rich text editor output)

**Submit:**
- Creates/updates signatures row
- Signature auto-appended to outgoing emails as before

**Linked Mailboxes (read-only):**
- Display list of mailboxes linked to current user

**Rules & Filters:**
- List active rules
- Add/Edit/Delete rule
- Fields: condition_json (from/subject contains), action_json (label/move/mark-read), is_active flag
- Rules applied in sync service after inserting new message

**Out-of-Office:**
- Toggle autoresponder on/off
- Fields: subject, body, optional start/end dates
- Calls Edge Function → cPanel UAPI Email::add_autoresponder

**Notification Preferences:**
- Toggle: Enable/Disable email notifications
- Toggle: Enable/Disable desktop notifications

**Push Notification Settings:**
- Toggle: Enable/Disable push notifications
- Toggle: Enable/Disable notification sound
- Toggle: Enable/Disable badge indicator
- Button: Request notification permission (if not granted)

### 3.10 Sync Service

**Location:** /sync-service/ directory

**Structure:**
- src/index.ts — entrypoint, starts sync loop for all active mailboxes
- src/imap-client.ts — ImapFlow wrapper: connect, backfill, IDLE watch
- src/smtp-client.ts — nodemailer wrapper for send + email-safe send pipeline
- src/folder-mapper.ts — maps IMAP folder names to normalized_type
- src/spam-detector.ts — parses X-Spam-Score/X-Spam-Status headers + AI second-pass
- src/supabase-sync.ts — writes parsed mail into Postgres + Storage
- src/credential-vault.ts — retrieves decrypted credentials from Supabase Vault
- src/push-notifier.ts — triggers push notifications via Supabase Realtime or Edge Function
- src/email-safe-pipeline.ts — CSS inlining + plain text generation before SMTP send
- src/reminder-scheduler.ts — checks for due reminders every 1-2 minutes
- src/ics-generator.ts — generates .ics files for calendar invites
- Dockerfile, package.json

**Sync Behaviors:**

**Multi-Folder Real-Time Sync:**
- For each active mailbox, maintain multiple simultaneous IMAP connections — one per folder
- High-priority folders (Inbox, Sent, Drafts, Archive): dedicated IDLE connection each
- Lower-priority folders (Trash, Spam): polling every 60-120 seconds
- Initial backfill: last 90 days across all folders on first connect; sync_status 'syncing' → 'active'
- Folder discovery via IMAP LIST → populate mailbox_folders
- Messages from all folders stored with correct folder metadata (folder_id references mailbox_folders)
- Deduplication via unique(mailbox_id, imap_uid, imap_uidvalidity) applies to all folders
- SMTP-sent messages that later appear in IMAP Sent folder handled by deduplication constraint

**General Sync Logic:**
- Threading via In-Reply-To/References headers, fallback to normalized subject matching
- Attachments extracted, uploaded to Supabase Storage at attachments/{mailbox_id}/{message_id}/{filename}
- Error handling: set sync_status='error', last_error on connection failure
- SMTP send via sync service nodemailer with email-safe send pipeline; immediately inserts sent message to DB
- Spam Layer 1: parse X-Spam-Score/X-Spam-Status headers; mail already in Junk folder → spam_status='confirmed_spam'
- Spam Layer 2: AI second-pass via Anthropic API for inbox messages with borderline spam signals; insert spam_flags row with source='ai_second_pass', confidence, reason; NEVER auto-move
- Rules engine: after inserting new message, check active rules for that mailbox and apply actions
- Scheduled send: check scheduled_messages every minute for due sends
- Push notification trigger: after inserting new message, call push-notifier to send browser push notification to user

**Email-Safe Send Pipeline:**
- Runs immediately before SMTP delivery in sync service
- CSS Inlining: Uses juice library to convert body_html CSS (classes, style blocks, rich text editor output) into inline style attributes
- Plain Text Fallback: Uses html-to-text library to generate clean plain-text version of composed HTML
- Multipart/Alternative: Sends every outbound email with both text and html parts via nodemailer
- Email-Safe Guardrails:
  + Strip unsupported CSS properties (position, flex, grid, background-image) during inlining
  + Ensure inline img tags include explicit width and height HTML attributes
  + Resolve font-family declarations to web-safe fallback stacks (Arial, Helvetica, sans-serif)
- Drafts remain in original editable form; conversion only applied to final sent copy
- Sent copy stored in messages.body_html matches transmitted version

**Reminder Scheduler:**
- Checks calendar_events every 1-2 minutes for due reminders (reminder_minutes_before not null, reminder_sent_at null, start_at within reminder window)
- Delivers in-app notification/toast via Supabase Realtime
- Updates reminder_sent_at timestamp after delivery

**.ics Invite Generation:**
- When creating event with external attendees (non-staff emails), generate .ics file using ics npm library
- Include organizer, attendees, title, agenda, location, start/end, RRULE if recurring
- Attach .ics file to email via existing SMTP/queue pipeline
- One-way only (no incoming .ics parsing)

### 3.11 Edge Functions

**store-mailbox-credentials:**
- Saves password to Supabase Vault
- Writes credential_vault_ref to mailboxes table

**invite-staff-user:**
- Creates Supabase auth user via admin API
- Creates staff_users row
- Sends invite email

**send-email:**
- Queues outbound message for sync service to process via email-safe send pipeline
- Alternative: If sync service handles SMTP directly, this function may be deprecated

**summarize-thread:**
- Anthropic API call for thread summarization (threads with 3+ messages only)
- Stores in ai_cache table
- Returns concise neutral summary (key points, action items, status)

**smart-search:**
- Anthropic API call to parse natural-language query into structured filters

**cpanel-autoresponder:**
- Calls cPanel UAPI to set/clear autoresponder

**track-read-receipt:**
- Marks read_receipt_confirmed_at on message
- Optional tracking pixel endpoint

**send-push-notification:**
- Sends browser push notification to user via Push API
- Payload includes sender name, subject, snippet preview

**bulk-update-placeholders:**
- Accepts placeholder name, new value, and list of user IDs
- Updates signatures.body_html for all selected users by replacing placeholder with new value
- Returns success/failure status for each user

### 3.12 Responsiveness

- Fully responsive design
- Mobile: single-pane navigation pattern (folder list → thread list → reading pane with back nav)
- Compose window: on tablet/mobile viewports, falls back to full-width single-pane layout
- PWA-friendly
- Landing page fully responsive with mobile-optimized layout

### 3.13 Keyboard Shortcuts

- c: compose
- r: reply
- a: reply-all
- f: forward
- e: archive
- #: delete
- j/k: navigate thread list

## 4. Business Rules and Logic

### 4.1 Multi-Tenant Architecture

- Database schema supports multiple organizations from day 1
- Phase 1 has one org (Frimps Oil Company)
- All tables with RLS (Row Level Security)
- organizations table stores branding_config (jsonb: primary_color, accent_color, surface_color, logo_url, theme_mode)

### 4.2 Database Schema

**organizations:**
- id, name, domain, branding_config (jsonb), created_at

**staff_users:**
- id (refs auth.users), organization_id, full_name, role ('admin'|'staff'), created_at

**mailboxes:**
- id, organization_id, staff_user_id (nullable), email_address, display_name, imap_host, imap_port(993), smtp_host, smtp_port(587), credential_vault_ref, sync_status('pending'|'syncing'|'active'|'error'), last_synced_at, last_error, created_at

**mailbox_folders:**
- id, mailbox_id, imap_folder_name, normalized_type('inbox'|'sent'|'drafts'|'trash'|'spam'|'archive'|'custom'), display_name

**threads:**
- id, mailbox_id, subject, participants(text[]), last_message_at, is_read, is_starred, labels(text[]), folder_id, snoozed_until(timestamptz)

**messages:**
- id, thread_id, mailbox_id, imap_uid(bigint), imap_uidvalidity(bigint), from_address, from_name, to_addresses(text[]), cc_addresses(text[]), bcc_addresses(text[]), body_html, body_text, sent_at, is_read, is_flagged, spam_score(numeric), spam_status('clean'|'flagged'|'confirmed_spam'), raw_headers(jsonb), read_receipt_confirmed_at(timestamptz)
- unique(mailbox_id, imap_uid, imap_uidvalidity)

**attachments:**
- id, message_id, storage_path, filename, mime_type, size_bytes

**ai_cache:**
- id, thread_id, type('summary'|'draft_suggestion'), content, generated_at

**spam_flags:**
- id, message_id, source('spamassassin'|'ai_second_pass'), confidence, reason, user_action('pending'|'confirmed'|'dismissed')

**signatures:**
- id, mailbox_id, body_html, is_default

**contacts:**
- id, organization_id, name, email, company, phone, notes, created_by

**rules:**
- id, mailbox_id, condition_json, action_json, is_active

**calendar_events:**
- id, organization_id, created_by, title, agenda, start_at, end_at, location, attendees(text[]), department(text: HR|Finance|Operations|General, default General), status(text: confirmed|tentative|cancelled), is_task(boolean, default false), is_completed(boolean, default false), recurrence_rule(text, RRULE string), recurrence_end_date(date), parent_event_id(nullable, refs calendar_events.id), reminder_minutes_before(integer, nullable), reminder_sent_at(timestamptz, nullable)

**calendar_event_attachments:**
- id, event_id, storage_path, filename, mime_type, size_bytes

**resources:**
- id, organization_id, name, type(text: room|vehicle|equipment|other), description, is_active(boolean, default true)

**resource_bookings:**
- id, resource_id, calendar_event_id, start_at, end_at

**scheduled_messages:**
- id, mailbox_id, to_addresses(text[]), cc_addresses(text[]), subject, body_html, attachments_json, send_at, sent_at(nullable), status

**feature_interest:**
- id, staff_user_id, feature, created_at

**notification_preferences:**
- id, staff_user_id, push_enabled(boolean), sound_enabled(boolean), badge_enabled(boolean), created_at, updated_at

### 4.3 Branding System

- CSS variables: --cosmos-bg, --cosmos-primary, --cosmos-accent, --cosmos-surface, --cosmos-text
- ThemeProvider reads from logged-in user's org branding_config OR pre-auth domain detection
- Frimps Oil branding_config: {\"primary_color\": \"#E31E24\", \"accent_color\": \"#F7941D\", \"surface_color\": \"#FFFFFF\", \"theme_mode\": \"light\", \"logo_url\": \"<storage path>\"} seeded in organizations table
- Default Cosmos Mail theme: deep indigo #1B1F3B background, violet/indigo accents, dark mode
- All brand colors applied via CSS variables only — never hardcoded hex in components
- Landing page uses Frimps Oil branding for Phase 1

### 4.4 AI Features

**Thread Summarization:**
- \"Summarize\" button in reading pane (threads with 3+ messages only)
- Edge Function → Anthropic API → concise neutral summary (key points, action items, status)
- Cache in ai_cache; serve cached unless new messages since generated_at or user clicks \"Regenerate\"
- Display in collapsible card at top of reading pane, accent border, \"AI Summary\" label

**Smart Search:**
- Detect natural-language queries (heuristic: contains \"from\", \"last\", \"about\", date phrases)
- Edge Function → Anthropic API → extract structured filters (sender, date range, keywords, folder) → Postgres query
- Show parsed filter chips above results; fallback to plain search on AI failure
- Never show blank results

### 4.5 Spam Detection

**Layer 1:**
- Parse X-Spam-Score/X-Spam-Status headers from mail server
- Mail already in Junk folder → spam_status='confirmed_spam'

**Layer 2:**
- AI second-pass via Anthropic API for inbox messages with borderline spam signals
- Insert spam_flags row with source='ai_second_pass', confidence, reason
- NEVER auto-move to spam folder
- Display non-intrusive banner with \"Move to Spam\" or \"Not Spam\" actions

### 4.6 Rules Engine

- After inserting new message, check active rules for that mailbox
- Apply actions based on condition_json (from/subject contains) and action_json (label/move/mark-read)

### 4.7 Scheduled Send

- Check scheduled_messages table every minute for due sends
- Send via email-safe send pipeline when send_at time passes
- Update sent_at and status fields

### 4.8 Read Receipts

- Optional tracking pixel via Edge Function endpoint
- Best-effort, clearly labeled in UI
- Marks read_receipt_confirmed_at on message when pixel loaded

### 4.9 Out-of-Office

- Calls cPanel UAPI Email::add_autoresponder via Edge Function
- Toggle on/off, set subject, body, optional start/end dates

### 4.10 Push Notifications

**Permission Handling:**
- Request browser notification permission on first login or in settings
- Store user preference in notification_preferences table

**Notification Triggers:**
- Sync service triggers push notification when new message inserted
- Edge Function sends push notification via Push API

**Notification Content:**
- Sender name, subject, snippet preview
- Click opens thread in /inbox reading pane

**Settings:**
- User can enable/disable push notifications, sound, badge indicator in /inbox/settings

**Service Worker:**
- Register service worker for push notification handling
- Service worker listens for push events and displays notifications
- Service worker handles notification click events to open thread

### 4.11 Landing Page Routing

**Public Route (/):**
- Default route for unauthenticated users
- Displays marketing landing page with integrated sign-in panel
- On successful login, redirect to /inbox

**Authenticated User Behavior:**
- Authenticated users accessing / are redirected to /inbox

**Existing /login Route:**
- Can redirect to / or remain functional as fallback

### 4.12 Compose Window Rich Text

**Rich Text Output:**
- Tiptap editor output stored as body_html in messages table
- Inline images stored via Supabase Storage, referenced in body_html with storage URLs

**Reply/Forward Compatibility:**
- Existing quoting logic preserved when replying/forwarding
- Quoted content renders correctly inside Tiptap editor
- Original message formatting maintained in quoted sections

**External Client Compatibility:**
- Rich text emails render correctly in Gmail, Outlook, Apple Mail via email-safe send pipeline
- HTML email output follows standard email HTML conventions
- Graceful degradation for clients with limited HTML support

### 4.13 Multi-Folder Sync Logic

**Folder Sync Coverage:**
- High-priority folders (Inbox, Sent, Drafts, Archive): dedicated IDLE connection each
- Lower-priority folders (Trash, Spam): polling every 60-120s
- All folders synced automatically for all current and future mailboxes

**Folder Metadata:**
- Each message stored with folder_id referencing mailbox_folders table
- Sent messages appear under Sent folder in UI
- Drafts appear under Drafts folder
- Junk messages appear under Spam folder
- Trash messages appear under Trash folder

**Polling Strategy:**
- Same robust polling mechanism used for INBOX applied to all folders
- Handles UIDVALIDITY resets per folder
- Deduplication via unique constraint per folder

**SMTP-Sent Message Handling:**
- SMTP-sent messages immediately inserted to DB with folder_id for Sent folder
- When same message later appears in IMAP Sent folder, deduplication constraint prevents duplicate insert

### 4.14 Email-Safe Send Pipeline

**Pipeline Location:**
- Runs in sync service (Node.js environment) immediately before SMTP delivery
- If current implementation uses Supabase Edge Function with Deno, move SMTP send to sync service for library compatibility

**CSS Inlining:**
- Uses juice library to convert body_html CSS into inline style attributes
- Conversion happens at send time only, not at compose or draft-save time
- Drafts remain in original editable form with classes and style blocks

**Plain Text Generation:**
- Uses html-to-text library to auto-generate plain-text version from body_html
- No manual plain-text editing required from user

**Multipart/Alternative:**
- Every outbound email sent with both text and html parts via nodemailer
- Nodemailer natively supports this via text and html fields on message object

**Email-Safe Guardrails:**
- Strip unsupported CSS properties during inlining: position, flex, grid, background-image
- Ensure inline img tags include explicit width and height HTML attributes (not just CSS sizing)
- Resolve font-family declarations to web-safe fallback stacks (Arial, Helvetica, sans-serif)
- Configure juice options to filter unsupported properties

**Sent Message Storage:**
- Sent copy stored in messages.body_html matches CSS-inlined version transmitted via SMTP
- Ensures reading pane displays same formatting as recipient sees

**Testing Requirement:**
- Send real test email containing bold text, bulleted list, color change, inline image, hyperlink
- Manually verify correct rendering in both Gmail and Outlook (desktop or web)

### 4.15 Rich Text Signature Editor

**Shared Component Architecture:**
- Signature editor reuses the same Tiptap-based rich text editor component from Compose
- Toolbar component is shared between Compose and Signatures Management, not duplicated
- Ensures consistent editing experience and prevents drift between implementations

**Image Handling:**
- Images inserted via same upload mechanism as Compose (Supabase Storage)
- After insertion, image displays resize handles (corner-drag) for direct in-editor resizing
- Maximum width cap enforced (e.g., 300px) to prevent oversized signature images
- Resized dimensions saved as explicit width and height HTML attributes on <img> tag
- Prevents accidental inclusion of full-size images in signatures

**Live Preview:**
- Preview panel displays signature as it will render after CSS-inlining pipeline is applied
- Preview updates in real-time as user edits
- Ensures WYSIWYG experience matching final sent output
- Uses same juice library logic as email-safe send pipeline

**Data Storage:**
- Signature content stored as body_html in signatures table (HTML format)
- Inline images stored via Supabase Storage, referenced in body_html
- Signature auto-appended to outgoing emails as before (existing logic unchanged)

**Scope Boundaries:**
- Changes only affect signature management screen in Settings
- No modifications to Compose itself, inbox rendering, calendar, sync logic, AI features, or other areas
- Existing signature auto-append behavior preserved

### 4.16 Signature Placeholder Bulk Update

**Placeholder Definition:**
- Placeholders are text tokens in signature body_html (e.g., [Job Title], [Department], [Phone])
- Used to dynamically populate user-specific information in signatures

**Bulk Update Process:**
- HR admin selects placeholder from dropdown
- System displays all users with signatures containing that placeholder
- HR admin selects target users via checkboxes
- HR admin enters new value for placeholder
- System shows before/after preview for selected users
- On submit, Edge Function bulk-update-placeholders replaces placeholder with new value in signatures.body_html for all selected users

**Update Logic:**
- Simple string replacement: find placeholder token, replace with new value
- Preserves all other signature formatting and content
- Updates only selected users, leaves others unchanged

**Error Handling:**
- If update fails for any user, log error and continue with remaining users
- Return success/failure status for each user to display in UI

## 5. Exception and Boundary Cases

| Scenario | Handling |
|----------|----------|
| IMAP connection failure | Set sync_status='error', last_error; retry with exponential backoff |
| UIDVALIDITY reset | Re-sync entire mailbox, update imap_uidvalidity for all messages |
| Duplicate message (same UID) | Skip insert due to unique constraint |
| Attachment upload failure | Retry upload; show error toast if persistent failure |
| SMTP send failure | Show error toast with reason; do not insert sent message |
| AI API failure (summarization) | Show error message; allow retry |
| AI API failure (smart search) | Fallback to plain Postgres full-text search |
| Spam flag user action | Update spam_flags.user_action; if 'confirmed', move to spam folder |
| Snooze time passes | Thread reappears at top of inbox |
| Rule condition match failure | Skip rule, log error |
| Scheduled send time passes | Send immediately via email-safe pipeline; if send fails, mark status as failed |
| User deletes mailbox | Cascade delete all associated threads, messages, attachments |
| Non-admin accesses /admin routes | Redirect to /inbox |
| Optimistic UI rollback | Show error toast, revert UI state |
| Notification permission denied | Disable push notifications, show message in settings |
| Service worker registration failure | Log error, disable push notifications |
| Push notification send failure | Log error, do not block sync process |
| Landing page accessed by authenticated user | Redirect to /inbox |
| /login accessed by authenticated user | Redirect to /inbox |
| Compose window minimize | Collapse to title bar, preserve draft state |
| Compose window full-screen toggle | Expand to fill viewport, toggle back to docked position |
| Rich text formatting in plain-text-only client | Graceful degradation to plain text via multipart/alternative |
| Inline image insert failure | Show error toast, allow retry |
| Non-INBOX folder sync failure | Log error, continue syncing other folders |
| Sent folder polling detects new message | Insert message with folder_id for Sent folder |
| Drafts folder polling detects changes | Update existing draft or insert new draft |
| CSS inlining library failure | Log error, send original HTML without inlining; show warning toast |
| Plain text generation failure | Log error, send HTML-only email; show warning toast |
| juice library incompatible with Deno | Move SMTP send to Node.js sync service |
| html-to-text library incompatible with Deno | Move SMTP send to Node.js sync service |
| Email-safe pipeline strips critical formatting | Log warning, send processed version; user can view sent copy in reading pane |
| Multiple IMAP connections per mailbox | Maintain separate connection pool per folder; handle connection limits gracefully |
| SMTP-sent message appears in IMAP Sent folder | Deduplication constraint prevents duplicate insert |
| Resource booking conflict | Display warning in event form; allow override or cancel |
| Recurring event edit prompt | Show modal: \"Edit this occurrence\" or \"Edit entire series\" |
| Reminder delivery failure | Log error, mark reminder_sent_at to prevent retry loop |
| .ics generation failure | Log error, send email without .ics attachment; show warning toast |
| External attendee email send failure | Show error toast; event still created in calendar |
| Task completion toggle failure | Show error toast, revert UI state |
| Department filter toggle | Client-side filtering, no server request |
| Calendar event attachment upload failure | Retry upload; show error toast if persistent failure |
| Free/busy view data load failure | Show error message, allow retry |
| Resource availability view data load failure | Show error message, allow retry |
| Signature image resize exceeds max width | Enforce cap at 300px, prevent further expansion |
| Signature image upload failure | Show error toast, allow retry |
| Signature preview rendering failure | Show error message, allow retry |
| Signature save with oversized image | Validate dimensions before save, show warning if exceeds cap |
| Signature editor component load failure | Show error message, fallback to plain text editor |
| CSS inlining in signature preview failure | Show error message, display raw HTML as fallback |
| Bulk placeholder update with no users selected | Show validation error, prevent submit |
| Bulk placeholder update fails for some users | Log errors, show partial success message with failed user list |
| Placeholder not found in selected user signatures | Skip user, log warning, continue with remaining users |
| Edge Function bulk-update-placeholders timeout | Show error toast, allow retry |
| Non-admin accesses /admin/signature-placeholders | Redirect to /inbox |

## 6. Acceptance Criteria

1. Public visitor accesses /, views marketing landing page with hero, features, testimonials, FAQ, and integrated sign-in panel
2. Public visitor enters credentials in sign-in panel, clicks Sign In, and is redirected to /inbox on successful authentication
3. Admin logs in, navigates to /admin/mailboxes, adds a new mailbox with IMAP/SMTP credentials, and sees sync_status change from 'pending' to 'syncing' to 'active'
4. Admin invites a staff user, staff user receives invite email, logs in, and accesses their mailbox
5. Staff user views inbox, sees thread list with unread count badge, clicks a thread, and reads full message in reading pane
6. Staff user clicks Compose, sees enlarged compose window (approximately 1300px x 700px) docked bottom-right with minimize and full-screen toggle controls
7. Staff user uses rich text toolbar to format message (bold, italic, font size, text color, lists, insert link, insert emoji), attaches a file, clicks Send, and sees message appear in Sent folder with formatting preserved
8. Staff user inserts inline image into compose body, sends message, and verifies image renders correctly in reading pane and external mail client
9. Staff user clicks Reply on a message, sees quoted content render correctly inside rich text editor, adds formatted reply text, sends, and sees reply added to thread
10. Staff user clicks \"Summarize\" on a thread with 3+ messages, sees AI-generated summary in collapsible card
11. Staff user enters natural-language query in search (e.g., \"emails from John last week\"), sees parsed filter chips and relevant results
12. Staff user sees spam banner on inbox message with pending spam_flag, clicks \"Move to Spam\", and message moves to Spam folder
13. Staff user navigates to /inbox/settings, enables push notifications, grants browser permission, and receives native desktop notification when new email arrives in any folder (INBOX, Sent, Drafts, Junk, Trash)
14. Staff user clicks push notification, browser opens corresponding thread in /inbox reading pane
15. Staff user views Sent folder, sees messages synced from IMAP Sent folder with correct folder metadata via dedicated IDLE connection
16. Staff user views Drafts folder, sees draft messages synced from IMAP Drafts folder via dedicated IDLE connection
17. Staff user views Spam folder, sees messages synced from IMAP Junk folder via polling
18. Staff user views Trash folder, sees deleted messages synced from IMAP Trash folder via polling
19. Staff user composes email with bold text, bulleted list, color change, inline image, and hyperlink, sends via email-safe send pipeline, and verifies correct rendering in both Gmail and Outlook
20. Staff user receives reply to sent email in external client (Gmail/Outlook), verifies rich formatting displays correctly with inline styles and plain text fallback
21. Admin navigates to /admin/resources, adds a new resource (room), and sees it appear in resource list
22. Staff user creates calendar event, selects department (HR), attaches file, books resource (room), sets recurrence (weekly), sets reminder (30 minutes), adds external attendee, and submits
23. Staff user views calendar month view, sees event color-coded by department (HR), clicks event, sees attached file in detail view
24. Staff user toggles department filter to hide HR events, sees event disappear from calendar view
25. Staff user creates task (is_task=true), sees checkbox-style item in calendar view, toggles is_completed, sees task gray out/strike through
26. Staff user views free/busy view, sees all staff as horizontal rows with colored Busy blocks for confirmed events and diagonal stripes for tentative events
27. Staff user views resource availability view, sees booked time slots for room resource
28. Staff user edits recurring event, sees prompt \"Edit this occurrence\" or \"Edit entire series\", selects \"this occurrence\", sees new event created with parent_event_id
29. Staff user receives in-app notification/toast 30 minutes before event start time
30. External attendee receives email with .ics attachment, opens in calendar app, sees event details including recurrence rule
31. Staff user navigates to /inbox/settings, clicks Signatures Management, sees existing signatures list
32. Staff user clicks Add Signature, sees rich text editor with same toolbar as Compose (bold, italic, font family, font size, text color, alignment, lists, link, emoji, image insert)
33. Staff user inserts image into signature, sees resize handles appear, drags corner to resize image down to 150px width
34. Staff user attempts to resize image beyond 300px width, sees resize capped at maximum width
35. Staff user views live preview panel below editor, sees signature rendered with CSS-inlined styles matching final sent output
36. Staff user saves signature, verifies image dimensions saved as explicit width and height HTML attributes in signatures.body_html
37. Staff user composes new email, sees saved signature auto-appended with resized image rendering correctly
38. Staff user sends email with signature, verifies signature image renders correctly in Gmail and Outlook with explicit dimensions
39. Admin navigates to /admin/signature-placeholders, sees placeholder list with [Job Title], [Department], [Phone] and user count for each
40. Admin clicks Bulk Update on [Job Title], sees multi-select user list with current placeholder values
41. Admin selects 5 users, enters new value \"Senior Engineer\", sees before/after preview for selected users
42. Admin clicks Submit, sees success message, verifies placeholder updated in all 5 users' signatures
43. Admin attempts bulk update with no users selected, sees validation error preventing submit
44. Admin performs bulk update where 2 users fail, sees partial success message with failed user list

## 7. Out of Scope for This Phase

- Multi-provider support (Google/Outlook/generic IMAP beyond cPanel/Dovecot)
- Real-time collaborative drafting
- Native mobile apps (iOS/Android)
- Actual video call integration (placeholder only)
- Multi-org admin console for white-label resale
- Advanced email analytics and reporting
- Email templates library
- Bulk email sending
- Email encryption (PGP/S/MIME)
- Custom domain setup for white-label
- Billing and subscription management
- Advanced spam training/machine learning
- Email archiving and compliance features
- Integration with third-party CRM/project management tools
- Push notification customization beyond sound/badge toggles
- Landing page A/B testing or analytics integration
- Multi-language support for landing page
- Pop-out compose window to separate browser window
- Compose window drag-and-drop repositioning
- Multiple simultaneous compose windows
- Advanced rich text features (tables, code blocks, custom fonts beyond dropdown)
- Real-time sync for custom/user-created IMAP folders beyond standard folders
- Custom CSS inlining rules beyond email-safe guardrails
- Manual plain-text editing in compose UI
- Email preview testing across multiple clients before send
- A/B testing for email formatting variations
- Incoming .ics parsing and calendar sync
- Two-way calendar sync with external providers
- SMS/push reminders (only in-app notifications)
- Advanced resource conflict resolution algorithms
- Resource capacity management (multiple simultaneous bookings)
- Calendar event approval workflows
- Time zone handling for recurring events
- Calendar event templates
- Drag-and-drop event rescheduling in calendar view
- Calendar printing/export to PDF
- Integration with external calendar services (Google Calendar, Outlook Calendar)
- Advanced recurrence patterns beyond rrule.js standard support
- Calendar event comments/discussion threads
- Calendar event version history
- Automatic meeting room suggestions based on availability
- Calendar analytics and reporting
- Multiple signatures per mailbox management UI enhancements
- Signature templates library
- Signature scheduling (different signatures for different times/contexts)
- Signature A/B testing
- Advanced image editing in signature editor (crop, rotate, filters)
- Signature version history
- Signature approval workflows
- Signature analytics (tracking which signatures perform best)
- Dynamic signature fields (auto-populate from user profile)
- Conditional signature logic (different signatures for internal vs external recipients)
- Advanced placeholder management (nested placeholders, conditional placeholders)
- Placeholder usage analytics
- Placeholder validation rules
- Placeholder templates library
- Role-based placeholder access control beyond admin-only