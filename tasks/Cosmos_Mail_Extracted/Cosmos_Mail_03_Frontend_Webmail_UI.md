# Cosmos Mail — Prompt 03: Frontend Core Webmail UI

**Paste this entire prompt into medo.dev as the third build session for Cosmos Mail, after Prompts 01 and 02 are deployed and verified.**

---

## Context

Prompt 01 built auth + admin + schema. Prompt 02 built the sync service pulling real mail into Supabase. This session replaces the placeholder `/inbox` route with the real, polished webmail UI — this is the core user-facing product and the main reason Cosmos Mail should feel better than Roundcube. Do not modify the admin routes or sync service from prior prompts; only build new frontend routes and components under `/inbox`.

Stack: React + Vite + TypeScript + Tailwind + shadcn/ui. Data comes from Supabase Postgres (with Realtime subscriptions for live updates) — do not call IMAP directly from the frontend, ever.

## 1. Design Direction

Before writing components, apply the **theme-able branding system** established in Prompt 01: read `--cosmos-bg`, `--cosmos-primary`, `--cosmos-accent`, `--cosmos-surface`, `--cosmos-text` from the logged-in user's `organization_id` → `branding_config`, rather than hardcoding the default Cosmos Mail indigo/violet theme into inbox components. For Frimps Oil specifically, this resolves to their light theme: white/light-neutral surfaces, red (`#E31E24`) as the primary action color, orange (`#F7941D`) as the accent for smaller highlights (badges, active states, focus rings) — not the dark Cosmos Mail default. The Frimps logo (`branding_config.logo_url`) replaces the Cosmos Mail wordmark in the top bar's top-left position for their users. The inbox itself should feel closer to Superhuman/Linear in density and speed than to Gmail's default spaciousness — this is a professional tool for busy staff, not a consumer inbox. Favor keyboard-friendly, information-dense layouts over large whitespace-heavy cards, and make sure this density-first approach holds up under both the dark default theme and Frimps' light red/white/orange theme.

## 2. Layout: 3-Pane Webmail

Use PrivateEmail's webmail layout as the direct structural reference for proportions, density, and control placement — adapted to Cosmos Mail's indigo/violet brand palette instead of their blue/white scheme.

