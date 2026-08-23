import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MailProvider } from '@/contexts/MailContext';
import { TopBar, SideRailContent, useKeyboardShortcuts } from '@/components/layouts/MailLayout';
import ThreadList from '@/components/mail/ThreadList';
import ReadingPane from '@/components/mail/ReadingPane';
import ComposePanel from '@/components/mail/ComposePanel';
import NotificationPrompt from '@/components/mail/NotificationPrompt';
import { useMail } from '@/contexts/MailContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  getNotificationPermission,
  subscribeToNewMessages,
  unsubscribeFromMessages,
  updateBadgeCount,
  getLocalPrefs,
} from '@/services/notificationService';

function InboxInner() {
  const {
    activeThread, threads, setActiveThread,
    archiveThread, deleteThread,
    composing, setComposing,
    setReplyTo,
    activeMailbox,
    mailboxes,
    setActiveMailbox,
    setSearchQuery,
    unreadCount,
  } = useMail();
  const { staffUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeMobilePane, setActiveMobilePane] = useState<'folders' | 'threads' | 'reading'>('threads');
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);

  const threadIndex = activeThread ? threads.findIndex(t => t.id === activeThread.id) : -1;

  useEffect(() => {
    const mailboxId = searchParams.get('mailbox');
    if (!mailboxId || activeMailbox?.id === mailboxId) return;
    const mailbox = mailboxes.find(item => item.id === mailboxId);
    if (mailbox) setActiveMailbox(mailbox);
  }, [activeMailbox?.id, mailboxes, searchParams, setActiveMailbox]);

  useEffect(() => {
    const threadId = searchParams.get('thread');
    if (!threadId) return;
    setSearchQuery('follow_up:true');
    const thread = threads.find(item => item.id === threadId);
    if (thread) setActiveThread(thread);
  }, [searchParams, setActiveThread, setSearchQuery, threads]);

  // Show notification permission prompt after 3s if not yet decided
  useEffect(() => {
    const perm = getNotificationPermission();
    if (perm === 'default') {
      const t = setTimeout(() => setShowNotifPrompt(true), 3000);
      return () => clearTimeout(t);
    }
  }, []);

  // Subscribe to new message notifications
  useEffect(() => {
    if (!activeMailbox || !staffUser) return;
    const handleNewMessage = (threadId: string) => {
      // If the cosmos:open-thread event fires, navigate there
      const listener = (e: Event) => {
        const detail = (e as CustomEvent<{ threadId: string }>).detail;
        if (detail?.threadId === threadId) {
          const thread = threads.find(t => t.id === detail.threadId);
          if (thread) setActiveThread(thread);
        }
      };
      window.addEventListener('cosmos:open-thread', listener);
      return () => window.removeEventListener('cosmos:open-thread', listener);
    };
    subscribeToNewMessages(activeMailbox.id, staffUser.id, handleNewMessage);
    return () => unsubscribeFromMessages();
  }, [activeMailbox?.id, staffUser?.id]); // eslint-disable-line

  // Listen for click-to-open-thread events from notification service
  useEffect(() => {
    const handler = (e: Event) => {
      const { threadId } = (e as CustomEvent<{ threadId: string }>).detail ?? {};
      if (!threadId) return;
      const thread = threads.find(t => t.id === threadId);
      if (thread) {
        setActiveThread(thread);
        window.focus();
      }
    };
    window.addEventListener('cosmos:open-thread', handler);
    return () => window.removeEventListener('cosmos:open-thread', handler);
  }, [threads, setActiveThread]);

  // Update badge whenever unread count changes
  useEffect(() => {
    updateBadgeCount(unreadCount, getLocalPrefs());
  }, [unreadCount]);

  useKeyboardShortcuts({
    onCompose: () => setComposing(true),
    onReply: () => { /* handled in ReadingPane */ },
    onReplyAll: () => { /* handled in ReadingPane */ },
    onForward: () => { /* handled in ReadingPane */ },
    onArchive: () => { if (activeThread) archiveThread(activeThread.id); },
    onDelete: () => { if (activeThread) deleteThread(activeThread.id); },
    onNext: () => {
      if (threadIndex < threads.length - 1) setActiveThread(threads[threadIndex + 1]);
    },
    onPrev: () => {
      if (threadIndex > 0) setActiveThread(threads[threadIndex - 1]);
    },
  });

  return (
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden">
      {/* Top Bar */}
      <TopBar onCompose={() => setComposing(true)} />

      {/* 3-pane body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Side rail — hidden on mobile */}
        <aside className="hidden lg:flex flex-col w-52 xl:w-60 shrink-0 cosmos-sidebar overflow-hidden">
          <SideRailContent onCompose={() => setComposing(true)} />
        </aside>

        {/* Thread list */}
        <div className={`
          flex-none w-full md:w-80 xl:w-96 border-r border-border overflow-hidden
          ${activeThread ? 'hidden md:flex flex-col' : 'flex flex-col'}
        `}>
          <ThreadList />
        </div>

        {/* Reading pane */}
        <div className={`
          flex-1 min-w-0 overflow-hidden
          ${activeThread ? 'flex flex-col' : 'hidden md:flex flex-col'}
        `}>
          {/* Mobile back button */}
          {activeThread && (
            <button
              onClick={() => setActiveThread(null)}
              className="md:hidden flex items-center gap-2 px-4 py-2 text-sm text-primary border-b border-border shrink-0"
            >
              ← Back to inbox
            </button>
          )}
          <ReadingPane />
        </div>
      </div>

      {/* Global Compose Panel (floating) */}
      {composing && (
        <ComposePanel mode="compose" onClose={() => setComposing(false)} />
      )}

      {/* Notification permission prompt */}
      {showNotifPrompt && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4">
          <NotificationPrompt onDismiss={() => setShowNotifPrompt(false)} />
        </div>
      )}
    </div>
  );
}

export default function InboxPage() {
  return (
    <MailProvider>
      <InboxInner />
    </MailProvider>
  );
}
