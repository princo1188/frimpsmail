# Cosmos Mail — Product Roadmap

> **Current Release: Phase 1** — Frimps Oil internal deployment  
> **Vision:** The premier open-protocol webmail client for businesses that own their mail infrastructure

---

## ✅ Phase 1 — Foundation (Complete)

### Delivered
- Multi-tenant schema: organizations, staff_users, mailboxes, folders, threads, messages, attachments
- Supabase Auth (email + password, admin-provisioned, no open signup)
- Per-org branding system (CSS variables, logo, light/dark theme)
- Admin UI: mailbox management, staff invite via Edge Function
- 3-pane webmail UI (Superhuman-style density)
- Compose with Tiptap rich-text, To/CC/BCC autocomplete, file attachments
- Reply / Reply All / Forward
- Snooze (hide thread until chosen time)
- Spam UX: non-intrusive banner, Layer 1 (header analysis) + Layer 2 (AI second-pass), never auto-move
- Signatures (per-mailbox, auto-append, WYSIWYG editor)
- Rules & Filters (condition → action, applied by sync service)
- Out-of-Office via cPanel UAPI Edge Function
- Contacts CRUD with auto-suggest on reply to new address
- Calendar (month/week view, event CRUD)
- Schedule Send (stored in DB, dispatched by sync service)
- AI Thread Summarization (Claude 3.5 Haiku, cached)
- Smart Search with natural language understanding
- Keyboard shortcuts (c/r/a/f/e/#/j/k)
- Read Receipts (optional tracking pixel, best-effort)
- Video Call placeholder ("Coming soon" + feature interest tracking)
- Realtime updates via Supabase channels (no manual refresh)
- Persistent Node/TS sync service: IMAP IDLE + 90-day backfill, Dockerfile for Railway/Fly.io/VPS
- Fully responsive (single-pane mobile, 3-pane desktop)
- PWA-ready structure

---

## 🔵 Phase 2 — Hardening & Growth (Q3 2026)

### 2.1 Reliability
- [ ] Exponential backoff + circuit breaker for IMAP reconnects
- [ ] Sync service health dashboard in admin UI (last heartbeat, messages synced, error rate)
- [ ] Attachment virus/malware scanning (ClamAV or third-party API)
- [ ] Message dedup improvements for edge cases (UIDVALIDITY resets, server-side moves)

### 2.2 Performance
- [ ] Thread list virtual scrolling (react-window) for 10k+ message mailboxes
- [ ] Lazy-load message bodies (render placeholder until in-viewport)
- [ ] Postgres indexes review + EXPLAIN ANALYZE on hot queries
- [ ] Edge CDN caching for attachment downloads

### 2.3 Additional Mail Providers
- [ ] Gmail via OAuth 2.0 (gmail.readonly + gmail.modify scopes)
- [ ] Microsoft 365 / Outlook via OAuth + Microsoft Graph API
- [ ] Generic IMAP/SMTP (any provider supporting IMAP4 IDLE)
- [ ] Provider detection wizard on mailbox add form

### 2.4 UX Polish
- [ ] Thread labels / color tags (user-defined)
- [ ] Bulk operations on thread list (label, move, mark-read, delete)
- [ ] Rich attachment preview (PDF, image, Office docs)
- [ ] Dark mode toggle per user (not just per org)
- [ ] Desktop browser push notifications (Notification API + service worker)
- [ ] Mobile PWA install prompt

### 2.5 AI Enhancements
- [ ] AI-suggested reply drafts (one-click populate Compose)
- [ ] Sentiment analysis on incoming mail (flag urgent / negative threads)
- [ ] Auto-label suggestions based on content
- [ ] Weekly digest summarization (cron Edge Function → send summary email)

---

## 🟡 Phase 3 — Platform & Scale (Q4 2026 – Q1 2027)

### 3.1 Real-Time Collaboration
- [ ] Collaborative draft editing (multiple users editing same draft simultaneously via Yjs/CRDT)
- [ ] Internal notes / comments on threads (visible only to team, not sent externally)
- [ ] @mention teammates inside thread notes
- [ ] Shared inbox / team mailbox support (multiple staff assigned to one mailbox)

### 3.2 Native Mobile Apps
- [ ] React Native (Expo) iOS and Android apps
- [ ] Push notifications via APNs / FCM
- [ ] Offline-first local cache (WatermelonDB or MMKV)
- [ ] Biometric authentication (FaceID / fingerprint)

### 3.3 Video Calls Integration
- [ ] Full Daily.co or Jitsi Meet integration (no external account required for participants)
- [ ] One-click "Video Call" from email thread → join link auto-appended to email
- [ ] In-app video call widget (picture-in-picture while reading email)
- [ ] Recording + automatic AI transcript stored with thread

### 3.4 Multi-Org Admin Console
- [ ] Super-admin portal for resellers / white-label deployments
- [ ] Per-org seat billing (Stripe subscription via Supabase Edge Functions)
- [ ] Custom domain setup wizard (CNAME for white-label `mail.customerdomain.com`)
- [ ] Per-org feature flags (enable/disable AI, video calls, etc.)
- [ ] Usage analytics dashboard (messages synced, storage used, active users)

### 3.5 Compliance & Security
- [ ] End-to-end encryption for stored message bodies (field-level encryption in Postgres)
- [ ] PGP key management (import, sign, encrypt outgoing)
- [ ] SOC 2 Type II readiness (audit logs, data retention policies, DPA)
- [ ] GDPR tools: data export, right to erasure
- [ ] Message archiving with immutable audit trail (Supabase Storage + WORM bucket policy)

---

## 🔮 Phase 4 — AI-First Future (2027+)

- [ ] Autonomous email triage agent (AI reads, categorizes, drafts responses for human review)
- [ ] Meeting scheduler AI (reads "let's find a time" threads → proposes slots → books calendar)
- [ ] CRM integration (auto-log emails to HubSpot, Salesforce, Pipedrive)
- [ ] Email analytics: response time, open rates, thread resolution time
- [ ] Voice dictation for compose (Web Speech API + AI cleanup)
- [ ] LLM fine-tuning on org's own email history for hyper-personalized suggestions

---

## Deployment Targets

| Component | Platform | Notes |
|-----------|----------|-------|
| Frontend | Vercel / Netlify | Static React build, edge CDN |
| Supabase backend | Supabase cloud | Postgres + Auth + Storage + Edge Functions |
| Sync service | Railway / Fly.io / VPS | Persistent Node process, Dockerfile provided |
| AI workloads | Anthropic API via Edge Functions | Claude 3.5 Haiku for cost efficiency |

---

## Tech Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| IMAP library | ImapFlow | Best IDLE support, TypeScript-native, active maintenance |
| SMTP library | nodemailer | De-facto standard, full RFC compliance |
| AI model | Claude 3.5 Haiku | Best cost/quality for summarization + search parsing |
| State management | React Context + hooks | Scope is well-defined; Redux adds overhead without benefit |
| Realtime | Supabase Channels | Zero-config, no separate WebSocket server needed |
| Rich text | Tiptap | ProseMirror-based, headless, extensible, React-native |
| Database | Supabase Postgres | RLS, Realtime, Storage, Auth all integrated |
| Secrets | Supabase Vault | Encrypted at rest, no credentials in application DB rows |

---

*Last updated: 2026-07-03 · Maintained by the Cosmos Mail team*
