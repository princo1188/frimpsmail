import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive, CalendarDays, Contact, FileText, Inbox, Loader2, MailPlus,
  Search, Settings, Users, Clock, FolderOpen, Sparkles
} from 'lucide-react';
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem,
  CommandList, CommandShortcut,
} from '@/components/ui/command';
import { useDebounce } from '@/hooks/use-debounce';
import { useMail } from '@/contexts/MailContext';
import { fullTextSearch } from '@/services/api';
import type { Attachment, CalendarEvent, Contact as ContactType } from '@/types/types';
import { toast } from 'sonner';

type SearchResult = Awaited<ReturnType<typeof fullTextSearch>>;

const navItems = [
  { label: 'Inbox', path: '/inbox', icon: Inbox, shortcut: 'G I' },
  { label: 'Contacts', path: '/inbox/contacts', icon: Contact, shortcut: 'G C' },
  { label: 'Groups', path: '/inbox/groups', icon: Users },
  { label: 'Calendar', path: '/inbox/calendar', icon: CalendarDays, shortcut: 'G A' },
  { label: 'Schedule', path: '/inbox/schedule', icon: Clock },
  { label: 'Resources', path: '/inbox/resources', icon: Archive },
  { label: 'Follow-ups', path: '/inbox/follow-ups', icon: Clock },
  { label: 'Settings', path: '/inbox/settings', icon: Settings },
];

export default function CommandPalette() {
  const navigate = useNavigate();
  const {
    activeMailbox, setComposing, setSearchQuery, setActiveFolder, setActiveThread,
  } = useMail();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 180);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult>({ messages: [], contacts: [], events: [], attachments: [] });

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isCommandK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (!isCommandK) return;
      event.preventDefault();
      setOpen(current => !current);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const openHandler = () => setOpen(true);
    window.addEventListener('fmail:open-command-palette', openHandler);
    return () => window.removeEventListener('fmail:open-command-palette', openHandler);
  }, []);

  useEffect(() => {
    const run = async () => {
      if (!activeMailbox || debouncedQuery.trim().length < 2) {
        setResults({ messages: [], contacts: [], events: [], attachments: [] });
        return;
      }
      setLoading(true);
      try {
        setResults(await fullTextSearch(activeMailbox.id, debouncedQuery));
      } catch (error) {
        console.error('Unified search failed', error);
        toast.error('Search failed');
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [activeMailbox, debouncedQuery]);

  const hasResults = useMemo(() => (
    results.messages.length > 0 ||
    results.contacts.length > 0 ||
    results.events.length > 0 ||
    results.attachments.length > 0
  ), [results]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const navigateTo = (path: string) => {
    close();
    navigate(path);
  };

  const showMailSearch = () => {
    setSearchQuery(query);
    setActiveThread(null);
    close();
    navigate('/inbox');
  };

  const compose = () => {
    close();
    navigate('/inbox');
    setComposing(true);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search mail, contacts, calendar, files, or run a command..."
      />
      <CommandList className="max-h-[520px]">
        <CommandEmpty>{loading ? 'Searching...' : 'No matching commands or results'}</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem value="compose new message email" onSelect={compose}>
            <MailPlus className="h-4 w-4" />
            <span>Compose new email</span>
            <CommandShortcut>C</CommandShortcut>
          </CommandItem>
          <CommandItem value="focus search mail unified" onSelect={showMailSearch} disabled={!query.trim()}>
            <Search className="h-4 w-4" />
            <span>Search mail for "{query || '...'}"</span>
            <CommandShortcut>/</CommandShortcut>
          </CommandItem>
          <CommandItem value="ai assistant smart replies" onSelect={() => navigateTo('/inbox')}>
            <Sparkles className="h-4 w-4" />
            <span>Open current thread AI assistant</span>
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="Go to">
          {navItems.map(item => (
            <CommandItem key={item.path} value={`${item.label} ${item.path}`} onSelect={() => navigateTo(item.path)}>
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
              {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Folders">
          {(['inbox', 'sent', 'drafts', 'archive', 'spam', 'trash'] as const).map(folder => (
            <CommandItem
              key={folder}
              value={`folder ${folder}`}
              onSelect={() => {
                setActiveFolder(folder);
                setActiveThread(null);
                navigateTo('/inbox');
              }}
            >
              <FolderOpen className="h-4 w-4" />
              <span className="capitalize">{folder}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {(loading || hasResults) && (
          <CommandGroup heading={loading ? 'Searching' : 'Results'}>
            {loading && (
              <CommandItem disabled value="loading">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Searching all workspaces...</span>
              </CommandItem>
            )}
            {results.messages.map(message => (
              <CommandItem
                key={`message-${message.thread_id}-${message.sent_at}`}
                value={`message ${message.subject ?? ''} ${message.from_address ?? ''}`}
                onSelect={showMailSearch}
              >
                <Inbox className="h-4 w-4" />
                <div className="min-w-0">
                  <p className="truncate">{message.subject || '(no subject)'}</p>
                  <p className="truncate text-xs text-muted-foreground">{message.from_name || message.from_address}</p>
                </div>
              </CommandItem>
            ))}
            {results.contacts.map((contact: ContactType) => (
              <CommandItem
                key={`contact-${contact.id}`}
                value={`contact ${contact.name} ${contact.email}`}
                onSelect={() => navigateTo('/inbox/contacts')}
              >
                <Contact className="h-4 w-4" />
                <div className="min-w-0">
                  <p className="truncate">{contact.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{contact.email}</p>
                </div>
              </CommandItem>
            ))}
            {results.events.map((event: CalendarEvent) => (
              <CommandItem
                key={`event-${event.id}`}
                value={`event ${event.title} ${event.location ?? ''}`}
                onSelect={() => navigateTo('/inbox/calendar')}
              >
                <CalendarDays className="h-4 w-4" />
                <div className="min-w-0">
                  <p className="truncate">{event.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{event.location ?? event.start_at}</p>
                </div>
              </CommandItem>
            ))}
            {results.attachments.map((attachment: Attachment) => (
              <CommandItem
                key={`attachment-${attachment.id}`}
                value={`attachment ${attachment.filename ?? ''}`}
                onSelect={showMailSearch}
              >
                <FileText className="h-4 w-4" />
                <span className="truncate">{attachment.filename ?? 'Attachment'}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
