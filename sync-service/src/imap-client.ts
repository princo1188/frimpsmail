import { ImapFlow } from 'imapflow';
import { SupabaseClient } from '@supabase/supabase-js';
import type { ParsedMessage } from './supabase-sync';

export interface MailboxConfig {
  id: string;
  emailAddress: string;
  imapHost: string;
  imapPort: number;
  password: string;
}

/** Parse addressList string "Name <email>, Name2 <email2>" → email array */
function parseAddresses(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(',').map(a => {
    const m = a.match(/<([^>]+)>/);
    return (m ? m[1] : a).trim();
  }).filter(Boolean);
}

/** Parse headers object from ImapFlow into flat Record<string,string> */
function flattenHeaders(headers: Headers | Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  if (headers instanceof Headers) {
    headers.forEach((v, k) => { out[k.toLowerCase()] = v; });
  } else {
    for (const [k, v] of Object.entries(headers)) {
      out[k.toLowerCase()] = String(v);
    }
  }
  return out;
}

export class ImapClient {
  private client: ImapFlow;
  private config: MailboxConfig;
  private supabase: SupabaseClient;

  constructor(config: MailboxConfig, supabase: SupabaseClient) {
    this.config = config;
    this.supabase = supabase;
    this.client = new ImapFlow({
      host: config.imapHost,
      port: config.imapPort,
      secure: config.imapPort === 993,
      auth: { user: config.emailAddress, pass: config.password },
      logger: false,
      // Never accept an untrusted certificate: this connection carries mailbox
      // credentials and unencrypted message content.
      tls: { rejectUnauthorized: true },
      // Longer timeouts for cPanel shared hosting which can be slow
      connectionTimeout: 60000,
      greetingTimeout: 30000,
      socketTimeout: 120000,
    });
  }

  async connect(): Promise<void> {
    await this.client.connect();
    // Mark alive for health check
    require('fs').writeFileSync('/tmp/sync-alive', Date.now().toString());
  }

  async disconnect(): Promise<void> {
    try { await this.client.logout(); } catch { /* ignore */ }
  }

  async listFolders(): Promise<string[]> {
    const folders = await this.client.list();
    return folders.map(f => f.path);
  }

  /** Backfill messages from the last N days in a given folder */
  async backfill(
    folderName: string,
    daysBack: number,
    onMessage: (msg: ParsedMessage) => Promise<void>,
  ): Promise<void> {
    const lock = await this.client.getMailboxLock(folderName);
    try {
      const since = new Date();
      since.setDate(since.getDate() - daysBack);

      const mailboxObj = this.client.mailbox;
      const uidValidity = mailboxObj ? Number(mailboxObj.uidValidity) : 0;

      for await (const msg of this.client.fetch(
        { since },
        { uid: true, bodyStructure: true, headers: true, envelope: true, bodyParts: ['TEXT'] }
      )) {
        try {
          const headers = flattenHeaders(msg.headers as unknown as Record<string, string>);
          const envelope = msg.envelope;

          const parsed: ParsedMessage = {
            imapUid: msg.uid,
            imapUidvalidity: Number(uidValidity),
            subject: envelope?.subject ?? '(no subject)',
            fromAddress: envelope?.from?.[0]?.address ?? '',
            fromName: envelope?.from?.[0]?.name ?? envelope?.from?.[0]?.address ?? '',
            toAddresses: envelope?.to?.map((a) => a.address ?? '').filter(Boolean) ?? [],
            ccAddresses: envelope?.cc?.map((a) => a.address ?? '').filter(Boolean) ?? [],
            bccAddresses: envelope?.bcc?.map((a) => a.address ?? '').filter(Boolean) ?? [],
            bodyHtml: '',
            bodyText: '',
            sentAt: envelope?.date ?? new Date(),
            headers,
            attachments: [],
            inboxFolderName: folderName,
            isRead: msg.flags?.has('\\Seen') ?? false,
            isSpamFolder: ['junk', 'spam'].includes(folderName.toLowerCase()),
          };

          // Try to get HTML body
          const htmlPart = msg.bodyParts?.get('TEXT');
          if (htmlPart) {
            const text = Buffer.from(htmlPart as Uint8Array).toString('utf8');
            if (text.includes('<')) {
              parsed.bodyHtml = text;
              parsed.bodyText = text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
            } else {
              parsed.bodyText = text;
            }
          }

          await onMessage(parsed);
        } catch (err) {
          console.error(`[IMAP] Error processing message uid=${msg.uid}:`, err);
        }
      }
    } finally {
      lock.release();
    }
  }

