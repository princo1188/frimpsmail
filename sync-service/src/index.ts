import 'dotenv/config';
import { createServer, type Server } from 'node:http';
import { closeSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ImapClient, MailboxConfig } from './imap-client';
import { getCredential } from './credential-vault';
import { SmtpClient } from './smtp-client';
import {
  syncFolders,
  findOrCreateThread,
  insertMessage,
  storeAttachments,
  applyRules,
  type ParsedMessage,
} from './supabase-sync';
import { analyzeSpamHeaders, analyzeSpamWithAI, needsAISecondPass } from './spam-detector';
import { scheduleReminders } from './reminder-scheduler';
import { sendIcsInvite } from './ics-generator';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const HEALTH_PORT = Number.parseInt(process.env.PORT ?? '8080', 10) || 8080;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BACKFILL_DAYS = parseInt(process.env.BACKFILL_DAYS ?? '90', 10);
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? '30000', 10);
const SCHEDULED_CHECK_INTERVAL = 60_000;   // 1 minute
const PENDING_POLL_INTERVAL    = 120_000;  // 2 minutes — re-check for newly credentialed mailboxes
const OUTBOUND_POLL_INTERVAL   = 10_000;   // 10 seconds — quick outbound send queue

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[INIT] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * A second line of defence for deployments where the worker is accidentally
 * started more than once. The database queue claim remains the authoritative
 * cross-process reservation mechanism.
 */
function acquireProcessLock(): () => void {
  const lockPath = process.env.SYNC_PROCESS_LOCK_PATH ?? join(tmpdir(), 'sync-service.process.lock');
  const token = `${process.pid}:${Date.now()}`;

  const writeLock = () => {
    const fd = openSync(lockPath, 'wx', 0o600);
    try {
      writeFileSync(fd, JSON.stringify({ pid: process.pid, token, started_at: new Date().toISOString() }));
    } finally {
      closeSync(fd);
    }
  };

  try {
    writeLock();
  } catch (error: unknown) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;

    let stale = false;
    try {
      const existing = JSON.parse(readFileSync(lockPath, 'utf8')) as { pid?: number };
      if (!existing.pid) stale = true;
      else {
        try { process.kill(existing.pid, 0); } catch { stale = true; }
      }
    } catch {
      stale = true;
    }

    if (!stale) {
      throw new Error(`Another sync-service process is already running (lock: ${lockPath})`);
    }

    unlinkSync(lockPath);
    writeLock();
  }

  return () => {
    try {
      const existing = JSON.parse(readFileSync(lockPath, 'utf8')) as { token?: string };
      if (existing.token === token) unlinkSync(lockPath);
    } catch {
      // The OS cleans up the process; a later startup also removes stale locks.
    }
  };
}

/** Lightweight liveness endpoint that stays responsive during mailbox sync. */
function startHealthServer(): Server {
  const server = createServer((request, response) => {
    const path = request.url?.split('?', 1)[0];
    if (request.method === 'GET' && (path === '/' || path === '/health')) {
      response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Sync Worker Healthy');
      return;
    }

    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not Found');
  });

  server.on('error', error => console.error('[HEALTH] HTTP server error:', error));
  server.listen(HEALTH_PORT, () => console.log(`[HEALTH] Listening on port ${HEALTH_PORT}`));
  return server;
}

let healthServer: Server | null = null;

