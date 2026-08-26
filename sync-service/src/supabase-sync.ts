import { SupabaseClient } from '@supabase/supabase-js';
import { normalizeFolder, getFolderDisplayName } from './folder-mapper';

export interface ParsedMessage {
  imapUid: number;
  imapUidvalidity: number;
  subject: string;
  fromAddress: string;
  fromName: string;
  toAddresses: string[];
  ccAddresses: string[];
  bccAddresses: string[];
  bodyHtml: string;
  bodyText: string;
  sentAt: Date;
  headers: Record<string, string>;
  attachments: Array<{
    filename: string;
    mimeType: string;
    sizeBytes: number;
    content: Buffer;
  }>;
  inboxFolderName: string;
  isRead: boolean;
  isSpamFolder: boolean;
}

/** Ensure mailbox_folders rows exist for a given IMAP folder list */
export async function syncFolders(
  supabase: SupabaseClient,
  mailboxId: string,
  imapFolderNames: string[],
): Promise<Map<string, string>> {
  const folderIdMap = new Map<string, string>(); // imap_name -> id

  for (const name of imapFolderNames) {
    const normalized = normalizeFolder(name);
    const displayName = getFolderDisplayName(name);

    const { data: existing, error: lookupError } = await supabase
      .from('mailbox_folders')
      .select('id')
      .eq('mailbox_id', mailboxId)
      .eq('imap_folder_name', name)
      .maybeSingle();
    if (lookupError) throw new Error(`Could not look up folder "${name}": ${lookupError.message}`);

    if (existing) {
      folderIdMap.set(name, existing.id);
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('mailbox_folders')
        .insert({ mailbox_id: mailboxId, imap_folder_name: name, normalized_type: normalized, display_name: displayName })
        .select('id')
        .single();
      if (insertError?.code === '23505') {
        const { data: concurrent, error: concurrentError } = await supabase
          .from('mailbox_folders').select('id')
          .eq('mailbox_id', mailboxId).eq('imap_folder_name', name).single();
        if (concurrentError || !concurrent) throw new Error(`Could not recover concurrent folder creation for "${name}"`);
        folderIdMap.set(name, concurrent.id);
      } else if (insertError || !inserted) {
        throw new Error(`Could not create folder "${name}": ${insertError?.message ?? 'no id returned'}`);
      } else {
        folderIdMap.set(name, inserted.id);
      }
    }
  }

  return folderIdMap;
}

/** Find or create a thread for a message, using In-Reply-To/References threading */
export async function findOrCreateThread(
  supabase: SupabaseClient,
  mailboxId: string,
  subject: string,
  fromAddress: string,
  toAddresses: string[],
  referencedMessageIds: string[],
  folderId: string | null,
  sentAt: Date,
): Promise<string> {
  // Try to find existing thread via message-id references
  for (const msgId of referencedMessageIds) {
    const { data: msg } = await supabase
      .from('messages')
      .select('thread_id')
      .contains('raw_headers', { 'message-id': msgId })
      .maybeSingle();
    if (msg?.thread_id) return msg.thread_id;
  }

  // Fallback: match by normalized subject
  const normalizedSubject = subject.replace(/^(re|fwd|fw):\s*/i, '').trim();
  if (normalizedSubject) {
    const { data: t } = await supabase
      .from('threads')
      .select('id')
      .eq('mailbox_id', mailboxId)
      .ilike('subject', `%${normalizedSubject}%`)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (t) return t.id;
  }

  // Create new thread
  const participants = [...new Set([fromAddress, ...toAddresses])];
  const { data: newThread } = await supabase
    .from('threads')
    .insert({
      mailbox_id: mailboxId,
      subject,
      participants,
      last_message_at: sentAt.toISOString(),
      folder_id: folderId,
      is_read: false,
      is_starred: false,
      labels: [],
    })
    .select('id')
    .single();

  if (!newThread) throw new Error('Failed to create thread');
  return newThread.id;
}

