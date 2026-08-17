# Cosmos Mail — Prompt 04: AI Layer + Premium Features (Phase 2 & 3)

**Paste this entire prompt into medo.dev as the fourth build session for Cosmos Mail, after Prompts 01, 02, and 03 are deployed and verified.**

---

## Context

The first three sessions built a fully functional webmail client: auth, admin, sync, spam handling, and the core 3-pane inbox UI. This session adds the two Phase 1 AI features that were deferred, plus the Phase 2 premium feature set, plus placeholders for Phase 3. This is the largest and most flexible session — build in the order listed below and confirm each piece works before moving to the next, rather than building everything simultaneously.

## PART A — Phase 1 AI Features (should have shipped, now completing MVP)

### A1. Thread Summarization

- Add a "Summarize" button in the reading pane header, visible on threads with 3+ messages (not useful on single messages).
- On click, call a Supabase Edge Function that sends the thread's messages (concatenated, most recent first, reasonably truncated if very long) to the Anthropic API with a system prompt instructing a concise, neutral summary: key points, any action items or requests, current status. Store the result in `ai_cache` (`thread_id`, `type = 'summary'`, `content`, `generated_at`).
- On subsequent opens of the same thread, serve the cached summary instead of regenerating — only regenerate if new messages have arrived since `generated_at`, or if the user explicitly clicks "Regenerate."
- Display the summary in a collapsible card at the top of the reading pane, visually distinct (subtle accent border, small "AI Summary" label) so it's clearly marked as generated content, not part of the original mail.

### A2. Smart Search (Natural Language)

- Extend the search bar built in Prompt 03: detect when a query looks conversational/natural-language (heuristic: contains words like "from," "last," "about," "invoices," date-like phrases) vs. a simple keyword search, and route natural-language queries through an Edge Function.
- That function sends the query to the Anthropic API with a prompt instructing it to extract structured filters (sender, date range, keywords, folder) and return them as JSON — then use those filters to build a Postgres query against `messages`/`threads` (full-text search + date/sender filtering), not a live IMAP query.
- Fall back gracefully to plain keyword search if the AI parsing fails or returns low-confidence output — never leave the user with a blank/broken search.
- Show a small chip row above results reflecting the parsed filters (e.g., "From: Avia Cosmetics" · "Last 30 days") so the user can see what was interpreted and remove/adjust a filter manually if the parse was wrong.

## PART B — Phase 2 Premium Features

### B1. Shared Company Contacts

- New `contacts` table: `id`, `organization_id`, `name`, `email`, `company`, `phone`, `notes`, `created_by`.
- Simple CRUD UI under `/inbox/contacts` — list, add, edit, delete. Auto-suggest adding a contact when replying to a new external address not already saved (small inline prompt, dismissible).
- Wire contact autocomplete in Compose (built in Prompt 03) to pull from this real table now, instead of the distinct-address stub.

### B2. Rules & Filters

- New `rules` table: `id`, `mailbox_id`, `condition_json` (e.g., `{"from_contains": "supplier.com"}`), `action_json` (e.g., `{"add_label": "Suppliers"}` or `{"move_to_folder": "Archive"}`), `is_active`.
- Settings UI to create simple rules: condition (from contains / subject contains) → action (label / move to folder / mark as read). Apply rules in the sync service (Prompt 02's codebase — extend `supabase-sync.ts` to check active rules for that mailbox after inserting a new message) so they apply to incoming mail automatically, not just retroactively in the UI.

### B3. Out-of-Office / Autoresponder

- cPanel/Exim already supports autoresponders natively — rather than rebuilding this logic, build a settings UI that, via a small backend function, uses cPanel's API (UAPI `Email::add_autoresponder` or equivalent, confirm exact endpoint against the hosting provider's cPanel version) to set/clear the autoresponder directly on the mail server. This keeps behavior consistent with how cPanel actually handles it (including for mail clients other than Cosmos Mail) instead of reimplementing autoresponder logic in the sync service.
- UI: toggle on/off, subject, message body, optional start/end date.

### B4. Lightweight Calendar

- New tables: `calendar_events` (`id`, `organization_id`, `created_by`, `title`, `description`, `start_at`, `end_at`, `location`, `attendees` text[]).
- Simple month/week view under `/inbox/calendar`, create/edit/delete events. This is a standalone Supabase-backed calendar, not a CalDAV sync with the mail server — keep scope tight, this is not meant to compete with Google Calendar, just cover basic scheduling needs.
- Nice-to-have if time allows: detect date/time mentions in email bodies and offer a "Create event from this email" quick action — skip if it adds significant complexity, this is not core to Phase 2.

### B5. Read Receipts / Send Later

- **Send Later**: in Compose, add a "Schedule send" option — stores the message in a `scheduled_messages` table with a `send_at` timestamp instead of sending immediately. Requires a small scheduled job (can run in the persistent sync service from Prompt 02, checking every minute for due messages) that triggers the actual SMTP send when `send_at` passes.
- **Read Receipts**: on send, optionally embed a tracking pixel (small transparent image request hitting a Supabase Edge Function endpoint unique per message) — on load, mark `messages.read_receipt_confirmed_at`. Note the real-world limitation clearly in the UI (many mail clients block remote images by default, so this is best-effort, not guaranteed) rather than presenting it as reliable.

### B6. "Coming Soon: Video Calls" Placeholder

- Add a "Video Call" button in the compose/reading pane toolbar (next to reply/forward) that opens a simple modal: "Video calling is coming soon to Cosmos Mail" with a short description and a "Notify me when available" button that just logs interest (insert a row into a `feature_interest` table with `feature = 'video_call'`, `staff_user_id`). No actual video infrastructure — this is purely a placeholder to signal the roadmap and gauge interest, explicitly per this phase's scope.

## PART C — Phase 3 Notes (do not build yet — documentation only)

Add a `/ROADMAP.md` file to the project root (not a UI page) documenting these as future phases, so the intent is preserved in the codebase without scope creep into this session:

- Multi-provider support (Google Workspace, Outlook/Microsoft 365, generic IMAP beyond cPanel)
- Real-time collaborative drafting
- Native mobile apps (iOS/Android) — PWA covers most of this need until there's clear demand
- Actual video call integration (if "Notify me" interest from B6 validates demand) — likely via a third-party embed (e.g., Daily.co or similar) rather than building calling infrastructure from scratch
- Multi-org admin console — a top-level dashboard for managing multiple client organizations under one Cosmos Mail deployment, enabling the white-label resale model

## What NOT to build in this session

- Do not touch auth, schema from Prompt 01, or sync service internals from Prompt 02 beyond the specific rules-engine hook noted in B2 and the scheduled-send job noted in B5
- Do not build any real video calling — B6 is explicitly a placeholder only

## Deliverable Checklist

- [ ] Thread summarization working, cached correctly, clearly marked as AI-generated
- [ ] Smart search correctly parses natural-language queries into filters, with graceful fallback
- [ ] Contacts CRUD working, wired into Compose autocomplete
- [ ] Rules engine applying to new incoming mail automatically
- [ ] Autoresponder settings correctly read/write cPanel's native autoresponder via API
- [ ] Calendar basic CRUD working
- [ ] Send Later and read receipt tracking functional (with honest UI messaging on read-receipt reliability)
- [ ] "Coming Soon" video call placeholder in place, interest logging working
- [ ] `/ROADMAP.md` documents Phase 3 items without any Phase 3 code being built