- **Top bar**: org logo top-left (Frimps Oil's logo for their users, resolved from `branding_config.logo_url`; Cosmos Mail wordmark as the default fallback), a centered (not left-squeezed) search input taking up a good portion of the bar's width, utility icons (settings, account) top-right. This should feel spacious and prominent, not an afterthought.
- **Left rail**: a prominent, pill-shaped "Compose" button at the top (full rail width, brand accent or dark fill, matching the login button style from Prompt 01) sitting above the folder list. Folder list uses icon + label rows (Inbox, Drafts, Sent, Spam, Trash, Archive — pulled from `mailbox_folders` for the active mailbox), with an unread count badge shown only on Inbox (not cluttering every folder with a zero badge). A mailbox switcher appears above Compose if the logged-in staff user has more than one linked mailbox. A storage/sync-status indicator sits pinned at the bottom of the rail, mirroring PrivateEmail's storage meter placement.
- **Middle pane**: thread list rows following this exact information hierarchy per row: sender name (bold if unread, regular if read), timestamp right-aligned on the same line, subject line below the sender, snippet preview in muted gray text below the subject, small unread dot indicator (not full-row bold treatment) for unread state, paperclip icon inline when the thread has attachments, and a small spam-confidence badge if `spam_flags` has a pending entry for that thread. Support multi-select for bulk actions (mark read/unread, archive, delete, move to spam/not-spam).
- **Right pane**: an icon-only action row at the top of the reading pane (reply, reply-all, forward, mark-unread, star, delete, move-to-spam, view-source) — icons only, no labels, tightly spaced, mirroring the reference's compact toolbar. Below that, a large subject-line heading, then the sender shown as a circular avatar with their initial plus name and email address on the same row, timestamp aligned to the right. Message body follows below. Most recent message expanded, older messages in the thread collapsed into summary rows (sender + snippet, click to expand) — standard email client conversation view. Reply/Reply All/Forward buttons also available pinned at the bottom of the open message for accessibility without scrolling back up.

Use Supabase Realtime subscriptions on the `threads` and `messages` tables scoped to the active mailbox so new mail appears without a manual refresh.

## 3. Core Actions

- **Compose**: modal or slide-in panel (not a full page navigation) — To/Cc/Bcc fields with contact autocomplete (stub this against a simple query on distinct `from_address`/`to_addresses` seen in that mailbox's synced mail, since a real contacts table is Phase 2), subject, rich text body (use a lightweight editor — Tiptap or similar, not a heavy legacy WYSIWYG), attachment upload (stores to Supabase Storage, attached on send), and Send button that calls the Edge Function built in Prompt 02.
- **Reply / Reply All / Forward**: pre-fills recipients and quotes the original message below a clear separator, consistent with standard mail client conventions.
- **Signatures**: per-mailbox signature stored in a new `signatures` table (`id`, `mailbox_id`, `body_html`, `is_default`) — auto-appended on compose/reply, editable in a simple settings page.
- **Snooze**: "Snooze" button on a thread that sets a `snoozed_until` timestamp column (add to `threads`) and hides it from the active folder view until that time passes, then it reappears at the top of Inbox. Implement the reappearance check as a simple query filter (`snoozed_until IS NULL OR snoozed_until <= now()`), not a background job, for MVP simplicity.
- **Unified search**: a search bar in the top nav that queries across all folders (and all linked mailboxes if the user has more than one) using Postgres full-text search on `messages.subject`/`body_text`/`from_address`. This is plain search for this session — natural-language AI search comes in Prompt 04.
- **Attachments**: preview images/PDFs inline where feasible (use browser-native rendering for PDFs via an iframe or object tag), download button for everything else.

## 4. Spam UX

- Spam folder displays confirmed-spam mail (synced from cPanel's Junk folder via Prompt 02).
- For Inbox mail with a pending `spam_flags` entry from the AI second-pass, show a non-intrusive banner at the top of that message in the reading pane: "This message shows signs of spam ([reason]). [Move to Spam] [Not Spam]" — clicking either updates `spam_flags.user_action` and, for "Move to Spam", moves the message. Never auto-move silently.

## 5. Settings Area

Small `/inbox/settings` route for the logged-in staff user:
- Manage signature(s)
- Toggle notification preferences (stub — actual push notifications are out of scope for Phase 1)
- View linked mailbox(es) read-only (management stays in admin, built in Prompt 01)

## 6. Responsiveness

- Fully responsive: on narrow viewports, collapse to a single-pane navigation pattern (folder list → thread list → reading pane, each a distinct screen with back navigation), similar to how Gmail's mobile web behaves. This should work well enough as a PWA-style experience that native apps aren't needed for Phase 1.

## 7. Performance & UX Polish

- Optimistic UI updates for mark-read/unread, star, archive, delete — update local state immediately, sync to Supabase in the background, roll back with a toast on failure.
- Keyboard shortcuts for power users: `c` compose, `r` reply, `a` reply all, `f` forward, `e` archive, `#` delete, `j`/`k` navigate thread list — this is a meaningful differentiator vs. Roundcube and worth getting right.
- Loading skeletons (not spinners) for thread list and reading pane while data loads, consistent with the density-focused design direction.

## 8. What NOT to build in this session

- No AI summarization, AI-powered search, or AI draft suggestions yet (Prompt 04)
- No contacts table, rules/filters, calendar, or autoresponder UI yet (Prompt 04 covers Phase 2 items)
- Do not modify the sync service or admin UI — only consume the data they already produce

## 9. Deliverable Checklist

- [ ] 3-pane inbox UI fully functional against real synced mail from Prompt 02
- [ ] Compose, reply, reply all, forward all working end-to-end including attachments
- [ ] Signatures working per mailbox
- [ ] Snooze working
- [ ] Unified plain-text search working across folders/mailboxes
- [ ] Spam banner UX working with confirm/dismiss actions
- [ ] Keyboard shortcuts implemented
- [ ] Fully responsive down to mobile width
- [ ] Realtime updates confirmed (new mail appears without manual refresh)