async function processMessage(
  supabase: SupabaseClient,
  mailboxId: string,
  folderIdMap: Map<string, string>,
  msg: ParsedMessage,
): Promise<void> {
  const folderId = folderIdMap.get(msg.inboxFolderName) ?? null;

  // Extract message-id references for threading
  const referencedIds = [
    msg.headers['in-reply-to'],
    ...(msg.headers['references']?.split(/\s+/) ?? []),
  ].filter(Boolean);

  const threadId = await findOrCreateThread(
    supabase,
    mailboxId,
    msg.subject,
    msg.fromAddress,
    msg.toAddresses,
    referencedIds,
    folderId,
    msg.sentAt,
  );

  const messageId = await insertMessage(supabase, mailboxId, threadId, msg, folderId);
  if (!messageId) return; // Duplicate, skip

  const { error: syncUpdateError } = await supabase
    .from('mailboxes')
    .update({ last_synced_at: new Date().toISOString(), sync_status: 'active', last_error: null })
    .eq('id', mailboxId);
  if (syncUpdateError) console.error(`[SYNC] Could not update sync heartbeat for ${mailboxId}:`, syncUpdateError);

  // Store attachments
  if (msg.attachments.length) {
    await storeAttachments(supabase, mailboxId, messageId, msg.attachments);
  }

  // Spam detection (inbox messages only)
  if (!msg.isSpamFolder) {
    const headerAnalysis = analyzeSpamHeaders(msg.headers);
    if (headerAnalysis && headerAnalysis.is_spam) {
      // Layer 1: confirmed spam from headers
      await supabase.from('spam_flags').insert({
        message_id: messageId,
        source: 'spamassassin',
        confidence: headerAnalysis.confidence,
        reason: headerAnalysis.reason,
        user_action: 'pending',
      });
    } else if (needsAISecondPass(msg.headers)) {
      // Layer 2: AI second-pass for borderline / header-less
      const aiAnalysis = await analyzeSpamWithAI(msg.subject, msg.fromAddress, msg.bodyText);
      if (aiAnalysis.confidence >= 0.6) {
        await supabase.from('spam_flags').insert({
          message_id: messageId,
          source: 'ai_second_pass',
          confidence: aiAnalysis.confidence,
          reason: aiAnalysis.reason,
          user_action: 'pending',
        });
      }
    }
  }

  // Apply matching rules
  await applyRules(supabase, mailboxId, messageId, msg);

  // Update thread's last_message_at
  await supabase
    .from('threads')
    .update({ last_message_at: msg.sentAt.toISOString() })
    .eq('id', threadId)
    .lt('last_message_at', msg.sentAt.toISOString());
}

