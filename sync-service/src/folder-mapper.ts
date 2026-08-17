type NormalizedType = 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive' | 'custom';

const FOLDER_MAP: Record<string, NormalizedType> = {
  inbox: 'inbox',
  sent: 'sent',
  'sent items': 'sent',
  'sent mail': 'sent',
  drafts: 'drafts',
  draft: 'drafts',
  trash: 'trash',
  'deleted items': 'trash',
  'deleted messages': 'trash',
  junk: 'spam',
  'junk email': 'spam',
  'junk mail': 'spam',
  spam: 'spam',
  archive: 'archive',
  'all mail': 'archive',
  archived: 'archive',
};

export function normalizeFolder(imapName: string): NormalizedType {
  const key = imapName.toLowerCase().replace(/\[gmail\]\//i, '');
  return FOLDER_MAP[key] ?? 'custom';
}

export function getFolderDisplayName(imapName: string): string {
  const parts = imapName.split('/');
  const leaf = parts[parts.length - 1];
  return leaf.charAt(0).toUpperCase() + leaf.slice(1);
}
