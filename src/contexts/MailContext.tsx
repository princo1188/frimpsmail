import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '@/db/supabase';
import type { Mailbox, Thread, Message, MailboxFolder, FolderType } from '@/types/types';
import { useAuth } from './AuthContext';

interface MailContextType {
  mailboxes: Mailbox[];
  activeMailbox: Mailbox | null;
  setActiveMailbox: (mb: Mailbox) => void;
  folders: MailboxFolder[];
  activeFolder: FolderType;
  setActiveFolder: (f: FolderType) => void;
  threads: Thread[];
  activeThread: Thread | null;
  setActiveThread: (t: Thread | null) => void;
  activeMessages: Message[];
  loadingThreads: boolean;
  loadingMessages: boolean;
  unreadCount: number;
  refreshThreads: () => void;
  markThreadRead: (threadId: string) => void;
  starThread: (threadId: string, starred: boolean) => void;
  archiveThread: (threadId: string) => void;
  deleteThread: (threadId: string) => void;
  snoozeThread: (threadId: string, until: Date) => void;
  moveToSpam: (threadId: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  composing: boolean;
  setComposing: (c: boolean) => void;
  replyTo: Message | null;
  setReplyTo: (m: Message | null) => void;
}

const MailContext = createContext<MailContextType | null>(null);

export function MailProvider({ children }: { children: ReactNode }) {
  const { staffUser } = useAuth();
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [activeMailbox, setActiveMailbox] = useState<Mailbox | null>(null);
  const [folders, setFolders] = useState<MailboxFolder[]>([]);
  const [activeFolder, setActiveFolder] = useState<FolderType>('inbox');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [activeMessages, setActiveMessages] = useState<Message[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [composing, setComposing] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);

  // Load mailboxes
  useEffect(() => {
    if (!staffUser) return;
    supabase
      .from('mailboxes')
      .select('*, staff_users(full_name)')
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data?.length) {
          setMailboxes(data as Mailbox[]);
          setActiveMailbox(data[0] as Mailbox);
        }
      });
  }, [staffUser]);

  // Load folders when mailbox changes
  useEffect(() => {
    if (!activeMailbox) return;
    supabase
      .from('mailbox_folders')
      .select('*')
      .eq('mailbox_id', activeMailbox.id)
      .then(({ data }) => { if (data) setFolders(data as MailboxFolder[]); });
  }, [activeMailbox]);

  const getFolderFilter = useCallback((folder: FolderType, foldersList: MailboxFolder[]) => {
    const f = foldersList.find(x => x.normalized_type === folder);
    return f ? { folder_id: f.id } : null;
  }, []);

  const loadThreads = useCallback(async () => {
    if (!activeMailbox) return;
    setLoadingThreads(true);
    try {
      let q = supabase
        .from('threads')
        .select('*')
        .eq('mailbox_id', activeMailbox.id)
        .or('snoozed_until.is.null,snoozed_until.lte.' + new Date().toISOString())
        .order('last_message_at', { ascending: false })
        .limit(50);

      if (searchQuery) {
        // basic FTS fallback in threads
        q = q.ilike('subject', `%${searchQuery}%`);
      } else {
        const folderFilter = getFolderFilter(activeFolder, folders);
        if (folderFilter) q = q.eq('folder_id', folderFilter.folder_id);
        else q = q.is('folder_id', null); // inbox = no folder assigned OR inbox folder
      }

      const { data } = await q;
      if (data) {
        setThreads(data as Thread[]);
        setUnreadCount((data as Thread[]).filter(t => !t.is_read).length);
      }
    } finally {
      setLoadingThreads(false);
    }
  }, [activeMailbox, activeFolder, folders, searchQuery, getFolderFilter]);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  // Realtime subscription
  useEffect(() => {
    if (!activeMailbox) return;
    const channel = supabase
      .channel('mail-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'threads', filter: `mailbox_id=eq.${activeMailbox.id}` },
        () => loadThreads()
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `mailbox_id=eq.${activeMailbox.id}` },
        () => { if (activeThread) loadMessages(activeThread.id); }
      )
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [activeMailbox, activeThread]); // eslint-disable-line

  const loadMessages = async (threadId: string) => {
    setLoadingMessages(true);
    try {
      const { data } = await supabase
        .from('messages')
        .select('*, attachments(*), spam_flags(*)')
        .eq('thread_id', threadId)
        .order('sent_at', { ascending: true })
        .limit(100);
      if (data) setActiveMessages(data as Message[]);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    if (activeThread) loadMessages(activeThread.id);
    else setActiveMessages([]);
  }, [activeThread]);

  // Actions (optimistic)
  const markThreadRead = useCallback(async (threadId: string) => {
    setThreads(prev => prev.map(t => t.id === threadId ? { ...t, is_read: true } : t));
    await supabase.from('threads').update({ is_read: true }).eq('id', threadId);
    await supabase.from('messages').update({ is_read: true }).eq('thread_id', threadId);
  }, []);

  const starThread = useCallback(async (threadId: string, starred: boolean) => {
    setThreads(prev => prev.map(t => t.id === threadId ? { ...t, is_starred: starred } : t));
    await supabase.from('threads').update({ is_starred: starred }).eq('id', threadId);
  }, []);

  const archiveThread = useCallback(async (threadId: string) => {
    const archiveFolder = folders.find(f => f.normalized_type === 'archive');
    setThreads(prev => prev.filter(t => t.id !== threadId));
    await supabase.from('threads').update({ folder_id: archiveFolder?.id ?? null }).eq('id', threadId);
  }, [folders]);

  const deleteThread = useCallback(async (threadId: string) => {
    const trashFolder = folders.find(f => f.normalized_type === 'trash');
    setThreads(prev => prev.filter(t => t.id !== threadId));
    await supabase.from('threads').update({ folder_id: trashFolder?.id ?? null }).eq('id', threadId);
  }, [folders]);

  const snoozeThread = useCallback(async (threadId: string, until: Date) => {
    setThreads(prev => prev.filter(t => t.id !== threadId));
    await supabase.from('threads').update({ snoozed_until: until.toISOString() }).eq('id', threadId);
  }, []);

  const moveToSpam = useCallback(async (threadId: string) => {
    const spamFolder = folders.find(f => f.normalized_type === 'spam');
    setThreads(prev => prev.filter(t => t.id !== threadId));
    await supabase.from('threads').update({ folder_id: spamFolder?.id ?? null }).eq('id', threadId);
    await supabase.from('messages')
      .update({ spam_status: 'confirmed_spam' })
      .eq('thread_id', threadId);
  }, [folders]);

  return (
    <MailContext.Provider value={{
      mailboxes, activeMailbox, setActiveMailbox,
      folders, activeFolder, setActiveFolder,
      threads, activeThread, setActiveThread,
      activeMessages, loadingThreads, loadingMessages, unreadCount,
      refreshThreads: loadThreads,
      markThreadRead, starThread, archiveThread, deleteThread, snoozeThread, moveToSpam,
      searchQuery, setSearchQuery,
      composing, setComposing,
      replyTo, setReplyTo,
    }}>
      {children}
    </MailContext.Provider>
  );
}

export function useMail() {
  const ctx = useContext(MailContext);
  if (!ctx) throw new Error('useMail must be used within MailProvider');
  return ctx;
}