/** Insert a message into DB (skip if duplicate by IMAP UID) */
export async function insertMessage(
  supabase: SupabaseClient,
  mailboxId: string,
  threadId: string,
  msg: ParsedMessage,
  folderId: string | null,
): Promise<string | null> {
  // Check for duplicate
  const { data: existing } = await supabase
    .from('messages')
    .select('id')
    .eq('mailbox_id', mailboxId)
    .eq('imap_uid', msg.imapUid)
    .eq('imap_uidvalidity', msg.imapUidvalidity)
    .maybeSingle();

  if (existing) return null; // Already stored

  const spamStatus = msg.isSpamFolder ? 'confirmed_spam' : 'clean';

  const { data: inserted, error } = await supabase
    .from('messages')
    .insert({
      thread_id: threadId,
      mailbox_id: mailboxId,
      imap_uid: msg.imapUid,
      imap_uidvalidity: msg.imapUidvalidity,
      from_address: msg.fromAddress,
      from_name: msg.fromName,
      to_addresses: msg.toAddresses,
      cc_addresses: msg.ccAddresses,
      bcc_addresses: msg.bccAddresses,
      subject: msg.subject,
      body_html: msg.bodyHtml,
      body_text: msg.bodyText,
      sent_at: msg.sentAt.toISOString(),
      is_read: msg.isRead,
      is_flagged: false,
      spam_status: spamStatus,
      raw_headers: msg.headers,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Could not store IMAP message ${msg.imapUid}: ${error.message}`);
  return inserted?.id ?? null;
}

/** Upload attachments to Supabase Storage and create attachment rows */
export async function storeAttachments(
  supabase: SupabaseClient,
  mailboxId: string,
  messageId: string,
  attachments: ParsedMessage['attachments'],
): Promise<void> {
  for (const att of attachments) {
    const safeFilename = att.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `attachments/${mailboxId}/${messageId}/${safeFilename}`;
    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(storagePath, att.content, { contentType: att.mimeType, upsert: true });
    if (uploadError) throw new Error(`Could not upload attachment ${att.filename}: ${uploadError.message}`);

    const { error: attachmentError } = await supabase.from('attachments').insert({
      message_id: messageId,
      storage_path: storagePath,
      filename: att.filename,
      mime_type: att.mimeType,
      size_bytes: att.sizeBytes,
    });
    if (attachmentError) throw new Error(`Could not record attachment ${att.filename}: ${attachmentError.message}`);
  }
}

/** Apply any matching rules for a new message */
export async function applyRules(
  supabase: SupabaseClient,
  mailboxId: string,
  messageId: string,
  message: ParsedMessage,
): Promise<void> {
  const { data: rules } = await supabase
    .from('rules')
    .select('*')
    .eq('mailbox_id', mailboxId)
    .eq('is_active', true);

  if (!rules?.length) return;

  for (const rule of rules) {
    const cond = rule.condition_json as { from_contains?: string; subject_contains?: string };
    const action = rule.action_json as { mark_as_read?: boolean; add_label?: string; move_to_folder?: string };

    const matches =
      (!cond.from_contains || message.fromAddress.includes(cond.from_contains)) &&
      (!cond.subject_contains || message.subject.includes(cond.subject_contains));

    if (!matches) continue;

    if (action.mark_as_read) {
      await supabase.from('messages').update({ is_read: true }).eq('id', messageId);
    }

    if (action.move_to_folder) {
      const { data: folder } = await supabase
        .from('mailbox_folders')
        .select('id')
        .eq('mailbox_id', mailboxId)
        .eq('normalized_type', action.move_to_folder)
        .maybeSingle();

      if (folder) {
        await supabase.from('threads')
          .update({ folder_id: folder.id })
          .eq('id', (await supabase.from('messages').select('thread_id').eq('id', messageId).single()).data?.thread_id);
      }
    }

    if (action.add_label) {
      const { data: thread } = await supabase
        .from('messages')
        .select('thread_id')
        .eq('id', messageId)
        .single();
      if (thread) {
        const { data: t } = await supabase
          .from('threads')
          .select('labels')
          .eq('id', thread.thread_id)
          .single();
        if (t) {
          const labels = [...(t.labels ?? []), action.add_label];
          await supabase.from('threads').update({ labels }).eq('id', thread.thread_id);
        }
      }
    }
  }
}
