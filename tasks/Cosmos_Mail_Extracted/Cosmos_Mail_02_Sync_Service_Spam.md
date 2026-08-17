# Cosmos Mail — Prompt 02: Sync Service (IMAP/SMTP + Spam Detection)

**Paste this entire prompt into medo.dev as the second build session for Cosmos Mail, after Prompt 01 is deployed and verified.**

---

## Context

Prompt 01 built the schema, auth, and admin mailbox-management UI. This session builds the **persistent sync service** that actually connects to cPanel mailboxes over IMAP, pulls mail into Supabase, and handles outbound send via SMTP. This service does NOT run on Vercel — it needs to run as a long-lived Node process (Railway, Fly.io, or a small VPS), since IMAP IDLE connections are stateful and long-lived.

If medo.dev cannot provision a persistent Node service directly, generate this as a standalone Node/TypeScript project (with a Dockerfile) that I will deploy separately to Railway or Fly.io, and just wire up the Supabase connection details as environment variables.

## 1. Complete the Data Model

Building on Prompt 01's schema, add:

### `threads`
- `id` uuid primary key default gen_random_uuid()
- `mailbox_id` uuid references mailboxes(id) not null
- `subject` text
- `participants` text[] — all from/to/cc addresses involved
- `last_message_at` timestamptz
- `is_read` boolean default false
- `is_starred` boolean default false
- `labels` text[] default '{}'
- `folder_id` uuid references mailbox_folders(id)

### `messages`
- `id` uuid primary key default gen_random_uuid()
- `thread_id` uuid references threads(id) not null
- `mailbox_id` uuid references mailboxes(id) not null
- `imap_uid` bigint not null — for dedup/sync tracking
- `imap_uidvalidity` bigint not null — required to detect UID resets per IMAP spec
- `from_address` text
- `from_name` text
- `to_addresses` text[]
- `cc_addresses` text[]
- `bcc_addresses` text[]
- `body_html` text
- `body_text` text
- `sent_at` timestamptz
- `is_read` boolean default false
- `is_flagged` boolean default false
- `spam_score` numeric
- `spam_status` text default 'clean' — 'clean' | 'flagged' | 'confirmed_spam'
- `raw_headers` jsonb — store useful headers (Message-ID, In-Reply-To, References) for threading
- unique constraint on (`mailbox_id`, `imap_uid`, `imap_uidvalidity`)

### `attachments`
- `id` uuid primary key default gen_random_uuid()
- `message_id` uuid references messages(id) not null
- `storage_path` text not null — Supabase Storage path
- `filename` text
- `mime_type` text
- `size_bytes` bigint

### `spam_flags`
- `id` uuid primary key default gen_random_uuid()
- `message_id` uuid references messages(id) not null
- `source` text — 'spamassassin' | 'ai_second_pass'
- `confidence` numeric
- `reason` text — short human-readable explanation, e.g. "Sender domain mismatch, urgency language detected"
- `user_action` text — 'pending' | 'confirmed' | 'dismissed'

## 2. Sync Service Architecture

Build a Node/TypeScript service with this structure:

```
/sync-service
  /src
    index.ts              — entrypoint, starts sync loop for all active mailboxes
    imap-client.ts         — ImapFlow wrapper: connect, backfill, IDLE watch
    smtp-client.ts         — nodemailer wrapper for send
    folder-mapper.ts       — maps raw IMAP folder names to normalized_type
    spam-detector.ts       — parses X-Spam-Score/X-Spam-Status headers + calls AI second-pass
    supabase-sync.ts       — writes parsed mail into Postgres + Storage
    credential-vault.ts    — retrieves decrypted credentials from Supabase Vault at runtime
  Dockerfile
  package.json
```

### Behavior requirements