  private parseMessage(msg: any, folderName: string): ParsedMessage {
    const envelope = msg.envelope;
    const headers = flattenHeaders(msg.headers as unknown as Record<string, string>);
    const parsed: ParsedMessage = {
      imapUid: msg.uid,
      imapUidvalidity: 0,
      subject: envelope?.subject ?? '(no subject)',
      fromAddress: envelope?.from?.[0]?.address ?? '',
      fromName: envelope?.from?.[0]?.name ?? envelope?.from?.[0]?.address ?? '',
      toAddresses: envelope?.to?.map((a: any) => a.address ?? '').filter(Boolean) ?? [],
      ccAddresses: envelope?.cc?.map((a: any) => a.address ?? '').filter(Boolean) ?? [],
      bccAddresses: envelope?.bcc?.map((a: any) => a.address ?? '').filter(Boolean) ?? [],
      bodyHtml: '',
      bodyText: '',
      sentAt: envelope?.date ?? new Date(),
      headers,
      attachments: [],
      inboxFolderName: folderName,
      isRead: msg.flags?.has('\\Seen') ?? false,
      isSpamFolder: ['junk', 'spam'].includes(folderName.toLowerCase()),
    };
    const htmlPart = msg.bodyParts?.get('TEXT');
    if (htmlPart) {
      const text = Buffer.from(htmlPart as Uint8Array).toString('utf8');
      if (text.includes('<')) {
        parsed.bodyHtml = text;
        parsed.bodyText = text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      } else {
        parsed.bodyText = text;
      }
    }
    return parsed;
  }

  /** Poll multiple folders sequentially on one connection. Returns only on error. */
  async watchFolders(
    folderNames: string[],
    onMessage: (msg: ParsedMessage) => Promise<void>,
    pollIntervalMs = 30000,
  ): Promise<void> {
    if (!folderNames.length) throw new Error('watchFolders: no folder names provided');

    // Seed last seen UID + UIDVALIDITY per folder (skip empty folders)
    const folderState = new Map<string, { lastSeenUid: number; uidValidity: number; isEmpty: boolean }>();
    for (const folderName of folderNames) {
      let isEmpty = false;
      try {
        const status = await this.client.status(folderName, { messages: true, uidNext: true, uidValidity: true });
        const msgCount = Number(status.messages ?? 0);
        if (msgCount === 0) {
          folderState.set(folderName, { lastSeenUid: 0, uidValidity: Number(status.uidValidity ?? 0), isEmpty: true });
          console.log(`[IMAP] Folder ${folderName} is empty, skipping UID seed`);
          continue;
        }
      } catch (err) {
        console.warn(`[IMAP] Could not get status for ${folderName}:`, err);
      }

      try {
        const lock = await this.client.getMailboxLock(folderName);
        try {
          const mailboxObj = this.client.mailbox;
          const uidValidity = mailboxObj ? Number(mailboxObj.uidValidity) : 0;
          let lastSeenUid = 0;
          for await (const msg of this.client.fetch('1:*', { uid: true })) {
            if (msg.uid && msg.uid > lastSeenUid) lastSeenUid = msg.uid;
          }
          folderState.set(folderName, { lastSeenUid, uidValidity, isEmpty: false });
        } finally {
          lock.release();
        }
      } catch (err) {
        console.warn(`[IMAP] Could not seed state for ${folderName}:`, err);
        folderState.set(folderName, { lastSeenUid: 0, uidValidity: 0, isEmpty: true });
      }
    }

    console.log(`[IMAP] Polling ${folderNames.length} folder(s) every ${pollIntervalMs / 1000}s: ${folderNames.join(', ')}`);

    let connectionAlive = true;
    this.client.on('error', (err: Error) => {
      console.error('[IMAP] Connection error:', err);
      connectionAlive = false;
    });
    this.client.on('close', () => {
      console.error('[IMAP] Connection closed');
      connectionAlive = false;
    });

    const pollTimer = setInterval(async () => {
      if (!connectionAlive || !this.client.authenticated) {
        console.log('[IMAP] Multi-folder poll ending: connection dead');
        clearInterval(pollTimer);
        return;
      }
      for (const folderName of folderNames) {
        const state = folderState.get(folderName) ?? { lastSeenUid: 0, uidValidity: 0, isEmpty: false };
        try {
          const status = await this.client.status(folderName, { messages: true, uidValidity: true });
          const msgCount = Number(status.messages ?? 0);
          if (msgCount === 0) {
            folderState.set(folderName, { lastSeenUid: 0, uidValidity: Number(status.uidValidity ?? 0), isEmpty: true });
            continue;
          }
        } catch (err) {
          console.warn(`[IMAP] Could not get status for ${folderName} during poll:`, err);
          continue;
        }

        try {
          const lock = await this.client.getMailboxLock(folderName);
          try {
            // Refresh UIDVALIDITY in case it changed
            const mailboxObj = this.client.mailbox;
            const uidValidity = mailboxObj ? Number(mailboxObj.uidValidity) : state.uidValidity;

            let maxUid = state.lastSeenUid;
            let found = 0;
            for await (const msg of this.client.fetch(
              { uid: `${state.lastSeenUid + 1}:*` },
              { uid: true, bodyStructure: true, headers: true, envelope: true, bodyParts: ['TEXT'] }
            )) {
              if (msg.uid && msg.uid > state.lastSeenUid) {
                maxUid = Math.max(maxUid, msg.uid);
                found++;
                try {
                  const parsed = this.parseMessage(msg, folderName);
                  parsed.imapUidvalidity = uidValidity;
                  await onMessage(parsed);
                } catch (err) {
                  console.error(`[IMAP] Error processing UID ${msg.uid} in ${folderName}:`, err);
                }
              }
            }
            if (found) {
              console.log(`[IMAP] Polled ${found} new message(s) in ${folderName}`);
              folderState.set(folderName, { lastSeenUid: maxUid, uidValidity, isEmpty: false });
            }
          } finally {
            lock.release();
          }
        } catch (err) {
          console.error(`[IMAP] Poll error for ${folderName}:`, err);
          connectionAlive = false;
          return;
        }
      }
    }, pollIntervalMs);

    // Block until connection dies
    while (connectionAlive) {
      await new Promise(r => setTimeout(r, 5000));
    }
    clearInterval(pollTimer);
    throw new Error('IMAP connection lost');
  }

