import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '@/db/supabase';
import type { Mailbox, Thread, Message, MailboxFolder, FolderType } from '@/types/types';
import { useAuth } from './AuthContext';
import { toast } from 'sonner';

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
  moveThreadToFolder: (threadId: string, folderId: string | null, label?: string) => void;
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

const reportMailError = (message: string, error: unknown) => {
  console.error(message, error);
  toast.error(message);
};

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
    const loadMailboxes = async () => {
      try {
        const { data, error } = await supabase
          .from('mailboxes')
          .select('*, staff_users(full_name)')
          .order('created_at', { ascending: true });
        if (error) throw error;
        if (data?.length) {
          setMailboxes(data as Mailbox[]);
          setActiveMailbox(data[0] as Mailbox);
        }
      } catch (error) {
        reportMailError('Failed to load mailboxes', error);
      }
    };
    void loadMailboxes();
  }, [staffUser]);

  // Load folders when mailbox changes
  useEffect(() => {
    if (!activeMailbox) return;
    const loadFolders = async () => {
      try {
        const { data, error } = await supabase
          .from('mailbox_folders')
          .select('*')
          .eq('mailbox_id', activeMailbox.id);
        if (error) throw error;
        if (data) setFolders(data as MailboxFolder[]);
      } catch (error) {
        reportMailError('Failed to load mailbox folders', error);
      }
    };
    void loadFolders();
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

      if (searchQuery.trim() === 'follow_up:true') {
        q = q.not('follow_up_at', 'is', null);
      } else if (searchQuery) {
        // basic FTS fallback in threads
        q = q.ilike('subject', `%${searchQuery}%`);
      } else {
        const folderFilter = getFolderFilter(activeFolder, folders);
        if (folderFilter) q = q.eq('folder_id', folderFilter.folder_id);
        else q = q.is('folder_id', null); // inbox = no folder assigned OR inbox folder
      }

      const { data, error } = await q;
      if (error) throw error;
      if (data) {
        setThreads(data as Thread[]);
      }

      // The side rail is always an Inbox counter, not a count for whichever
      // folder happens to be open.
      const inboxFolder = getFolderFilter('inbox', folders);
      let unreadQuery = supabase.from('threads').select('*', { count: 'exact', head: true })
        .eq('mailbox_id', activeMailbox.id).eq('is_read', false);
      unreadQuery = inboxFolder ? unreadQuery.eq('folder_id', inboxFolder.folder_id) : unreadQuery.is('folder_id', null);
      const { count, error: unreadError } = await unreadQuery;
      if (unreadError) throw unreadError;
      setUnreadCount(count ?? 0);
    } catch (error) {
      reportMailError('Failed to load threads', error);
    } finally {
      setLoadingThreads(false);
    }
  }, [activeMailbox, activeFolder, folders, searchQuery, getFolderFilter]);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  // Realtime subscription
  useEffect(() => {
    if (!activeMailbox) return;
    const channel = supabase
      .channel(`mail-realtime-${activeMailbox.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'threads', filter: `mailbox_id=eq.${activeMailbox.id}` },
        () => loadThreads()
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `mailbox_id=eq.${activeMailbox.id}` },
        () => { loadThreads(); if (activeThread) loadMessages(activeThread.id); }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mailbox_folders', filter: `mailbox_id=eq.${activeMailbox.id}` }, () => {
        const refreshFolders = async () => {
          try {
            const { data, error } = await supabase.from('mailbox_folders').select('*').eq('mailbox_id', activeMailbox.id);
            if (error) throw error;
            if (data) setFolders(data as MailboxFolder[]);
          } catch (error) {
            reportMailError('Failed to refresh mailbox folders', error);
          }
        };
        void refreshFolders();
      })
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [activeMailbox, activeThread, loadThreads]); // eslint-disable-line

  // Realtime is the fast path; polling is the recovery path for browser sleep,
  // transient websocket loss, and IMAP sync updates arriving during reconnect.
  useEffect(() => {
    if (!activeMailbox) return;
    const timer = window.setInterval(() => { void loadThreads(); }, 20_000);
    return () => window.clearInterval(timer);
  }, [activeMailbox, loadThreads]);

  const loadMessages = async (threadId: string) => {
    setLoadingMessages(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*, attachments(*), spam_flags(*)')
        .eq('thread_id', threadId)
        .order('sent_at', { ascending: true })
        .limit(100);
      if (error) throw error;
      if (data) setActiveMessages(data as Message[]);
    } catch (error) {
      reportMailError('Failed to load messages', error);
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
    try {
      const { error: threadError } = await supabase.from('threads').update({ is_read: true }).eq('id', threadId);
      if (threadError) throw threadError;
      const { error: messageError } = await supabase.from('messages').update({ is_read: true }).eq('thread_id', threadId);
      if (messageError) throw messageError;
    } catch (error) {
      reportMailError('Failed to mark thread as read', error);
      void loadThreads();
    }
  }, [loadThreads]);

  const starThread = useCallback(async (threadId: string, starred: boolean) => {
    setThreads(prev => prev.map(t => t.id === threadId ? { ...t, is_starred: starred } : t));
    try {
      const { error } = await supabase.from('threads').update({ is_starred: starred }).eq('id', threadId);
      if (error) throw error;
    } catch (error) {
      reportMailError('Failed to update star', error);
      void loadThreads();
    }
  }, [loadThreads]);

  const archiveThread = useCallback(async (threadId: string) => {
    const archiveFolder = folders.find(f => f.normalized_type === 'archive');
    setThreads(prev => prev.filter(t => t.id !== threadId));
    try {
      const { error } = await supabase.from('threads').update({ folder_id: archiveFolder?.id ?? null }).eq('id', threadId);
      if (error) throw error;
    } catch (error) {
      reportMailError('Failed to archive thread', error);
      void loadThreads();
    }
  }, [folders, loadThreads]);

  const deleteThread = useCallback(async (threadId: string) => {
    const trashFolder = folders.find(f => f.normalized_type === 'trash');
    setThreads(prev => prev.filter(t => t.id !== threadId));
    try {
      const { error } = await supabase.from('threads').update({ folder_id: trashFolder?.id ?? null }).eq('id', threadId);
      if (error) throw error;
    } catch (error) {
      reportMailError('Failed to move thread to trash', error);
      void loadThreads();
    }
  }, [folders, loadThreads]);

  const moveThreadToFolder = useCallback(async (threadId: string, folderId: string | null, label = 'folder') => {
    setThreads(prev => prev.filter(t => t.id !== threadId));
    try {
      const { error } = await supabase.from('threads').update({ folder_id: folderId }).eq('id', threadId);
      if (error) throw error;
      toast.success(`Moved to ${label}`);
    } catch (error) {
      reportMailError(`Failed to move thread to ${label}`, error);
      void loadThreads();
    }
  }, [loadThreads]);

  const snoozeThread = useCallback(async (threadId: string, until: Date) => {
    setThreads(prev => prev.filter(t => t.id !== threadId));
    try {
      const { error } = await supabase.from('threads').update({ snoozed_until: until.toISOString() }).eq('id', threadId);
      if (error) throw error;
    } catch (error) {
      reportMailError('Failed to snooze thread', error);
      void loadThreads();
    }
  }, [loadThreads]);

  const moveToSpam = useCallback(async (threadId: string) => {
    const spamFolder = folders.find(f => f.normalized_type === 'spam');
    setThreads(prev => prev.filter(t => t.id !== threadId));
    try {
      const { error: threadError } = await supabase.from('threads').update({ folder_id: spamFolder?.id ?? null }).eq('id', threadId);
      if (threadError) throw threadError;
      const { error: messageError } = await supabase.from('messages')
        .update({ spam_status: 'confirmed_spam' })
        .eq('thread_id', threadId);
      if (messageError) throw messageError;
    } catch (error) {
      reportMailError('Failed to move thread to spam', error);
      void loadThreads();
    }
  }, [folders, loadThreads]);

  return (
    <MailContext.Provider value={{
      mailboxes, activeMailbox, setActiveMailbox,
      folders, activeFolder, setActiveFolder,
      threads, activeThread, setActiveThread,
      activeMessages, loadingThreads, loadingMessages, unreadCount,
      refreshThreads: loadThreads,
      markThreadRead, starThread, archiveThread, deleteThread, moveThreadToFolder, snoozeThread, moveToSpam,
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
