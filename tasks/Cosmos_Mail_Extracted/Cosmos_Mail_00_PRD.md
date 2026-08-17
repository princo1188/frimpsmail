# Cosmos Mail — Product Requirements Document

**Version:** 1.0
**Owner:** Prince
**First deployment target:** frimpsoil.com.gh (cPanel-hosted mailboxes, multiple staff accounts)
**Long-term goal:** White-label, multi-tenant webmail product sellable to any client with cPanel/IMAP-SMTP hosting

---

## 1. Product Summary

Cosmos Mail is a modern webmail client that connects to standard IMAP/SMTP mail servers (starting with cPanel) and layers a premium UI/UX and AI features on top — positioned as a Roundcube replacement with Google Workspace / Outlook-level polish, at a fraction of the cost and without moving the client's actual mail hosting.

Cosmos Mail does **not** replace the mail server. It is a client + sync layer + intelligence layer sitting on top of mail infrastructure the customer already owns.

## 2. Problem Statement

Clients who buy shared/reseller hosting (like frimpsoil.com.gh) get cPanel email with Roundcube/Horde as the only webmail option — dated UI, no AI features, no meaningful spam UX beyond raw SpamAssassin headers, no unified multi-account experience. They either tolerate it or pay for Google Workspace/Microsoft 365, which means migrating MX records and paying recurring per-seat fees for capability they may only partly need.

Cosmos Mail gives them a premium mail experience while keeping their existing hosting and domain mail setup untouched.

## 3. Target Users (Phase 1)

- **Frimps Oil Company staff** — multiple named mailboxes on frimpsoil.com.gh, mixed technical literacy, need a fast, reliable, professional-feeling inbox
- **Admin (Prince or a designated Frimps Oil admin)** — provisions/removes staff mailboxes, monitors sync health

## 4. Goals

1. Fully replace Roundcube for daily use at Frimps Oil within Phase 1
2. Support multiple staff mailboxes with individual logins
3. Ship spam handling that's trustworthy enough staff don't need to double-check Roundcube
4. Ship at least 2 AI features that provide real daily value (summarization, smart search)
5. Architect multi-tenant from the schema level up, even though Phase 1 has one org, so productizing later is a config change, not a rebuild

## 5. Non-Goals (Phase 1)

- Multi-provider support (Google Workspace, Outlook, generic IMAP beyond cPanel) — cPanel/IMAP-SMTP only for now
- Native mobile apps — PWA-friendly responsive web only
- Real-time collaborative drafting
- Live video calling — placeholder "Coming Soon" UI only, no backend

## 6. Phasing Overview

| Phase | Focus | Includes |
|---|---|---|
| **Phase 1 (MVP)** | Core mail + multi-user + spam + 2 AI features | Auth, mailbox sync, 3-pane UI, compose/reply/forward, attachments, signatures, unified search, snooze, spam folder + AI-assisted spam flagging, thread summarization, smart search |
| **Phase 2** | Premium parity features | Shared/company contacts, rules & filters, out-of-office (via cPanel autoresponder), lightweight calendar, AI draft-reply suggestions, "Coming Soon: Video Calls" placeholder |
| **Phase 3** | Stretch / productization | Multi-provider support, real-time collaboration, native apps, video call integration (if validated), multi-org admin console for reselling Cosmos Mail to other clients |

## 7. Architecture

```
cPanel Mail Server (Dovecot/Exim + SpamAssassin)
        ↕ IMAP (993) / SMTP (587 or 465)
Sync Service — persistent Node process (Railway / Fly.io / VPS)
   - ImapFlow: per-mailbox connection pool, IDLE for near-real-time sync,
     full backfill on first connect, incremental sync after
   - nodemailer: outbound send per mailbox
   - Spam header parsing (X-Spam-Score / X-Spam-Status) + AI second-pass
   - Writes normalized data into Supabase
        ↕
Supabase (dedicated project, isolated from Sika ERP)
   - Postgres: organizations, mailboxes, threads, messages, attachments,
     ai_cache, spam_flags, rules, contacts
   - Storage: attachment blobs
   - Auth: staff logins
   - Vault: encrypted IMAP/SMTP credentials
        ↕
Frontend — React + Vite + Tailwind + shadcn/ui, deployed on Vercel
   - 3-pane webmail UI, custom Cosmos Mail branding
   - Reads live from Supabase (Postgres + Realtime subscriptions)
   - Calls Edge Functions for AI features (summarization, smart search, draft assist)
```