- **Connection pooling**: one IMAP connection per active mailbox (status = 'active' or 'pending'), not one global connection. Use `ImapFlow`'s IDLE support to get near-real-time push for new mail; fall back to polling every 60–120 seconds if IDLE isn't supported by the server.
- **Initial backfill**: on first connection to a new mailbox, sync the last 90 days of mail across all folders (configurable constant, not hardcoded per mailbox) before switching to incremental/IDLE mode. Update `mailboxes.sync_status` to 'syncing' during backfill, 'active' once caught up.
- **Folder discovery**: on connect, run IMAP LIST, populate `mailbox_folders` for that mailbox, and use `folder-mapper.ts` to guess `normalized_type` from common cPanel folder naming conventions (INBOX, Sent, Sent Items, Drafts, Trash, Junk, Spam, Archive) — allow the admin UI (built in Prompt 01) to override the mapping later if the auto-guess is wrong.
- **Deduplication**: use the unique constraint on (`mailbox_id`, `imap_uid`, `imap_uidvalidity`) to avoid re-inserting already-synced messages. Handle UIDVALIDITY changes (rare but real — means the folder was reset) by clearing and re-syncing that folder's messages.
- **Threading**: group messages into `threads` using `In-Reply-To` / `References` headers where present, falling back to normalized subject-line matching (strip "Re:"/"Fwd:" prefixes) when headers are missing.
- **Attachments**: extract attachments during parse, upload to Supabase Storage under a path like `attachments/{mailbox_id}/{message_id}/{filename}`, store metadata in the `attachments` table. Do not inline large attachments into `body_html`.
- **Error handling**: on connection failure, set `mailboxes.sync_status = 'error'` and `last_error` with a human-readable message (auth failure, host unreachable, etc.) — surface this in the admin UI built in Prompt 01 without needing a code change there (it already reads `sync_status`/`last_error`).
- **Send (SMTP)**: expose a function (called via an authenticated Edge Function from the frontend, not directly from the browser) that sends mail via `nodemailer` using the correct mailbox's SMTP credentials, and on success, inserts the sent message into `messages`/`threads` immediately (don't wait for IMAP to sync the Sent folder back, since that can lag).

## 3. Spam Detection (Two-Layer)

**Layer 1 — Respect existing SpamAssassin (cPanel-native):**
- Parse `X-Spam-Score` and `X-Spam-Status` headers on every incoming message during sync.
- If the message is already in a Junk/Spam IMAP folder (per `folder-mapper.ts`), sync it there and set `spam_status = 'confirmed_spam'` — no further action needed, just display it correctly in the UI's Spam folder (built in Prompt 03).

**Layer 2 — AI second-pass for inbox-landing borderline mail:**
- For messages that land in Inbox (not already filtered) but have a `X-Spam-Score` above a low threshold (e.g., flagged but not enough for SpamAssassin's own move-to-junk threshold), OR messages with no spam header at all but suspicious characteristics (mismatched reply-to domain, excessive urgency language, suspicious links), run a lightweight classification call to an LLM (via Anthropic API — use a fast/cheap model call, single classification prompt, not a full conversation) that returns a confidence score and short reason.
- Insert a `spam_flags` row with `source = 'ai_second_pass'`, `confidence`, and `reason`. Do NOT auto-move these to Spam — that's a UI-level "Move to Spam?" suggestion (Prompt 03/04), never silent, since false positives on legitimate client/vendor mail would be costly for an oil company.
- Rate-limit/batch this AI check so it doesn't fire on every single inbox message — only for mail that already shows some spam signal, to control API cost.

## 4. Environment & Secrets

- Sync service reads Supabase service-role key and Anthropic API key from environment variables — never commit these.
- Retrieve per-mailbox IMAP/SMTP passwords from Supabase Vault at connection time using `credential_vault_ref`, decrypt only in-memory, never log or persist decrypted credentials anywhere.

## 5. What NOT to build in this session

- No frontend inbox UI yet (Prompt 03)
- No thread summarization or smart search UI yet (Prompt 04) — the AI spam second-pass here is the only AI call in this session
- Do not touch the admin UI or auth built in Prompt 01, only extend the schema it created

## 6. Deliverable Checklist

- [ ] Sync service connects to a real cPanel mailbox (test with frimpsoil.com.gh credentials once deployed) and completes initial backfill
- [ ] New mail appears in Supabase within ~2 minutes of arriving (IDLE or polling fallback confirmed working)
- [ ] Folder mapping correctly identifies Inbox/Sent/Drafts/Trash/Spam for cPanel's actual folder naming
- [ ] Sending mail via SMTP works and appears immediately in Sent
- [ ] Existing SpamAssassin-flagged mail is correctly synced into the Spam folder
- [ ] AI second-pass flags at least function correctly on a test borderline message, without auto-moving anything
- [ ] `mailboxes.sync_status` and `last_error` update correctly and are visible in the Prompt 01 admin UI without further changes there
