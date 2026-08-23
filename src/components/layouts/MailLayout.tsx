import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Inbox, Send, FileText, Trash2, AlertTriangle, Archive,
  Search, Settings, ChevronDown, LogOut, User, Shield,
  Mail, RefreshCw, BookmarkPlus, Bookmark, Clock,
  LayoutDashboard, Keyboard, Sun, Moon, Monitor, Activity
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useMail } from '@/contexts/MailContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import type { FolderType } from '@/types/types';
import { cn } from '@/lib/utils';
import { Menu } from 'lucide-react';
import KeyboardShortcutsOverlay from '@/components/mail/KeyboardShortcutsOverlay';
import { fetchSavedSearches, createSavedSearch, deleteSavedSearch } from '@/services/api';
import type { SavedSearch } from '@/types/types';
import { toast } from 'sonner';

interface FolderItem {
  type: FolderType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const FOLDERS: FolderItem[] = [
  { type: 'inbox', label: 'Inbox', icon: Inbox },
  { type: 'drafts', label: 'Drafts', icon: FileText },
  { type: 'sent', label: 'Sent', icon: Send },
  { type: 'archive', label: 'Archive', icon: Archive },
  { type: 'spam', label: 'Spam', icon: AlertTriangle },
  { type: 'trash', label: 'Trash', icon: Trash2 },
];

const savedSearchQuery = (savedSearch: SavedSearch) => {
  const query = savedSearch.query.trim();
  if (!query.startsWith('{')) return query;

  try {
    const parsed = JSON.parse(query) as { q?: unknown };
    return typeof parsed.q === 'string' ? parsed.q : query;
  } catch {
    return query;
  }
};

interface TopBarProps {
  onCompose: () => void;
}

export function TopBar({ onCompose }: TopBarProps) {
  const { searchQuery, setSearchQuery, refreshThreads, activeMailbox } = useMail();
  const { staffUser, organization, signOut } = useAuth();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);

  useEffect(() => {
    if (staffUser) {
      fetchSavedSearches(staffUser.id)
        .then(setSavedSearches)
        .catch((error) => {
          console.error('Failed to load saved searches', error);
          toast.error('Failed to load saved searches');
        });
    }
  }, [staffUser]);

  const handleSaveSearch = async () => {
    if (!searchQuery.trim() || !staffUser) return;
    const name = window.prompt('Save search as:', searchQuery);
    if (!name) return;
    try {
      await createSavedSearch({ staff_user_id: staffUser.id, name, query: searchQuery, icon: 'search' });
      setSavedSearches(await fetchSavedSearches(staffUser.id));
      toast.success(`Search "${name}" saved`);
    } catch (error) {
      console.error('Failed to save search', error);
      toast.error('Failed to save search');
    }
  };

