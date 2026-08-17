# Cosmos Mail — Prompt 01: Foundation (Schema, Auth, Multi-Mailbox Admin)

**Paste this entire prompt into medo.dev as the first build session for Cosmos Mail.**

---

## Context

Build the foundation layer for **Cosmos Mail**, a premium webmail client for cPanel-hosted mail domains. This is a new, standalone project — separate Supabase project, separate codebase from any other product. Phase 1 customer is a single organization (Frimps Oil, domain frimpsoil.com.gh) with multiple staff mailboxes, but the schema must be multi-tenant-ready from the start so additional organizations can be added later without restructuring.

Stack: React + Vite + TypeScript + Tailwind CSS + shadcn/ui, Supabase (Postgres + Auth + Storage + Vault), deployed to Vercel.

This prompt covers **only** foundation: database schema, authentication, and the admin flow for adding/managing mailboxes. Do not build the mail sync service or inbox UI yet — those come in later prompts.

## 1. Supabase Schema

Create the following tables with Row Level Security enabled on all of them:

### `organizations`
- `id` uuid primary key default gen_random_uuid()
- `name` text not null
- `domain` text not null unique
- `branding_config` jsonb default '{}' — per-org overrides: `primary_color`, `accent_color`, `surface_color`, `logo_url`, `theme_mode`. When empty, the frontend falls back to Cosmos Mail's own default theme (indigo/violet, dark mode). For the Frimps Oil organization row specifically, seed this with `{"primary_color": "#E31E24", "accent_color": "#F7941D", "surface_color": "#FFFFFF", "theme_mode": "light", "logo_url": "<storage path after uploading brand-assets/frimps-logo.png to Supabase Storage>"}` — their red/white/orange brand, not the Cosmos Mail default.
- `created_at` timestamptz default now()

### `staff_users`
- `id` uuid primary key references auth.users(id)
- `organization_id` uuid references organizations(id) not null
- `full_name` text
- `role` text not null default 'staff' — enum-like: 'admin' | 'staff'
- `created_at` timestamptz default now()

### `mailboxes`
- `id` uuid primary key default gen_random_uuid()
- `organization_id` uuid references organizations(id) not null
- `staff_user_id` uuid references staff_users(id) — nullable initially, assigned when a staff member is linked to this mailbox
- `email_address` text not null
- `display_name` text
- `imap_host` text not null
- `imap_port` int not null default 993
- `smtp_host` text not null
- `smtp_port` int not null default 587
- `credential_vault_ref` text — reference to the encrypted secret in Supabase Vault, never store raw password in this table
- `sync_status` text default 'pending' — 'pending' | 'syncing' | 'active' | 'error'
- `last_synced_at` timestamptz
- `last_error` text
- `created_at` timestamptz default now()

### `mailbox_folders`
- `id` uuid primary key default gen_random_uuid()
- `mailbox_id` uuid references mailboxes(id) not null
- `imap_folder_name` text not null — raw name as reported by IMAP LIST
- `normalized_type` text — 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive' | 'custom'
- `display_name` text

Leave `threads`, `messages`, `attachments`, `ai_cache`, `spam_flags` tables to be created in Prompt 02, since they depend on sync service design decisions. For now, create empty placeholder migrations noting they arrive in the next session — do not guess their structure yet.

## 2. Row Level Security

- `staff_users` can only read/update their own row, and read other staff_users in their same `organization_id` (for a future team directory).
- `mailboxes`: staff_users can only see mailboxes where `staff_user_id = auth.uid()` OR where their `role = 'admin'` and `organization_id` matches.
- Only `role = 'admin'` can INSERT/UPDATE/DELETE on `mailboxes` and `mailbox_folders`.
- `organizations`: readable only by staff_users belonging to that org; no direct writes from the client (admin operations go through an Edge Function, not direct table writes, since org creation is a rare/manual operation).

## 3. Authentication