**Why a persistent sync service instead of serverless:** IMAP connections (especially IDLE, used for near-real-time new-mail push) are long-lived and stateful. Vercel/Supabase Edge Functions time out and aren't designed for this. The sync service is the one piece of infrastructure that needs to live somewhere with a persistent process — everything else (frontend, AI calls, auth) can stay serverless/Supabase-native.

## 8. Data Model (core tables)

- `organizations` — id, name, domain, branding config (logo, colors — future multi-tenant hook)
- `mailboxes` — id, organization_id, staff_user_id, email_address, imap_host, imap_port, smtp_host, smtp_port, encrypted_credentials (Vault ref), sync_status, last_synced_at
- `threads` — id, mailbox_id, subject, participants[], last_message_at, is_read, is_starred, labels[]
- `messages` — id, thread_id, mailbox_id, imap_uid, from_address, to_addresses[], cc[], bcc[], body_html, body_text, sent_at, flags, spam_score, spam_status
- `attachments` — id, message_id, storage_path, filename, mime_type, size_bytes
- `ai_cache` — id, thread_id, type (summary/draft_suggestion), content, generated_at
- `spam_flags` — id, message_id, source (spamassassin/ai), confidence, user_action (confirmed/dismissed)
- `contacts` (Phase 2) — id, organization_id, name, email, company, notes
- `rules` (Phase 2) — id, mailbox_id, condition_json, action_json, is_active

## 9. Branding Direction

Cosmos Mail is architected as a white-label product: the default Cosmos Mail identity (indigo/violet, space theme) is the product's own brand for marketing, admin screens, and any future client that doesn't specify an override. Each organization can override this via the `organizations.branding_config` jsonb field (already in the schema) — this is what makes onboarding a second client later a config change, not a rebuild.

**Frimps Oil (first live deployment) uses their own brand, not the default Cosmos Mail theme:**

- **Primary Red:** `#E31E24` (matches the Frimps logo mark)
- **Accent Orange:** `#F7941D` (matches the droplet accent in the logo)
- **Surface/Background:** White (`#FFFFFF`) with light neutral grays for secondary surfaces — not the dark indigo Cosmos Mail default, since Frimps' identity is a bright, high-contrast red/white/orange, not a dark theme
- **Logo:** Frimps Oil wordmark + icon (provided asset: `brand-assets/frimps-logo.png`), placed top-left on the login screen and top-left in the app's top bar, replacing the Cosmos Mail wordmark for this org's users
- Text/body colors stay neutral dark gray/charcoal for readability against the white surface — red and orange are reserved for primary actions, accents, unread indicators, and the logo itself, not body text or large fill areas

`branding_config` for the Frimps Oil organization row stores: `{"primary_color": "#E31E24", "accent_color": "#F7941D", "surface_color": "#FFFFFF", "logo_url": "<storage path to frimps-logo.png>", "theme_mode": "light"}`. The frontend reads this at load (keyed off the logged-in user's `organization_id`, or off the domain for the login screen before auth) and applies it by overriding the CSS variables (`--cosmos-primary`, `--cosmos-accent`, `--cosmos-surface`) rather than hardcoding Frimps colors into components — so the same component code serves both the default Cosmos Mail theme and any org-specific override, including Frimps'.

## 10. Success Criteria (Phase 1)

- All Frimps Oil staff mailboxes fully migrated off Roundcube for daily use
- Sync latency under ~2 minutes for new mail (IDLE-based, should be much faster in practice)
- Zero false-negative spam (spam reaching inbox undetected) worse than current SpamAssassin baseline
- Thread summarization and smart search used organically without prompting (i.e., staff discover and adopt them, not just tolerate them)

## 11. Prompt Sequence for medo.dev

This PRD is implemented via 4 sequential prompts, each a separate .md file, designed to be pasted into medo.dev in order:

1. **Prompt 01 — Foundation: Schema, Auth, Multi-Mailbox Admin**
2. **Prompt 02 — Sync Service: IMAP/SMTP + Spam Detection**
3. **Prompt 03 — Frontend: Core Webmail UI**
4. **Prompt 04 — AI Layer + Phase 2/3 Premium Features**

Each prompt file is self-contained but assumes the prior prompt's output exists. Deploy and verify each phase before moving to the next, consistent with your existing Sika ERP sequential deployment approach.
