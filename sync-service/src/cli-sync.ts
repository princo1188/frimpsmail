import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getCredential } from './credential-vault';
import { ImapClient } from './imap-client';
import { processMessage } from './message-processor';
import { syncFolders } from './supabase-sync';

const workerId = randomUUID();
const batchLimit = Math.min(Math.max(Number.parseInt(process.env.SYNC_BATCH_LIMIT ?? '5', 10) || 5, 1), 25);
const daysBack = Math.min(Math.max(Number.parseInt(process.env.BACKFILL_DAYS ?? '7', 10) || 7, 1), 90);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function releaseLease(
  supabase: SupabaseClient<any>,
  mailboxId: string,
  status: 'active' | 'error',
  error: string | null,
): Promise<void> {
  const { error: releaseError } = await supabase.from('mailboxes').update({
    sync_status: status,
    last_synced_at: status === 'active' ? new Date().toISOString() : undefined,
    last_error: error,
    sync_worker_id: null,
    sync_lease_until: null,
  }).eq('id', mailboxId).eq('sync_worker_id', workerId);

  if (releaseError) throw new Error(`Could not release mailbox lease: ${releaseError.message}`);
}

async function main(): Promise<number> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let failures = 0;
  // The project has not generated a Supabase database type yet; retain the
  // RPC row shape so the outer finally can release every claim.
  let claimedMailboxes: any[] = [];
  const finalizedMailboxIds = new Set<string>();

  try {
    const { data: mailboxes, error: claimError } = await supabase.rpc('claim_mailboxes', {
      p_worker_id: workerId,
      p_limit: batchLimit,
      p_lease_seconds: Number.parseInt(process.env.SYNC_LEASE_SECONDS ?? '300', 10) || 300,
    });
    if (claimError) throw new Error(`Mailbox claim failed: ${claimError.message}`);
    claimedMailboxes = mailboxes ?? [];

    for (const mailbox of claimedMailboxes) {
      let client: ImapClient | undefined;
      let mailboxError: string | null = null;

      try {
        const password = await getCredential(supabase, mailbox.credential_vault_ref);
        client = new ImapClient({
          id: mailbox.id,
          emailAddress: mailbox.email_address,
          imapHost: mailbox.imap_host,
          imapPort: mailbox.imap_port,
          password,
        }, supabase);
        await client.connect();
        const folderNames = await client.listFolders();
        const folderIds = await syncFolders(supabase, mailbox.id, folderNames);

        for (const folderName of folderNames) {
          const result = await client.backfill(folderName, daysBack, (message) =>
            processMessage(supabase, mailbox.id, folderIds, message),
          );
          if (result.failed > 0) throw new Error(`${result.failed} message(s) failed in ${folderName}`);
          const { error } = await supabase.from('mailbox_folders').update({
            uid_validity: result.uidValidity,
            last_seen_uid: result.maxUid,
            last_successful_sync_at: new Date().toISOString(),
          }).eq('mailbox_id', mailbox.id).eq('imap_folder_name', folderName);
          if (error) throw new Error(`Could not update folder cursor: ${error.message}`);
        }
      } catch (error) {
        mailboxError = errorMessage(error).slice(0, 2000);
        failures += 1;
        console.error(JSON.stringify({ level: 'error', workerId, mailboxId: mailbox.id, error: mailboxError }));
      } finally {
        try {
          await client?.disconnect();
        } catch (error) {
          const cleanupError = `IMAP cleanup failed: ${errorMessage(error)}`.slice(0, 2000);
          mailboxError ??= cleanupError;
          if (mailboxError === cleanupError) failures += 1;
          console.error(JSON.stringify({ level: 'error', workerId, mailboxId: mailbox.id, error: cleanupError }));
        }

        try {
          await releaseLease(supabase, mailbox.id, mailboxError ? 'error' : 'active', mailboxError);
          finalizedMailboxIds.add(mailbox.id);
        } catch (error) {
          failures += 1;
          console.error(JSON.stringify({ level: 'error', workerId, mailboxId: mailbox.id, error: errorMessage(error) }));
        }
      }
    }
  } finally {
    // Covers a future parallel batch implementation as well as a fatal error
    // between mailbox iterations. Each client force-closes after three seconds.
    await ImapClient.disconnectAll();

    for (const mailbox of claimedMailboxes) {
      if (finalizedMailboxIds.has(mailbox.id)) continue;
      failures += 1;
      const interruptedMessage = 'Batch interrupted before mailbox sync completed.';
      try {
        await releaseLease(supabase, mailbox.id, 'error', interruptedMessage);
        finalizedMailboxIds.add(mailbox.id);
      } catch (error) {
        console.error(JSON.stringify({ level: 'error', workerId, mailboxId: mailbox.id, error: errorMessage(error) }));
      }
    }
  }

  return failures === 0 ? 0 : 1;
}

process.on('unhandledRejection', (error) => {
  console.error(error);
  process.exitCode = 1;
});

void main().then(
  (exitCode) => { process.exitCode = exitCode; },
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