- Use Supabase Auth, email + password (magic link optional toggle, not required for MVP).
- On first login, a `staff_users` row must exist already (provisioned by an admin) — do not allow open self-signup. This is an internal company tool, not a public product yet.
- Build a simple, clean login screen using a **theme-able branding system**: default to the Cosmos Mail identity (deep indigo/navy background `#1B1F3B`, dark mode) unless the request's domain or a query param resolves to an organization with a `branding_config` override — in which case fetch that org's `branding_config` (public, unauthenticated-readable query scoped to just `domain`, `primary_color`, `accent_color`, `surface_color`, `logo_url`, `theme_mode` — never expose other org data pre-auth) and apply it instead.
  - For Frimps Oil specifically: light theme, white/light-neutral full-viewport background (not dark indigo), with the Frimps logo (`brand-assets/frimps-logo.png`, uploaded to Supabase Storage and referenced via `logo_url`) displayed at the top of the login card, centered, sized to roughly 180–220px wide. Primary button uses Frimps red (`#E31E24`), with orange (`#F7941D`) reserved for focus rings, links, and small accents — not large fill areas.
  - Layout otherwise follows the PrivateEmail reference regardless of theme: centered white/off-white card (rounded corners, generous padding, subtle shadow) on the full-viewport background, logo top-left of the viewport or centered in the card (Frimps' case: centered in the card, above the heading, given the logo is the primary brand mark for this org), large heading ("Login to your account"), labeled Email and Password fields stacked with clear spacing, show/hide password toggle in the password field, full-width rounded-pill primary button in the org's primary color, and an understated footer link row (forgot password / help) below.
  - Implement this as a theme provider reading CSS variables (`--cosmos-bg`, `--cosmos-primary`, `--cosmos-accent`, `--cosmos-surface`, `--cosmos-text`) set at runtime from the resolved `branding_config`, so the same login component serves both the default Cosmos Mail theme and Frimps Oil's red/white/orange theme without component-level branching.
- Use CSS variables for all brand colors (`--cosmos-bg`, `--cosmos-primary`, `--cosmos-accent`, `--cosmos-surface`, `--cosmos-text`) defined once in a root stylesheet and overridden at runtime per-organization from `branding_config`, so branding can be swapped later — including for future clients beyond Frimps Oil — without touching component code.
- After login, redirect to a placeholder `/inbox` route that just shows "Inbox coming in the next build phase" — this confirms auth works end-to-end without building the real inbox yet.

## 4. Admin: Mailbox Management UI

Build an `/admin/mailboxes` route, visible only to `role = 'admin'` users (redirect others to `/inbox`).

Features:
- **List view**: table of all mailboxes in the admin's organization — email address, display name, sync status (colored badge: pending/syncing/active/error), last synced timestamp, linked staff user (or "Unassigned").
- **Add Mailbox form**: fields for email address, display name, IMAP host, IMAP port (default 993), SMTP host, SMTP port (default 587), mailbox password, and optionally link to an existing staff_user or leave unassigned for now.
  - On submit: call a Supabase Edge Function (not a direct client insert) that stores the password in Supabase Vault and writes only the `credential_vault_ref` into the `mailboxes` table. The raw password must never touch the `mailboxes` table or be logged.
  - Set `sync_status = 'pending'` on creation — actual sync connection testing happens in Prompt 02's sync service, not here. For now just confirm the row was created and show a "Pending — sync service will pick this up" message.
- **Edit/Delete**: allow editing connection details and deleting a mailbox (with a confirmation dialog, since deleting removes access but should NOT delete already-synced mail — note this constraint in a comment for Prompt 02 to respect).
- **Invite staff user**: simple form to create a `staff_users` row (email, full name, role) — this creates the Supabase Auth user via Edge Function (admin API) and sends them an invite/reset-password email through Supabase Auth's built-in flow.

## 5. UI/UX Requirements

- Use shadcn/ui components (Table, Dialog, Form, Badge, Button) throughout — do not hand-roll basic components that shadcn already provides.
- Keep the admin section visually distinct from what will become the main inbox UI (Prompt 03) — admin can be more utilitarian/dashboard-styled, inbox will be the polished consumer-facing surface.
- Fully responsive down to tablet width at minimum; mobile-responsive admin is nice-to-have, not required for Phase 1.
- Add loading states and error toasts (shadcn `toast` / `sonner`) for all async actions — never leave a submit button in a stuck state with no feedback.

## 6. What NOT to build in this session

- No IMAP/SMTP connection logic yet (Prompt 02)
- No actual inbox/message UI yet (Prompt 03)
- No AI features yet (Prompt 04)
- Do not modify any existing files outside this new Cosmos Mail project — this is a fresh build, not an addition to Sika ERP or any other existing codebase.

## 7. Deliverable Checklist

- [ ] Supabase schema created with RLS policies as specified
- [ ] Vault-based credential storage working via Edge Function, verified no raw passwords land in Postgres tables
- [ ] Login/auth flow working end-to-end
- [ ] Admin can add a mailbox, see it listed with `pending` status
- [ ] Admin can invite a staff user
- [ ] Placeholder `/inbox` route confirms auth + routing works
- [ ] All brand colors defined as CSS variables, not hardcoded hex values in components