  // ? key opens shortcuts overlay
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (e.key === '?') setShortcutsOpen(true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0 col-span-3">
        {/* Mobile hamburger */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden shrink-0">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 bg-sidebar">
            <SideRailContent onCompose={() => { setMobileMenuOpen(false); onCompose(); }} onFolderClick={() => setMobileMenuOpen(false)} />
          </SheetContent>
        </Sheet>

        {/* Logo */}
        <Link to="/inbox" className="flex items-center gap-2 shrink-0">
          {organization?.branding_config?.logo_url ? (
            <img src={organization.branding_config.logo_url} alt="Logo" className="h-8 w-auto object-contain" />
          ) : (
            <div className="flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                <Mail className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-sm hidden sm:block" style={{ fontFamily: 'Playfair Display, serif' }}>
                Frimps Oil
              </span>
            </div>
          )}
        </Link>

        {/* Search */}
        <div className="flex-1 max-w-xl mx-auto relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search mail… (try 'emails from John last week')"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && refreshThreads()}
            className="pl-9 pr-20 h-9 bg-muted border-0 focus-visible:ring-1"
          />
          {searchQuery && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {savedSearches.some(s => savedSearchQuery(s) === searchQuery) ? null : (
                <button onClick={handleSaveSearch} title="Save this search" className="p-1 rounded hover:bg-muted-foreground/10 text-muted-foreground hover:text-foreground transition-colors">
                  <BookmarkPlus className="w-3.5 h-3.5" />
                </button>
              )}
              {savedSearches.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-1 rounded hover:bg-muted-foreground/10 text-muted-foreground hover:text-foreground transition-colors" title="Saved searches">
                      <Bookmark className="w-3.5 h-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    {savedSearches.map(s => (
                      <DropdownMenuItem key={s.id} onClick={() => { setSearchQuery(savedSearchQuery(s)); }}>
                        <Search className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                        <span className="flex-1 truncate">{s.name}</span>
                        <button
                          onClick={async e => {
                            e.stopPropagation();
                            try {
                              await deleteSavedSearch(s.id);
                              setSavedSearches(await fetchSavedSearches(staffUser!.id));
                              toast.success('Saved search removed');
                            } catch (error) {
                              console.error('Failed to remove saved search', error);
                              toast.error('Failed to remove saved search');
                            }
                          }}
                          className="ml-1 text-muted-foreground hover:text-destructive"
                        >
                          ×
                        </button>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={refreshThreads} title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Keyboard shortcuts (?)" onClick={() => setShortcutsOpen(true)}>
            <Keyboard className="w-4 h-4" />
          </Button>
          <Link to="/inbox/settings">
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Settings">
              <Settings className="w-4 h-4" />
            </Button>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 px-2 gap-1.5">
                <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
                  {staffUser?.full_name?.[0]?.toUpperCase() ?? 'U'}
                </div>
                <ChevronDown className="w-3 h-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{staffUser?.full_name ?? 'User'}</p>
                <p className="text-xs text-muted-foreground capitalize">{staffUser?.role}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link to="/inbox/settings" className="flex items-center gap-2"><User className="w-4 h-4" /> Profile & Settings</Link></DropdownMenuItem>
              {staffUser?.role === 'admin' && (
                <>
                  <DropdownMenuItem onClick={() => navigate('/admin/dashboard')}>
                    <LayoutDashboard className="w-4 h-4 mr-2" /> Admin Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/admin/mailboxes')}>
                    <Shield className="w-4 h-4 mr-2" /> Manage Mailboxes
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/admin/resources')}>
                    <Archive className="w-4 h-4 mr-2" /> Resources
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/admin/sync-status')}>
                    <Activity className="w-4 h-4 mr-2" /> Sync Status
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={signOut}>
                <LogOut className="w-4 h-4 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <KeyboardShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </>
  );
}

interface SideRailContentProps {
  onCompose: () => void;
  onFolderClick?: () => void;
}

export function SideRailContent({ onCompose, onFolderClick }: SideRailContentProps) {
  const { activeFolder, setActiveFolder, setActiveThread, mailboxes, activeMailbox, setActiveMailbox, unreadCount, setSearchQuery } = useMail();
  const { staffUser } = useAuth();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);

  useEffect(() => {
    if (staffUser) {
      fetchSavedSearches(staffUser.id)
        .then(setSavedSearches)
        .catch((error) => {
          console.error('Failed to load saved searches', error);
          toast.error('Failed to load saved searches');
        });
    }
  }, [staffUser]);

  const handleFolder = (f: FolderType) => {
    setActiveFolder(f);
    setActiveThread(null);
    setSearchQuery('');
    onFolderClick?.();
    navigate('/inbox');
  };

  const handleSavedSearch = (s: SavedSearch) => {
    setSearchQuery(savedSearchQuery(s));
    onFolderClick?.();
    navigate('/inbox');
  };

  return (
    <div className="flex flex-col h-full pt-4">
      {/* Mailbox Switcher */}
      {mailboxes.length > 1 && (
        <div className="px-3 mb-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full justify-between h-9 px-2 text-sm">
                <span className="truncate">{activeMailbox?.email_address ?? 'Select mailbox'}</span>
                <ChevronDown className="w-3.5 h-3.5 shrink-0 ml-1 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              {mailboxes.map(mb => (
                <DropdownMenuItem key={mb.id} onClick={() => setActiveMailbox(mb)}>
                  <Mail className="w-4 h-4 mr-2" />
                  <span className="truncate">{mb.email_address}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Compose Button */}
      <div className="px-3 mb-4">
        <Button onClick={onCompose} className="w-full rounded-full font-semibold h-9">
          <Mail className="w-4 h-4 mr-2" /> Compose
        </Button>
      </div>

      {/* Folder List */}
      <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
        {FOLDERS.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            onClick={() => handleFolder(type)}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
              activeFolder === type
                ? 'bg-primary text-primary-foreground font-medium'
                : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left truncate">{label}</span>
            {type === 'inbox' && unreadCount > 0 && (
              <Badge
                className={cn(
                  'h-5 min-w-[20px] text-xs px-1.5 ml-auto',
                  activeFolder === 'inbox' ? 'bg-primary-foreground text-primary' : 'bg-primary text-primary-foreground'
                )}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </Badge>
            )}
          </button>
        ))}

        {/* Saved Searches */}
        {savedSearches.length > 0 && (
          <div className="pt-2 mt-2 border-t border-sidebar-border">
            <p className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Saved Searches</p>
            {savedSearches.map(s => (
              <button
                key={s.id}
                onClick={() => handleSavedSearch(s)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
              >
                <Bookmark className="w-4 h-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-left truncate">{s.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Navigation items */}
        <div className="pt-2 mt-2 border-t border-sidebar-border space-y-0.5">
          <Link to="/inbox/contacts">
            <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
              <User className="w-4 h-4 shrink-0" /> Contacts
            </button>
          </Link>
          <Link to="/inbox/calendar">
            <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
              <FileText className="w-4 h-4 shrink-0" /> Calendar
            </button>
          </Link>
          <Link to="/inbox/resource-schedule">
            <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
              <Archive className="w-4 h-4 shrink-0" /> Resource Schedule
            </button>
          </Link>
          {staffUser?.role === 'admin' && (
            <Link to="/admin/resources">
              <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
                <Archive className="w-4 h-4 shrink-0" /> Resources
              </button>
            </Link>
          )}
          {staffUser?.role === 'admin' && (
            <Link to="/admin/sync-status">
              <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
                <Activity className="w-4 h-4 shrink-0" /> Sync Status
              </button>
            </Link>
          )}
          <Link to="/inbox/follow-ups">
            <button
              onClick={() => { setSearchQuery(''); onFolderClick?.(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            >
              <Clock className="w-4 h-4 shrink-0 text-orange-500" /> Follow-ups
            </button>
          </Link>
        </div>
      </nav>

      {/* Sync Status */}
      {activeMailbox && (
        <div className="px-3 py-3 border-t border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className={cn('w-2 h-2 rounded-full shrink-0', {
              'bg-green-500': activeMailbox.sync_status === 'active',
              'bg-yellow-500 animate-pulse': activeMailbox.sync_status === 'syncing',
              'bg-gray-400': activeMailbox.sync_status === 'pending',
              'bg-red-500': activeMailbox.sync_status === 'error',
            })} />
            <p className="text-xs text-muted-foreground truncate">
              {activeMailbox.sync_status === 'active' ? 'Sync active' :
               activeMailbox.sync_status === 'syncing' ? 'Syncing…' :
               activeMailbox.sync_status === 'pending' ? 'Pending sync' : 'Sync error'}
            </p>
          </div>
        </div>
      )}

      {/* Mobile-only theme switcher */}
      <div className="lg:hidden px-3 py-3 border-t border-sidebar-border space-y-2">
        <p className="px-1 text-xs font-medium text-muted-foreground">Theme</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTheme('light')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-xs transition-colors',
              theme === 'light' ? 'bg-primary text-primary-foreground' : 'hover:bg-sidebar-accent'
            )}
            aria-label="Light mode"
          >
            <Sun className="w-3.5 h-3.5" /> Light
          </button>
          <button
            onClick={() => setTheme('dark')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-xs transition-colors',
              theme === 'dark' ? 'bg-primary text-primary-foreground' : 'hover:bg-sidebar-accent'
            )}
            aria-label="Dark mode"
          >
            <Moon className="w-3.5 h-3.5" /> Dark
          </button>
          <button
            onClick={() => setTheme('system')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-xs transition-colors',
              theme === 'system' ? 'bg-primary text-primary-foreground' : 'hover:bg-sidebar-accent'
            )}
            aria-label="System default"
          >
            <Monitor className="w-3.5 h-3.5" /> Auto
          </button>
        </div>
        <p className="px-1 text-[10px] text-muted-foreground">
          Shortcut: {resolvedTheme === 'dark' ? <Sun className="inline w-3 h-3" /> : <Moon className="inline w-3 h-3" />} Ctrl/Cmd + Shift + L
        </p>
      </div>
    </div>
  );
}

// Keyboard shortcuts hook
export function useKeyboardShortcuts(handlers: {
  onCompose: () => void;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Don't fire shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case 'c': ref.current.onCompose(); break;
        case 'r': ref.current.onReply(); break;
        case 'a': ref.current.onReplyAll(); break;
        case 'f': ref.current.onForward(); break;
        case 'e': ref.current.onArchive(); break;
        case '#': ref.current.onDelete(); break;
        case 'j': ref.current.onNext(); break;
        case 'k': ref.current.onPrev(); break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);
}