async function syncMailbox(mailboxRow: {
  id: string;
  email_address: string;
  imap_host: string;
  imap_port: number;
  credential_vault_ref: string;
}): Promise<void> {
  const { id: mailboxId, email_address, imap_host, imap_port, credential_vault_ref } = mailboxRow;
  console.log(`[SYNC] Starting sync for ${email_address}`);

  let password: string;
  try {
    password = await getCredential(supabase, credential_vault_ref);
  } catch (err) {
    await supabase.from('mailboxes').update({
      sync_status: 'error',
      last_error: `Vault error: ${err}`,
    }).eq('id', mailboxId);
    return;
  }

  const client = new ImapClient({
    id: mailboxId,
    emailAddress: email_address,
    imapHost: imap_host,
    imapPort: imap_port,
    password,
  }, supabase);

  // High-priority folders get dedicated IMAP connections for near-real-time coverage.
  // ALL other folders (junk, trash, spam, custom/company folders, etc.) share a single
  // polling connection so that every folder is synced automatically.
  const HIGH_PRIORITY_PATTERNS = ['inbox', 'sent', 'drafts', 'archive'];
  // Sent/Drafts need fast feedback (5s) so users see outgoing + draft changes quickly.
  // INBOX/Archive use the env-configured interval (default 30s).
  const SENT_DRAFTS_PATTERNS = ['sent', 'drafts'];
  const SENT_DRAFTS_POLL_MS = 5_000;
  const OTHER_FOLDERS_POLL_MS = 90_000; // Junk/Trash/spam — slow poll is fine

  // Track all per-folder clients so we can disconnect on error
  const folderClients: ImapClient[] = [];

  try {
    await client.connect();
    await supabase.from('mailboxes').update({ sync_status: 'syncing' }).eq('id', mailboxId);

    // Discover folders using the main client
    const folderNames = await client.listFolders();
    const folderIdMap = await syncFolders(supabase, mailboxId, folderNames);

    // Backfill all folders sequentially on the main connection
    for (const folderName of folderNames) {
      console.log(`[SYNC] Backfilling ${email_address}/${folderName}`);
      try {
        await client.backfill(folderName, BACKFILL_DAYS, async (msg) => {
          await processMessage(supabase, mailboxId, folderIdMap, msg);
        });
      } catch (err) {
        console.warn(`[SYNC] Backfill failed for ${email_address}/${folderName}:`, err);
      }
    }

    await supabase.from('mailboxes').update({
      sync_status: 'active',
      last_synced_at: new Date().toISOString(),
      last_error: null,
    }).eq('id', mailboxId);

    console.log(`[SYNC] Backfill complete for ${email_address}, entering multi-connection watch`);

    // Disconnect main client — dedicated per-folder clients take over
    await client.disconnect();

    // Categorise available folders: high-priority get dedicated connections,
    // EVERYTHING else is batched on a shared "all other folders" poller so
    // custom folders (e.g. Archive, Templates, company folders) are also synced.
    // High-priority matching is exact (case-insensitive) to avoid misclassifying
    // folders like "INBOX.spam" as high priority.
    const highPrioritySet = new Set<string>();
    const otherFolders: string[] = [];
    for (const name of folderNames) {
      const normalizedName = name.toLowerCase().replace(/^inbox\./, '').replace(/^inbox\//, '');
      if (HIGH_PRIORITY_PATTERNS.includes(normalizedName)) {
        highPrioritySet.add(name);
      } else {
        otherFolders.push(name);
      }
    }

    const config: MailboxConfig = { id: mailboxId, emailAddress: email_address, imapHost: imap_host, imapPort: imap_port, password };

    // Spawn a dedicated IMAP connection per high-priority folder.
    // Sent/Drafts use a 5s poll so outgoing mail and draft changes appear quickly;
    // INBOX/Archive use the env-configured POLL_INTERVAL_MS (default 30s).
    const highPriorityPromises = Array.from(highPrioritySet).map(async (folderName) => {
      const fc = new ImapClient(config, supabase);
      folderClients.push(fc);
      const normalizedFolderName = folderName.toLowerCase().replace(/^inbox\./, '').replace(/^inbox\//, '');
      const pollMs = SENT_DRAFTS_PATTERNS.includes(normalizedFolderName) ? SENT_DRAFTS_POLL_MS : POLL_INTERVAL_MS;
      try {
        await fc.connect();
        console.log(`[SYNC] Dedicated watcher started for ${email_address}/${folderName} (poll=${pollMs}ms)`);
        await fc.watchFolders([folderName], async (msg) => {
          await processMessage(supabase, mailboxId, folderIdMap, msg);
        }, pollMs);
      } catch (err) {
        console.error(`[SYNC] Watcher error for ${email_address}/${folderName}:`, err);
        throw err; // propagate so the outer Promise.race can detect failure
      } finally {
        await fc.disconnect().catch(() => {});
      }
    });

    // Spawn one shared polling connection for ALL non-high-priority folders
    // Use a never-resolving sentinel when there are no other folders so
    // Promise.race doesn't resolve prematurely and kill the high-priority watchers.
    let otherFoldersPromise: Promise<void> = new Promise(() => { /* intentionally never resolves */ });
    if (otherFolders.length) {
      const ofc = new ImapClient(config, supabase);
      folderClients.push(ofc);
      otherFoldersPromise = (async () => {
        await ofc.connect();
        console.log(`[SYNC] All-other-folders poller started for ${email_address}: ${otherFolders.join(', ')}`);
        await ofc.watchFolders(otherFolders, async (msg) => {
          await processMessage(supabase, mailboxId, folderIdMap, msg);
        }, OTHER_FOLDERS_POLL_MS);
      })().catch(err => {
        console.error(`[SYNC] All-other-folders poller error for ${email_address}:`, err);
        throw err;
      }).finally(async () => {
        await ofc.disconnect().catch(() => {});
      });
    }

    // If any folder connection drops, treat the whole mailbox sync as failed (triggers reconnect)
    await Promise.race([...highPriorityPromises, otherFoldersPromise]);
    throw new Error('A folder watcher exited unexpectedly');

  } catch (err) {
    console.error(`[SYNC] Error for ${email_address}:`, err);
    await supabase.from('mailboxes').update({
      sync_status: 'error',
      last_error: String(err),
    }).eq('id', mailboxId);
    // Clean up all folder clients
    await Promise.allSettled(folderClients.map(fc => fc.disconnect()));
    await client.disconnect().catch(() => {});
  }
}

/** Build an SmtpClient for a mailbox, fetching the password from Vault */
interface SmtpMailbox {
  id: string;
  email_address: string;
  smtp_host: string;
  smtp_port: number;
  credential_vault_ref: string;
  display_name?: string | null;
}

async function getSmtpClient(mailbox: SmtpMailbox): Promise<SmtpClient> {
  const password = await getCredential(supabase, mailbox.credential_vault_ref);
  return new SmtpClient({
    host: mailbox.smtp_host,
    port: mailbox.smtp_port,
    emailAddress: mailbox.email_address,
    password,
    displayName: mailbox.display_name ?? undefined,
  });
}

/** Resolve reply-to headers for threading from an original message */
async function resolveReplyHeaders(replyToMessageId?: string | null): Promise<{ inReplyTo?: string; references?: string }> {
  if (!replyToMessageId) return {};
  const { data: origMsg } = await supabase
    .from('messages')
    .select('raw_headers')
    .eq('id', replyToMessageId)
    .maybeSingle();
  if (!origMsg?.raw_headers) return {};
  const headers = origMsg.raw_headers as Record<string, string>;
  const inReplyTo = headers['message-id'] ?? headers['Message-ID'];
  const references = [headers['references'], inReplyTo].filter(Boolean).join(' ');
  return { inReplyTo, references };
}

/** Insert a sent copy into messages table */
async function recordSentMessage(opts: {
  mailbox_id: string;
  reply_to_message_id?: string | null;
  from_address: string;
  from_name?: string | null;
  to_addresses: string[];
  cc_addresses?: string[];
  bcc_addresses?: string[];
  subject: string;
  body_html: string;
  body_text: string;
  message_id: string;
}): Promise<void> {
  let threadId: string | null = null;

  const { data: sentFolder } = await supabase
    .from('mailbox_folders')
    .select('id')
    .eq('mailbox_id', opts.mailbox_id)
    .eq('normalized_type', 'sent')
    .maybeSingle();

  if (opts.reply_to_message_id) {
    const { data: existingThread } = await supabase
      .from('messages')
      .select('thread_id')
      .eq('id', opts.reply_to_message_id)
      .maybeSingle();
    threadId = existingThread?.thread_id ?? null;
  }

  if (!threadId) {
    // Create a thread for this outbound message
    const participants = [opts.from_address, ...opts.to_addresses, ...(opts.cc_addresses ?? []), ...(opts.bcc_addresses ?? [])];
    const { data: thread, error: threadErr } = await supabase
      .from('threads')
      .insert({
        mailbox_id: opts.mailbox_id,
        subject: opts.subject,
        participants: Array.from(new Set(participants)),
        folder_id: sentFolder?.id ?? null,
        last_message_at: new Date().toISOString(),
        is_read: true,
        is_starred: false,
        labels: [],
      })
      .select('id')
      .single();

    if (threadErr || !thread?.id) throw new Error(`Failed to create sent thread: ${threadErr?.message ?? 'no id returned'}`);
    threadId = thread.id;
  }

  if (!threadId) throw new Error('Failed to resolve thread_id for sent message');

  const { error } = await supabase.from('messages').insert({
    thread_id: threadId,
    mailbox_id: opts.mailbox_id,
    from_address: opts.from_address,
    from_name: opts.from_name ?? null,
    to_addresses: opts.to_addresses,
    cc_addresses: opts.cc_addresses ?? [],
    bcc_addresses: opts.bcc_addresses ?? [],
    subject: opts.subject,
    body_html: opts.body_html,
    body_text: opts.body_text,
    sent_at: new Date().toISOString(),
    is_read: true,
    is_flagged: false,
    spam_status: 'clean',
    raw_headers: { 'message-id': opts.message_id },
  });

  if (error) {
    console.error('[SMTP] Failed to record sent message:', error);
    throw new Error(`Failed to record sent message: ${error.message}`);
  }
}

/** Send an outbound email with the email-safe pipeline and persist a sent copy */
async function sendOutboundEmail(outbound: {
  id: string;
  mailbox_id: string;
  to_addresses: string[];
  cc_addresses: string[];
  bcc_addresses: string[];
  subject: string;
  body_html: string;
  reply_to_message_id?: string | null;
  attachments_json?: unknown;
}, mailbox: {
  id: string;
  email_address: string;
  smtp_host: string;
  smtp_port: number;
  credential_vault_ref: string;
  display_name?: string | null;
}, source: 'outbound' | 'scheduled'): Promise<{ messageId: string }> {
  const smtp = await getSmtpClient(mailbox);
  const { inReplyTo, references } = await resolveReplyHeaders(outbound.reply_to_message_id);

  const attachments: Array<{ filename: string; content: Buffer; mimeType: string }> = [];
  const rawAttachments = (outbound.attachments_json ?? []) as Array<{ path: string; filename: string; mimeType?: string }>;
  for (const att of rawAttachments) {
    if (att?.path) {
      const { data: fileData, error: dlErr } = await supabase.storage.from('attachments').download(att.path);
      if (dlErr || !fileData) throw new Error(`Could not download attachment ${att.filename ?? att.path}: ${dlErr?.message ?? 'file not found'}`);
      const buffer = Buffer.from(await fileData.arrayBuffer());
      attachments.push({ filename: att.filename, content: buffer, mimeType: att.mimeType ?? 'application/octet-stream' });
    }
  }

  const result = await smtp.sendMail({
    to: outbound.to_addresses,
    cc: outbound.cc_addresses,
    bcc: outbound.bcc_addresses,
    subject: outbound.subject,
    htmlBody: outbound.body_html,
    inReplyTo,
    references,
    attachments,
  });

  try {
    await recordSentMessage({
      mailbox_id: outbound.mailbox_id,
      reply_to_message_id: outbound.reply_to_message_id,
      from_address: mailbox.email_address,
      from_name: mailbox.display_name,
      to_addresses: outbound.to_addresses,
      cc_addresses: outbound.cc_addresses,
      bcc_addresses: outbound.bcc_addresses,
      subject: outbound.subject,
      body_html: result.html,
      body_text: result.text,
      message_id: result.messageId,
    });
  } catch (error) {
    // SMTP accepted the message. Leave it sent to prevent a retry from
    // delivering a duplicate; IMAP Sent polling will reconcile the copy.
    console.error(`[SMTP] Message ${outbound.id} delivered but sent-copy persistence failed:`, error);
  }

  console.log(`[SMTP] ${source} message ${outbound.id} sent as ${result.messageId}`);
  return { messageId: result.messageId };
}

/** Process scheduled messages due to be sent */
async function processScheduledMessages(): Promise<void> {
  const { data: due } = await supabase
    .from('scheduled_messages')
    .select('*, mailboxes(email_address, smtp_host, smtp_port, credential_vault_ref, display_name)')
    .eq('status', 'pending')
    .lte('send_at', new Date().toISOString())
    .limit(10);

  if (!due?.length) return;

  for (const scheduled of due) {
    try {
      const mailbox = (scheduled as Record<string, unknown>).mailboxes as {
        email_address: string;
        smtp_host: string;
        smtp_port: number;
        credential_vault_ref: string;
        display_name: string;
      };

      await sendOutboundEmail(
        {
          id: scheduled.id as string,
          mailbox_id: scheduled.mailbox_id as string,
          to_addresses: (scheduled.to_addresses ?? []) as string[],
          cc_addresses: (scheduled.cc_addresses ?? []) as string[],
          bcc_addresses: (scheduled.bcc_addresses ?? []) as string[],
          subject: scheduled.subject as string,
          body_html: scheduled.body_html as string,
          reply_to_message_id: (scheduled.reply_to_message_id ?? null) as string | null,
          attachments_json: scheduled.attachments_json ?? [],
        },
        { ...mailbox, id: scheduled.mailbox_id as string },
        'scheduled',
      );

      await supabase.from('scheduled_messages')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', scheduled.id);
      console.log(`[SCHEDULED] Sent scheduled message ${scheduled.id}`);
    } catch (err) {
      console.error(`[SCHEDULED] Failed to send ${scheduled.id}:`, err);
      await supabase.from('scheduled_messages')
        .update({ status: 'failed' })
        .eq('id', scheduled.id);
    }
  }
}

/** Process queued outbound messages */
async function processOutboundMessages(): Promise<void> {
  const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString();
  const { error: recoveryError } = await supabase
    .from('outbound_messages')
    .update({ status: 'pending', locked_at: null, error: 'Recovered after a stale sending lock', updated_at: new Date().toISOString() })
    .eq('status', 'sending')
    .lt('updated_at', staleBefore);
  if (recoveryError) console.error('[OUTBOUND] Failed to recover stale sending messages:', recoveryError);

  const { data: pending, error } = await supabase
    .rpc('claim_outbound_messages', { p_limit: 10 });

  if (error) {
    console.error('[OUTBOUND] Failed to fetch queue:', error);
    return;
  }
  if (!pending?.length) return;

  const mailboxIds = [...new Set(pending.map((msg: { mailbox_id: string }) => msg.mailbox_id))];
  const { data: mailboxes, error: mailboxError } = await supabase
    .from('mailboxes')
    .select('id, email_address, smtp_host, smtp_port, credential_vault_ref, display_name')
    .in('id', mailboxIds);
  if (mailboxError) {
    console.error('[OUTBOUND] Failed to load claimed message mailboxes:', mailboxError);
    return;
  }
  const mailboxesById = new Map((mailboxes ?? []).map(mailbox => [mailbox.id, mailbox]));

  for (const msg of pending) {
    const outbound = msg as Record<string, unknown>;
    const id = outbound.id as string;
    const mailbox = mailboxesById.get(outbound.mailbox_id as string) as {
      id: string;
      email_address: string;
      smtp_host: string;
      smtp_port: number;
      credential_vault_ref: string;
      display_name: string;
    };
    if (!mailbox) {
      await supabase.from('outbound_messages')
        .update({ status: 'failed', error: 'Mailbox no longer exists', locked_at: null, updated_at: new Date().toISOString() })
        .eq('id', id);
      continue;
    }

    try {
      const { messageId } = await sendOutboundEmail(
        {
          id,
          mailbox_id: outbound.mailbox_id as string,
          to_addresses: (outbound.to_addresses ?? []) as string[],
          cc_addresses: (outbound.cc_addresses ?? []) as string[],
          bcc_addresses: (outbound.bcc_addresses ?? []) as string[],
          subject: outbound.subject as string,
          body_html: outbound.body_html as string,
          reply_to_message_id: (outbound.reply_to_message_id ?? null) as string | null,
          attachments_json: outbound.attachments_json ?? [],
        },
        { ...mailbox, id: outbound.mailbox_id as string },
        'outbound',
      );

      await supabase.from('outbound_messages')
        .update({ status: 'sent', message_id: messageId, error: null, sent_at: new Date().toISOString(), locked_at: null, updated_at: new Date().toISOString() })
        .eq('id', id);
    } catch (err) {
      console.error(`[OUTBOUND] Failed to send ${id}:`, err);
      await supabase.from('outbound_messages')
        .update({ status: 'failed', error: String(err), locked_at: null, updated_at: new Date().toISOString() })
        .eq('id', id);
    }
  }
}

/** Track which mailbox IDs are already being synced to avoid duplicate connections */
const activeSyncIds = new Set<string>();

async function runMailboxLoop(mb: {
  id: string; email_address: string; imap_host: string;
  imap_port: number; credential_vault_ref: string;
}, retryDelayMs = 30000): Promise<void> {
  try {
    await syncMailbox(mb);
    // Normal completion (shouldn't happen while watchFolder is alive)
    console.log(`[SYNC] Sync ended normally for ${mb.email_address}`);
  } catch (err) {
    console.error(`[SYNC] Fatal error for ${mb.email_address}:`, err);
  } finally {
    activeSyncIds.delete(mb.id);
  }

  // Auto-reconnect with backoff
  console.log(`[SYNC] Reconnecting ${mb.email_address} in ${retryDelayMs / 1000}s`);
  await new Promise(r => setTimeout(r, retryDelayMs));
  await startMailboxSync(mb, Math.min(retryDelayMs * 2, 300000)); // cap at 5 min
}

function startMailboxSync(mb: {
  id: string; email_address: string; imap_host: string;
  imap_port: number; credential_vault_ref: string;
}, retryDelayMs = 30000): void {
  if (activeSyncIds.has(mb.id)) {
    console.log(`[SYNC] Already syncing ${mb.email_address}, skipping`);
    return;
  }
  activeSyncIds.add(mb.id);
  // Run the sync loop in the background so the caller isn't blocked
  runMailboxLoop(mb, retryDelayMs).catch(err => {
    console.error(`[SYNC] Unhandled loop error for ${mb.email_address}:`, err);
    activeSyncIds.delete(mb.id);
  });
}

/** Poll for any pending/error/stale-syncing mailboxes that should be (re)started */
async function pollPendingMailboxes(): Promise<void> {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data: pending } = await supabase
    .from('mailboxes')
    .select('id, email_address, imap_host, imap_port, credential_vault_ref')
    .not('credential_vault_ref', 'is', null)
    .or(`sync_status.in.(pending,error),and(sync_status.eq.syncing,last_synced_at.lt.${fiveMinAgo})`);

  if (!pending?.length) return;

  for (const mb of pending) {
    console.log(`[POLL] Found pending/stale mailbox: ${mb.email_address}`);
    await startMailboxSync(mb);
    await new Promise(r => setTimeout(r, 1500));
  }
}

/** Write heartbeat file for Docker/PM2/systemd health checks */
function writeHeartbeat(): void {
  try {
    const fs = require('fs');
    fs.writeFileSync('/tmp/sync-alive', new Date().toISOString());
  } catch {
    // ignore
  }
}

async function main(): Promise<void> {
  console.log('[INIT] Frimps Mail Sync Service starting...');
  const releaseProcessLock = acquireProcessLock();
  process.on('exit', releaseProcessLock);
  healthServer = startHealthServer();

  // Global safety net: log uncaught errors but keep process alive
  process.on('uncaughtException', err => console.error('[FATAL] Uncaught exception:', err));
  process.on('unhandledRejection', err => console.error('[FATAL] Unhandled rejection:', err));

  // Initial heartbeat
  writeHeartbeat();
  setInterval(writeHeartbeat, 10_000);

  // Load all credentialed mailboxes on startup (including 'syncing' which may be stale from a dead process)
  const { data: mailboxes, error } = await supabase
    .from('mailboxes')
    .select('id, email_address, imap_host, imap_port, credential_vault_ref')
    .not('credential_vault_ref', 'is', null)
    .in('sync_status', ['pending', 'active', 'error', 'syncing']);

  if (error) {
    console.error('[INIT] Failed to load mailboxes:', error);
    process.exit(1);
  }

  // Outbound send queue processor — run immediately then every 10 s
  processOutboundMessages().catch(err => console.error('[OUTBOUND] Error:', err));
  setInterval(() => {
    processOutboundMessages().catch(err => console.error('[OUTBOUND] Error:', err));
  }, OUTBOUND_POLL_INTERVAL);

  // Scheduled messages checker — run immediately then every 60 s
  processScheduledMessages().catch(err => console.error('[SCHEDULED] Error:', err));
  setInterval(() => {
    processScheduledMessages().catch(err => console.error('[SCHEDULED] Error:', err));
  }, SCHEDULED_CHECK_INTERVAL);

  // Calendar reminder scheduler (checks every 2 min)
  scheduleReminders(supabase);

  // Periodic re-poll: picks up mailboxes whose credentials were added while the service was running
  // or that failed and need retrying — even if the realtime event was missed
  setInterval(() => {
    pollPendingMailboxes().catch(err => console.error('[POLL] Error:', err));
  }, PENDING_POLL_INTERVAL);

  if (!mailboxes?.length) {
    console.log('[INIT] No credentialed mailboxes yet — waiting for credentials to be added...');
  } else {
    for (const mb of mailboxes) {
      await startMailboxSync(mb);
      await new Promise(r => setTimeout(r, 2000)); // stagger connections
    }
  }

  // Realtime: watch for new mailbox INSERTs and credential UPDATEs
  const channel = supabase
    .channel('mailbox-changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mailboxes' },
      async (payload) => {
        const mb = payload.new as {
          id: string; email_address: string; imap_host: string;
          imap_port: number; credential_vault_ref: string; sync_status: string;
        };
        if (mb.credential_vault_ref) {
          console.log(`[REALTIME] New mailbox with credentials: ${mb.email_address}`);
          await startMailboxSync(mb);
        }
      }
    )
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mailboxes' },
      async (payload) => {
        const mb = payload.new as {
          id: string; email_address: string; imap_host: string;
          imap_port: number; credential_vault_ref: string; sync_status: string;
        };
        const old = payload.old as { credential_vault_ref?: string };
        // Credentials were just added to a previously uncredentialed mailbox
        if (mb.credential_vault_ref && !old.credential_vault_ref && mb.sync_status === 'pending') {
          console.log(`[REALTIME] Credentials set for ${mb.email_address}, starting sync`);
          await startMailboxSync(mb);
        }
      }
    )
    .subscribe();

  // Realtime: auto-send ICS invites for newly created calendar events with external attendees
  supabase
    .channel('calendar-event-invites')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'calendar_events' },
      async (payload) => {
        const evt = payload.new as {
          id: string;
          title: string;
          agenda?: string | null;
          location?: string | null;
          start_at: string;
          end_at: string;
          recurrence_rule?: string | null;
          attendees?: string[] | null;
          organization_id: string;
          created_by: string;
        };
        if (!evt.attendees?.length) return;

        try {
          // Pick the creator's first active mailbox as the organizer/sender
          const { data: mailboxes, error: mbErr } = await supabase
            .from('mailboxes')
            .select('id, email_address, smtp_host, smtp_port, credential_vault_ref, display_name')
            .eq('staff_user_id', evt.created_by)
            .eq('sync_status', 'active')
            .not('credential_vault_ref', 'is', null)
            .order('created_at', { ascending: true })
            .limit(1);
          if (mbErr || !mailboxes?.length) {
            console.log(`[ICS] No active mailbox for event creator ${evt.created_by}, skipping invite`);
            return;
          }
          const mailbox = mailboxes[0] as unknown as SmtpMailbox;

          const { data: staff } = await supabase
            .from('staff_users')
            .select('full_name')
            .eq('id', evt.created_by)
            .single();

          const smtp = await getSmtpClient(mailbox);
          await sendIcsInvite(supabase, smtp, {
            id: evt.id,
            title: evt.title,
            agenda: evt.agenda ?? null,
            location: evt.location ?? null,
            start_at: evt.start_at,
            end_at: evt.end_at,
            recurrence_rule: evt.recurrence_rule ?? null,
            attendees: evt.attendees,
            organization_id: evt.organization_id,
          }, {
            email: mailbox.email_address,
            name: (staff as { full_name?: string | null } | null)?.full_name ?? null,
          });
        } catch (err) {
          console.error('[ICS] Auto-send invite failed:', err);
        }
      },
    )
    .subscribe();

  console.log('[INIT] Sync service running. Polling for pending mailboxes every 2 min.');

  process.on('SIGTERM', async () => {
    console.log('[SHUTDOWN] SIGTERM received, shutting down gracefully...');
    await channel.unsubscribe();
    if (healthServer) await new Promise<void>(resolve => healthServer!.close(() => resolve()));
    process.exit(0);
  });
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
