import { SupabaseClient } from '@supabase/supabase-js';
import { applyRules, findOrCreateThread, insertMessage, storeAttachments, type ParsedMessage } from './supabase-sync';
import { analyzeSpamHeaders, analyzeSpamWithAI, needsAISecondPass } from './spam-detector';

export async function processMessage(
  supabase: SupabaseClient,
  mailboxId: string,
  folderIdMap: Map<string, string>,
  msg: ParsedMessage,
  onImported?: () => Promise<void>,
): Promise<void> {
  const folderId = folderIdMap.get(msg.inboxFolderName) ?? null;
  const referencedIds = [msg.headers['in-reply-to'], ...(msg.headers.references?.split(/\s+/) ?? [])].filter(Boolean);
  const threadId = await findOrCreateThread(
    supabase, mailboxId, msg.subject, msg.fromAddress, msg.toAddresses, referencedIds, folderId, msg.sentAt,
  );
  const messageId = await insertMessage(supabase, mailboxId, threadId, msg, folderId);
  if (!messageId) return;

  await onImported?.();
  if (msg.attachments.length) await storeAttachments(supabase, mailboxId, messageId, msg.attachments);

  if (!msg.isSpamFolder) {
    const headerAnalysis = analyzeSpamHeaders(msg.headers);
    if (headerAnalysis?.is_spam) {
      await supabase.from('spam_flags').insert({
        message_id: messageId, source: 'spamassassin', confidence: headerAnalysis.confidence,
        reason: headerAnalysis.reason, user_action: 'pending',
      });
    } else if (needsAISecondPass(msg.headers)) {
      const aiAnalysis = await analyzeSpamWithAI(msg.subject, msg.fromAddress, msg.bodyText);
      if (aiAnalysis.confidence >= 0.6) {
        await supabase.from('spam_flags').insert({
          message_id: messageId, source: 'ai_second_pass', confidence: aiAnalysis.confidence,
          reason: aiAnalysis.reason, user_action: 'pending',
        });
      }
    }
  }

  await applyRules(supabase, mailboxId, messageId, msg);
  await supabase.from('threads').update({ last_message_at: msg.sentAt.toISOString() })
    .eq('id', threadId).lt('last_message_at', msg.sentAt.toISOString());
}
