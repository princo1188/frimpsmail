import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getCredential } from './credential-vault';
import { ImapClient } from './imap-client';
import { processMessage } from './message-processor';
import { syncFolders } from './supabase-sync';

const workerId = randomUUID();
const batchLimit = Math.min(Math.max(Number.parseInt(process.env.SYNC_BATCH_LIMIT ?? '5', 10) || 5, 1), 25);
const daysBack = Math.min(Math.max(Number.parseInt(process.env.BACKFILL_DAYS ?? '7', 10) || 7, 1), 90);

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: mailboxes, error: claimError } = await supabase.rpc('claim_mailboxes', {
    p_worker_id: workerId,
    p_limit: batchLimit,
    p_lease_seconds: Number.parseInt(process.env.SYNC_LEASE_SECONDS ?? '300', 10) || 300,
  });
  if (claimError) throw new Error(`Mailbox claim failed: ${claimError.message}`);

  let failures = 0;
  for (const mailbox of mailboxes ?? []) {
    let client: ImapClient | undefined;
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
        await supabase.from('mailbox_folders').update({
          uid_validity: result.uidValidity,
          last_seen_uid: result.maxUid,
          last_successful_sync_at: new Date().toISOString(),
        }).eq('mailbox_id', mailbox.id).eq('imap_folder_name', folderName);
      }

      const { error } = await supabase.from('mailboxes').update({
        sync_status: 'active', last_synced_at: new Date().toISOString(), last_error: null,
        sync_worker_id: null, sync_lease_until: null,
      }).eq('id', mailbox.id).eq('sync_worker_id', workerId);
      if (error) throw new Error(`Could not complete mailbox lease: ${error.message}`);
    } catch (error) {
      failures += 1;
      const message = error instanceof Error ? error.message : String(error);
      await supabase.from('mailboxes').update({
        sync_status: 'error', last_error: message.slice(0, 2000), sync_worker_id: null, sync_lease_until: null,
      }).eq('id', mailbox.id).eq('sync_worker_id', workerId);
      console.error(JSON.stringify({ level: 'error', workerId, mailboxId: mailbox.id, error: message }));
    } finally {
      await client?.disconnect();
    }
  }

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