  /** Deprecated: single-folder watch kept for backwards compatibility */
  async watchFolder(
    folderName: string,
    onMessage: (msg: ParsedMessage) => Promise<void>,
    pollIntervalMs = 30000,
  ): Promise<void> {
    await this.watchFolders([folderName], onMessage, pollIntervalMs);
  }

  async fetchByUid(
    folderName: string,
    uid: number,
    uidValidity: number,
    onMessage: (msg: ParsedMessage) => Promise<void>,
  ): Promise<void> {
    const lock = await this.client.getMailboxLock(folderName);
    try {
      for await (const msg of this.client.fetch(
        { uid: `${uid}:${uid}` },
        { uid: true, bodyStructure: true, headers: true, envelope: true, bodyParts: ['TEXT'] }
      )) {
        const headers = flattenHeaders(msg.headers as unknown as Record<string, string>);
        const envelope = msg.envelope;
        const parsed: ParsedMessage = {
          imapUid: msg.uid,
          imapUidvalidity: uidValidity,
          subject: envelope?.subject ?? '(no subject)',
          fromAddress: envelope?.from?.[0]?.address ?? '',
          fromName: envelope?.from?.[0]?.name ?? '',
          toAddresses: envelope?.to?.map((a) => a.address ?? '').filter(Boolean) ?? [],
          ccAddresses: [],
          bccAddresses: [],
          bodyHtml: '',
          bodyText: '',
          sentAt: envelope?.date ?? new Date(),
          headers,
          attachments: [],
          inboxFolderName: folderName,
          isRead: msg.flags?.has('\\Seen') ?? false,
          isSpamFolder: ['junk', 'spam'].includes(folderName.toLowerCase()),
        };

        const htmlPart = msg.bodyParts?.get('TEXT');
        if (htmlPart) {
          const text = Buffer.from(htmlPart as Uint8Array).toString('utf8');
          parsed.bodyHtml = text.includes('<') ? text : '';
          parsed.bodyText = text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        }

        await onMessage(parsed);
      }
    } finally {
      lock.release();
    }
  }
}
