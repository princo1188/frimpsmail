// Quick Node.js diagnostic: connect to a mailbox and list recent INBOX messages
require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');
const { ImapFlow } = require('imapflow');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function diag(mailboxId) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: mailbox, error: mbErr } = await supabase
    .from('mailboxes')
    .select('*')
    .eq('id', mailboxId)
    .single();
  if (mbErr || !mailbox) throw mbErr || new Error('Mailbox not found');

  const { data: password, error: vaultErr } = await supabase
    .rpc('vault_read_secret', { secret_id: mailbox.credential_vault_ref });
  if (vaultErr) throw vaultErr;

  console.log(`\n=== ${mailbox.email_address} (${mailbox.imap_host}:${mailbox.imap_port}) ===`);

  const client = new ImapFlow({
    host: mailbox.imap_host,
    port: mailbox.imap_port,
    secure: true,
    auth: { user: mailbox.email_address, pass: password },
    logger: false,
    tls: { rejectUnauthorized: false, minVersion: 'TLSv1' },
    connectionTimeout: 20000,
    greetingTimeout: 10000,
  });

  await client.connect();
  const status = await client.status('INBOX', { messages: true, uidNext: true });
  console.log('INBOX status:', status);

  if (status.messages) {
    const lock = await client.getMailboxLock('INBOX');
    try {
      for await (const msg of client.fetch(`${Math.max(1, status.messages - 9)}:*`, { envelope: true, source: true })) {
        console.log(`- UID ${msg.uid}: ${msg.envelope.subject} | from: ${msg.envelope.from?.[0]?.address}`);
      }
    } finally {
      lock.release();
    }
  }

  await client.logout();
}

const id = process.argv[2] || 'd6e2e212-7131-4c61-8fe0-b6beeaead068';
diag(id).catch(err => { console.error(err); process.exit(1); });
