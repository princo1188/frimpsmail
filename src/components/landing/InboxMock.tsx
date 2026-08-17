import { useEffect, useState } from 'react';
import {
  Inbox, Star, Archive, Trash2, Send, Search, Bell,
  ChevronLeft, ChevronRight, Paperclip, Bot, Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// Animated inbox mock for the landing page hero
export default function InboxMock() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 2500);
    return () => clearInterval(interval);
  }, []);

  const activeRow = tick % 5;

  const threads = [
    { id: '1', from: 'Kwame Mensah', subject: 'Q3 Fuel Delivery Schedule', time: '10:42 AM', unread: true, starred: true, ai: true, attach: true },
    { id: '2', from: 'Abena Asante', subject: 'Invoice #4421 processed', time: '09:15 AM', unread: false, starred: false, ai: false, attach: false },
    { id: '3', from: 'Supplier Relations', subject: 'Updated pricing sheet', time: 'Yesterday', unread: true, starred: false, ai: true, attach: true },
    { id: '4', from: 'Calendar', subject: 'Meeting: Ops review @ 2 PM', time: 'Yesterday', unread: false, starred: true, ai: false, attach: false },
    { id: '5', from: 'Sales Team', subject: 'Weekly pipeline report', time: 'Mon', unread: false, starred: false, ai: true, attach: false },
  ];

  const selected = threads[activeRow];

  return (
    <div className="relative w-full max-w-2xl mx-auto select-none">
      {/* Outer browser chrome */}
      <div className="relative rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Window header */}
        <div className="h-10 bg-muted flex items-center px-4 gap-2 border-b border-border">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 flex justify-center">
            <div className="bg-background rounded-md px-3 py-0.5 text-[10px] text-muted-foreground flex items-center gap-1.5 min-w-0 max-w-xs">
              <Search className="w-3 h-3 shrink-0" />
              <span className="truncate">cosmos.frimpsoil.com.gh/inbox</span>
            </div>
          </div>
          <div className="w-10" />
        </div>

        <div className="flex h-[420px]">
          {/* Sidebar */}
          <div className="w-14 md:w-16 border-r border-border bg-muted/40 flex flex-col items-center py-4 gap-3 shrink-0">
            <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold text-white">F</div>
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary"><Inbox className="w-4 h-4" /></div>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"><Send className="w-4 h-4" /></div>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"><Star className="w-4 h-4" /></div>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"><Archive className="w-4 h-4" /></div>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"><Trash2 className="w-4 h-4" /></div>
          </div>

          {/* Thread list */}
          <div className="w-52 md:w-64 border-r border-border flex flex-col shrink-0 bg-card">
            <div className="p-3 border-b border-border">
              <div className="h-7 rounded-md bg-muted flex items-center px-2 gap-1.5 text-[10px] text-muted-foreground">
                <Search className="w-3 h-3" /> Search mail...
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              {threads.map((t, i) => (
                <div
                  key={t.id}
                  className={`
                    px-3 py-2.5 border-b border-border transition-all duration-300
                    ${i === activeRow ? 'bg-primary/5 border-l-2 border-l-primary' : 'hover:bg-muted/40'}
                  `}
                >
                  <div className="flex items-start justify-between gap-2 mb-0.5">
                    <p className={`text-[10px] md:text-xs truncate ${t.unread ? 'font-bold' : 'font-medium text-muted-foreground'}`}>{t.from}</p>
                    <p className="text-[10px] text-muted-foreground shrink-0">{t.time}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">{t.subject}</p>
                  <div className="flex items-center gap-1 mt-1">
                    {t.starred && <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />}
                    {t.ai && <Bot className="w-2.5 h-2.5 text-primary" />}
                    {t.attach && <Paperclip className="w-2.5 h-2.5 text-muted-foreground" />}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Reading pane */}
          <div className="flex-1 min-w-0 flex flex-col bg-background">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground">
                <button className="p-1 hover:bg-muted rounded"><ChevronLeft className="w-3.5 h-3.5" /></button>
                <button className="p-1 hover:bg-muted rounded"><ChevronRight className="w-3.5 h-3.5" /></button>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Archive className="w-3.5 h-3.5" />
                <Trash2 className="w-3.5 h-3.5" />
                <Clock className="w-3.5 h-3.5" />
              </div>
            </div>

            <div className="p-5 flex-1 overflow-hidden">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                    {selected.from.charAt(0)}
                  </div>
                  <div>
                    <p className="text-xs font-semibold">{selected.from}</p>
                    <p className="text-[10px] text-muted-foreground">{selected.from.toLowerCase().replace(/\s/g, '.')}@frimpsoil.com.gh</p>
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground">{selected.time}</span>
              </div>

              <h3 className="text-sm font-semibold mb-3">{selected.subject}</h3>

              {/* Simulated email body skeleton */}
              <div className="space-y-2 mb-4">
                <div className="h-2 bg-muted rounded w-full" />
                <div className="h-2 bg-muted rounded w-[92%]" />
                <div className="h-2 bg-muted rounded w-[88%]" />
                <div className="h-2 bg-muted rounded w-[96%]" />
                <div className="h-2 bg-muted rounded w-[70%]" />
              </div>

              {/* AI summary card */}
              <div className="border border-border rounded-lg p-3 bg-card">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                  <p className="text-[10px] font-semibold text-primary">AI summary</p>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  {selected.ai
                    ? 'This email requests confirmation of the Q3 fuel delivery schedule and asks for a reply by end of day.'
                    : 'No AI summary available for this thread.'}
                </p>
              </div>
            </div>

            {/* Compose floating button (decorative mock) */}
            <div className="absolute bottom-4 right-4 md:bottom-6 md:right-6">
              <div className="inline-flex items-center justify-center rounded-full h-9 px-4 shadow-lg text-xs gap-1.5 bg-primary text-primary-foreground">
                <Send className="w-3.5 h-3.5" /> Reply
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating notification bubble */}
      <div
        className={`
          absolute -right-2 md:-right-6 top-16 bg-card border border-border rounded-xl p-3 shadow-xl
          transition-all duration-500 ease-out flex items-start gap-2.5 w-56
          ${tick % 2 === 0 ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}
        `}
      >
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <Bell className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold truncate">New email from {selected.from}</p>
          <p className="text-[10px] text-muted-foreground truncate">{selected.subject}</p>
        </div>
      </div>

      {/* Subtle glow behind */}
      <div
        className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[110%] h-[110%] rounded-full opacity-[0.05] blur-3xl pointer-events-none"
        style={{ background: 'radial-gradient(circle, #E31E24 0%, transparent 60%)' }}
      />
    </div>
  );
}
