import { ImapFlow } from 'imapflow';
import { SupabaseClient } from '@supabase/supabase-js';
import type { ParsedMessage } from './supabase-sync';

export interface MailboxConfig {
  id: string;
  emailAddress: string;
  imapHost: string;
  imapPort: number;
  password: string;
  tlsServerName?: string;
}

export interface BackfillResult {
  fetched: number;
  imported: number;
  failed: number;
  maxUid: number;
  uidValidity: number;
}

type ImapErrorLike = Error & {
  code?: string;
  errno?: string | number;
  syscall?: string;
  address?: string;
  port?: number;
  command?: string;
  response?: unknown;
  serverResponseCode?: string;
  authenticationFailed?: boolean;
  cause?: unknown;
};

function serialiseImapError(
  error: unknown,
  context: { operation: string; host: string; port: number; folder?: string },
): string {
  const err = error as ImapErrorLike;
  const cause = err?.cause as Partial<ImapErrorLike> | undefined;
  const details = {
    operation: context.operation,
    folder: context.folder,
    host: context.host,
    port: context.port,
    message: err?.message ?? String(error),
    command: err?.command,
    server_response: typeof err?.response === 'string' ? err.response : undefined,
    server_response_code: err?.serverResponseCode,
    authentication_failed: err?.authenticationFailed,
    socket_code: err?.code ?? cause?.code,
    socket_errno: err?.errno ?? cause?.errno,
    socket_syscall: err?.syscall ?? cause?.syscall,
    socket_address: err?.address ?? cause?.address,
    socket_port: err?.port ?? cause?.port,
    cause: cause?.message,
  };
  return `[IMAP] ${JSON.stringify(details)}`;
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
  private static readonly activeClients = new Set<ImapClient>();
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
      tls: {
        rejectUnauthorized: true,
        servername: config.tlsServerName ?? config.imapHost,
        minVersion: 'TLSv1.2',
      },
      connectionTimeout: 20_000,
      greetingTimeout: 15_000,
      socketTimeout: 60_000,
    });
  }

  private commandError(operation: string, error: unknown, folder?: string): Error {
    const message = serialiseImapError(error, {
      operation,
      host: this.config.imapHost,
      port: this.config.imapPort,
      folder,
    });
    console.error(message);
    return new Error(message);
  }

  private isUnavailableFolder(error: unknown): boolean {
    const err = error as ImapErrorLike;
    const response = `${err?.serverResponseCode ?? ''} ${typeof err?.response === 'string' ? err.response : ''} ${err?.message ?? ''}`.toUpperCase();
    return /NONEXISTENT|NOSELECT|NOT[ _-]?FOUND|MAILBOX.*(?:NOT|DOESN'T).*EXIST/.test(response);
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
    } catch (error) {
      throw this.commandError('CONNECT/AUTH', error);
    }
    ImapClient.activeClients.add(this);
    require('fs').writeFileSync('/tmp/sync-alive', new Date().toISOString());
  }

  async disconnect(): Promise<void> {
    try { await this.client.logout(); } catch { /* ignore */ }
    ImapClient.activeClients.delete(this);
  }

  static async disconnectAll(): Promise<void> {
    await Promise.allSettled([...ImapClient.activeClients].map((client) => client.disconnect()));
  }

  async listFolders(): Promise<string[]> {
    try {
      const folders = await this.client.list();
      const selectableFolders = folders.filter(folder => !folder.flags?.has('\\Noselect'));
      const skipped = folders.filter(folder => folder.flags?.has('\\Noselect')).map(folder => folder.path);
      if (skipped.length) console.warn(`[IMAP] Skipping non-selectable folders: ${skipped.join(', ')}`);
      return selectableFolders.map(folder => folder.path);
    } catch (error) {
      throw this.commandError('LIST', error);
    }
  }

  /** Extract MIME attachment parts from an IMAP BODYSTRUCTURE tree. */
  private attachmentParts(node: any, path = ''): Array<{ part: string; filename: string; mimeType: string }> {
    if (!node) return [];
    const children = node.childNodes ?? node.children ?? [];
    if (Array.isArray(children) && children.length) {
      return children.flatMap((child, index) => this.attachmentParts(
        child,
        child.part ?? (path ? `${path}.${index + 1}` : String(index + 1)),
      ));
    }

    const disposition = String(node.disposition ?? '').toLowerCase();
    const filename = node.dispositionParameters?.filename ?? node.parameters?.name ?? node.filename;
    const part = node.part ?? path;
    if (!part || (!filename && disposition !== 'attachment')) return [];

    const safeFilename = String(filename ?? `attachment-${part}`).replace(/[\\/:*?"<>|\x00-\x1F]/g, '_');
    return [{
      part,
      filename: safeFilename || `attachment-${part}`,
      mimeType: `${node.type ?? 'application'}/${node.subtype ?? 'octet-stream'}`.toLowerCase(),
    }];
  }

  /** Download MIME attachment bodies while enforcing the private bucket limit. */
  private async fetchAttachments(uid: number, bodyStructure: unknown): Promise<ParsedMessage['attachments']> {
    const parts = this.attachmentParts(bodyStructure);
    const attachments: ParsedMessage['attachments'] = [];
    const maxAttachmentBytes = 25 * 1024 * 1024;
    const maxMessageBytes = 50 * 1024 * 1024;
    let messageBytes = 0;

    for (const descriptor of parts) {
      const download = await this.client.download(uid, descriptor.part, { uid: true });
      const chunks: Buffer[] = [];
      let sizeBytes = 0;
      for await (const chunk of download.content) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        sizeBytes += buffer.length;
        messageBytes += buffer.length;
        if (sizeBytes > maxAttachmentBytes || messageBytes > maxMessageBytes) {
          throw new Error(`Attachment budget exceeded for UID ${uid}`);
        }
        chunks.push(buffer);
      }
      attachments.push({
        filename: descriptor.filename,
        mimeType: descriptor.mimeType,
        sizeBytes,
        content: Buffer.concat(chunks),
      });
    }
    return attachments;
  }

  /** Backfill messages from the last N days in a given folder */
  async backfill(
    folderName: string,
    daysBack: number,
    onMessage: (msg: ParsedMessage) => Promise<void>,
  ): Promise<BackfillResult> {
    const lock = await this.client.getMailboxLock(folderName);
    try {
      const since = new Date();
      since.setDate(since.getDate() - daysBack);

      const mailboxObj = this.client.mailbox;
      const uidValidity = mailboxObj ? Number(mailboxObj.uidValidity) : 0;
      const result: BackfillResult = { fetched: 0, imported: 0, failed: 0, maxUid: 0, uidValidity };

      for await (const msg of this.client.fetch(
        { since },
        { uid: true, bodyStructure: true, headers: true, envelope: true, bodyParts: ['TEXT'] }
      )) {
        result.fetched += 1;
        result.maxUid = Math.max(result.maxUid, Number(msg.uid ?? 0));
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
            attachments: await this.fetchAttachments(msg.uid, msg.bodyStructure),
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
          result.imported += 1;
        } catch (err) {
          result.failed += 1;
          console.error(`[IMAP] Error processing message uid=${msg.uid}:`, err);
        }
      }
      return result;
    } finally {
      lock.release();
    }
  }

  private async parseMessage(msg: any, folderName: string): Promise<ParsedMessage> {
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
      attachments: await this.fetchAttachments(msg.uid, msg.bodyStructure),
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
    onPollSuccess?: () => Promise<void>,
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
        this.commandError('STATUS (seed)', err, folderName);
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
        this.commandError('SELECT/FETCH (seed)', err, folderName);
        folderState.set(folderName, { lastSeenUid: 0, uidValidity: 0, isEmpty: true });
      }
    }

    console.log(`[IMAP] Polling ${folderNames.length} folder(s) every ${pollIntervalMs / 1000}s: ${folderNames.join(', ')}`);

    let connectionAlive = true;
    let terminalError: Error | null = null;
    this.client.on('error', (err: Error) => {
      terminalError = this.commandError('SOCKET', err);
      connectionAlive = false;
    });
    this.client.on('close', () => {
      console.error('[IMAP] Connection closed');
      terminalError ??= new Error('[IMAP] Connection closed by server or socket');
      connectionAlive = false;
    });

    let consecutivePollFailures = 0;
    const unavailableFolders = new Set<string>();
    while (connectionAlive && this.client.authenticated) {
      let pollSuccessful = true;
      for (const folderName of folderNames) {
        if (unavailableFolders.has(folderName)) continue;
        const state = folderState.get(folderName) ?? { lastSeenUid: 0, uidValidity: 0, isEmpty: false };
        try {
          const status = await this.client.status(folderName, { messages: true, uidValidity: true });
          const msgCount = Number(status.messages ?? 0);
          if (msgCount === 0) {
            folderState.set(folderName, { lastSeenUid: 0, uidValidity: Number(status.uidValidity ?? 0), isEmpty: true });
            continue;
          }
        } catch (err) {
          this.commandError('STATUS (poll)', err, folderName);
          if (this.isUnavailableFolder(err)) {
            unavailableFolders.add(folderName);
            console.warn(`[IMAP] Disabling unavailable folder ${folderName} until the next reconnect`);
            continue;
          }
          pollSuccessful = false;
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
                  const parsed = await this.parseMessage(msg, folderName);
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
          terminalError = this.commandError('SELECT/FETCH (poll)', err, folderName);
          connectionAlive = false;
          break;
        }
      }
      // A successful empty poll is still proof the watcher is healthy.
      if (connectionAlive && pollSuccessful) {
        await onPollSuccess?.();
        consecutivePollFailures = 0;
      } else {
        consecutivePollFailures += 1;
      }

      if (!connectionAlive || !this.client.authenticated) break;

      const delayMs = pollSuccessful
        ? pollIntervalMs
        : Math.min(pollIntervalMs * 2 ** consecutivePollFailures, 5 * 60_000);
      if (!pollSuccessful) {
        console.warn(`[IMAP] Poll failed; retrying in ${Math.round(delayMs / 1000)}s`);
      }
      await new Promise<void>(resolve => setTimeout(resolve, delayMs));
    }
    console.log('[IMAP] Multi-folder poll ending: connection dead');
    throw terminalError ?? new Error('[IMAP] Connection lost without an error event');
  }

  /** Deprecated: single-folder watch kept for backwards compatibility */
  async watchFolder(
    folderName: string,
    onMessage: (msg: ParsedMessage) => Promise<void>,
    pollIntervalMs = 30000,
    onPollSuccess?: () => Promise<void>,
  ): Promise<void> {
    await this.watchFolders([folderName], onMessage, pollIntervalMs, onPollSuccess);
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
          attachments: await this.fetchAttachments(msg.uid, msg.bodyStructure),
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
