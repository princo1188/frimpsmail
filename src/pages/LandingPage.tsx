import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Mail, Sparkles, Shield, Bell, Search, Calendar, Users,
  ToggleRight, Clock, Paperclip, ChevronDown, ChevronUp,
  ArrowRight, Eye, EyeOff, Zap, Globe, Lock, Server,
  CheckCircle , BarChart3, Bot, Inbox, Send,
  Moon, Sun, Monitor, ShieldAlert
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import InboxMock from '@/components/landing/InboxMock';
import { supabaseUrl } from '@/db/supabase';

const defaultLogoUrl = `${supabaseUrl}/storage/v1/object/public/logos/frimps-logo.png`;

// ─── Feature data ────────────────────────────────────────────────────────────
const features = [
  {
    icon: Shield,
    title: 'Mandatory 2FA Security',
    desc: 'Every staff account is protected by time-based one-time passwords. Admins can reset lost authenticators instantly.',
    badge: 'Security',
  },
  {
    icon: Bell,
    title: 'Real-Time Notifications',
    desc: 'Instant browser push alerts when new email arrives — with click-to-open and badge counts. Never miss a message.',
    badge: 'New',
  },
  {
    icon: Bot,
    title: 'AI-Powered Features',
    desc: 'Smart thread summarization, sentiment analysis, reply drafts, and meeting extraction — all powered by Claude AI.',
    badge: 'AI',
  },
  {
    icon: Search,
    title: 'Full-Text Search',
    desc: 'Search across message bodies, attachments metadata, contacts, and folders instantly with natural-language queries.',
  },
  {
    icon: Shield,
    title: 'Advanced Spam Protection',
    desc: 'Two-layer detection: SpamAssassin header parsing + AI secondary pass to flag suspicious messages — never auto-moves.',
  },
  {
    icon: Calendar,
    title: 'Smart Calendar & Scheduling',
    desc: 'Department colour-coded events, recurring meetings, task-style events, automated reminder toasts, and one-click ICS invites for external attendees.',
    badge: 'New',
  },
  {
    icon: Users,
    title: 'Resource Booking',
    desc: 'Book rooms, vehicles, and equipment directly inside calendar events. Read-only schedule view keeps the whole team aligned.',
    badge: 'New',
  },
  {
    icon: ToggleRight,
    title: 'Rules & Automation',
    desc: 'Build powerful filter rules — auto-label, move, archive, or mark-read based on sender, subject, or content.',
  },
  {
    icon: Clock,
    title: 'Schedule Send Later',
    desc: 'Compose now, send at the perfect time. Schedule emails to land in the recipient\'s inbox at any future moment.',
  },
  {
    icon: Users,
    title: 'Shared Mailboxes',
    desc: 'Delegate mailbox access to team members. Full audit trail, per-user permissions, and seamless handoffs.',
  },
  {
    icon: Paperclip,
    title: 'Attachment Gallery',
    desc: 'Preview images, PDFs, and documents without leaving the inbox. Lightbox gallery with zoom and download support.',
  },
  {
    icon: Zap,
    title: 'Webhooks & API Keys',
    desc: 'Integrate Frimps Mail with any external system via scoped REST API keys and event-driven webhooks.',
  },
  {
    icon: Globe,
    title: 'Offline PWA',
    desc: 'Install as a desktop or mobile app. Works offline with service worker caching for full continuity.',
  },
  {
    icon: BarChart3,
    title: 'Admin Dashboard',
    desc: 'Real-time mailbox health, sync status, quota monitoring, delivery error tracking, and org-level analytics.',
  },
];

const faqs = [
  {
    q: 'What mail servers does Frimps Mail support?',
    a: 'Frimps Mail connects to any standard IMAP/SMTP server. It\'s optimised for cPanel-hosted domains (Dovecot/Exim) but works with any compliant mail server.',
  },
  {
    q: 'How do push notifications work?',
    a: 'Frimps Mail uses a background sync service with real-time Supabase Realtime subscriptions. When a new email arrives, the service worker fires a native browser notification — no tab needs to be open.',
  },
  {
    q: 'Is my email data stored securely?',
    a: 'All data is stored in your dedicated Supabase Postgres database with Row Level Security enabled. Mailbox passwords are stored in Supabase Vault (AES-256 encrypted). TLS is enforced for all IMAP/SMTP connections.',
  },
  {
    q: 'Can multiple staff members share the same mailbox?',
    a: 'Yes. Frimps Mail supports shared mailbox delegation — you can assign access to any number of staff users with full read/write permissions and a complete audit trail.',
  },
  {
    q: 'What AI features are included?',
    a: 'Thread summarization, sentiment analysis (positive/neutral/negative), smart reply draft suggestions, meeting extraction (dates, locations, attendees), and natural-language full-text search.',
  },
  {
    q: 'Does it work on mobile?',
    a: 'Frimps Mail is a fully responsive Progressive Web App (PWA). Install it from the browser on iOS or Android for a native-like experience, including offline support and push notifications.',
  },
  {
    q: 'How is email scheduling implemented?',
    a: 'Scheduled emails are stored securely in the database and dispatched by a persistent Node.js sync service at the exact scheduled time via your configured SMTP server.',
  },
];

const stats = [
  { value: '21+', label: 'Enterprise Features' },
  { value: '< 1s', label: 'Notification Delivery' },
  { value: '99.9%', label: 'Uptime SLA' },
  { value: '4 AI', label: 'Smart Assistants' },
];

// ─── Sub-components ──────────────────────────────────────────────────────────
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button
        className="w-full flex items-center justify-between py-4 text-left gap-4 hover:text-primary transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span className="font-semibold text-sm md:text-base leading-snug">{q}</span>
        {open ? <ChevronUp className="w-4 h-4 shrink-0 text-primary" /> : <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />}
      </button>
      {open && (
        <p className="text-sm text-muted-foreground pb-4 leading-relaxed pr-8">{a}</p>
      )}
    </div>
  );
}

// ─── Integrated login panel ───────────────────────────────────────────────────
function LoginPanel() {
  const { signIn, user, mfaStatus, mfaVerified } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    if (mfaStatus === 'not_enrolled') navigate('/setup-2fa', { replace: true });
    if (mfaStatus === 'enrolled') navigate(mfaVerified ? '/inbox' : '/verify-2fa', { replace: true });
  }, [user, mfaStatus, mfaVerified, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('Please fill in all fields'); return; }
    setLoading(true);
    const { error: err } = await signIn(email, password);
    setLoading(false);
    if (err) {
      setError(err.includes('Invalid') ? 'Invalid email or password' : err);
    } else {
      toast.success('Welcome back!');
    }
  };

  return (
    <div id="signin" className="bg-card border border-border rounded-2xl p-6 shadow-lg w-full">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0">
          <Mail className="w-4.5 h-4.5 text-primary-foreground" />
        </div>
        <div>
          <p className="font-semibold text-sm text-foreground leading-tight">Sign in to Frimps Mail</p>
          <p className="text-xs text-muted-foreground">Access your professional mailbox</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="lp-email" className="text-xs font-medium">Email address</Label>
          <Input
            id="lp-email"
            type="email"
            autoComplete="email"
            placeholder="you@frimpsoil.com.gh"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="h-10 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="lp-password" className="text-xs font-medium">Password</Label>
          <div className="relative">
            <Input
              id="lp-password"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="h-10 text-sm pr-9"
            />
            <button
              type="button"
              onClick={() => setShowPw(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {error && (
          <p className="text-xs text-destructive bg-destructive/8 border border-destructive/20 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-10 rounded-full text-sm font-semibold mt-1"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
              Signing in…
            </span>
          ) : (
            <span className="flex items-center gap-2">
              Sign in <ArrowRight className="w-3.5 h-3.5" />
            </span>
          )}
        </Button>
      </form>

      <p className="text-xs text-muted-foreground text-center mt-4">
        Need access?{' '}
        <a href="mailto:admin@frimpsoil.com.gh" className="text-primary hover:underline font-medium">
          Contact your administrator
        </a>
      </p>
    </div>
  );
}

// ─── Main Landing Page ────────────────────────────────────────────────────────
export default function LandingPage() {
  const { user, loading, mfaStatus } = useAuth();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const featuresRef = useRef<HTMLDivElement>(null);

  // Redirect authenticated users, but keep MFA-not-enrolled users on the page
  // so they see the 2FA reminder banner and can navigate to setup.
  useEffect(() => {
    if (!loading && user && mfaStatus !== 'not_enrolled') {
      navigate('/inbox', { replace: true });
    }
  }, [user, loading, mfaStatus, navigate]);

  const scrollToFeatures = () => {
    featuresRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  if (loading) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── 2FA Reminder Banner (authenticated but not enrolled) ─────────────── */}
      {user && mfaStatus === 'not_enrolled' && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900 px-4 py-2.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span className="font-medium">Secure your account:</span>
              <span className="hidden sm:inline">Two-factor authentication is required before you can access your mailbox.</span>
            </div>
            <Button
              size="sm"
              className="shrink-0 h-7 rounded-full text-xs"
              onClick={() => navigate('/setup-2fa')}
            >
              Set up 2FA
            </Button>
          </div>
        </div>
      )}

      {/* ── Top Nav ───────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-14 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <img
              src={defaultLogoUrl}
              alt="Frimps Oil"
              className="h-8 w-auto object-contain"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <span className="font-bold text-base tracking-tight hidden sm:block" style={{ fontFamily: 'Playfair Display, serif' }}>
              Frimps Mail
            </span>
          </div>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <button onClick={scrollToFeatures} className="hover:text-foreground transition-colors">Features</button>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </nav>

          <div className="flex items-center gap-3">
            {/* Theme switcher */}
            <div className="hidden sm:flex items-center rounded-full border border-border bg-muted/50 p-0.5">
              <button
                onClick={() => setTheme('light')}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${theme === 'light' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                aria-label="Light mode"
              >
                <Sun className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${theme === 'dark' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                aria-label="Dark mode"
              >
                <Moon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setTheme('system')}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${theme === 'system' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                aria-label="System default"
                title="System default"
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* CTA */}
            <a href="#signin" className="hidden sm:inline-flex">
              <Button size="sm" className="rounded-full text-xs font-semibold h-8 px-4">
                Sign in <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </a>
          </div>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border">
        {/* decorative bg pattern */}
        <div className="absolute inset-0 z-0 pointer-events-none select-none overflow-hidden">
          <div
            className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full opacity-[0.06]"
            style={{ background: 'radial-gradient(circle, #E31E24 0%, transparent 70%)' }}
          />
          <div
            className="absolute -bottom-20 -left-20 w-[400px] h-[400px] rounded-full opacity-[0.05]"
            style={{ background: 'radial-gradient(circle, #F7941D 0%, transparent 70%)' }}
          />
          {/* editorial horizontal rules */}
          <div className="absolute top-0 left-0 right-0 h-px bg-border" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 py-16 md:py-24 grid md:grid-cols-2 gap-12 items-center">
          {/* Left: copy */}
          <div>
            <Badge
              variant="outline"
              className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium border-primary/30 text-primary bg-primary/5"
            >
              <Sparkles className="w-3 h-3" />
              AI-Powered Enterprise Webmail
            </Badge>

            <h1
              className="text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.15] tracking-tight mb-6"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              Professional email,{' '}
              <span className="text-primary">reimagined</span> for your team
            </h1>

            <p className="text-base md:text-lg text-muted-foreground leading-relaxed mb-8 max-w-xl">
              Frimps Mail connects directly to your existing cPanel mail servers. No migration, no new addresses — 
              just a dramatically better experience with AI, real-time notifications, and enterprise controls.
            </p>

            <div className="flex flex-wrap gap-3 mb-10">
              <a href="#signin">
                <Button size="lg" className="rounded-full font-semibold h-12 px-6">
                  Get started free <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </a>
              <Button variant="outline" size="lg" className="rounded-full font-semibold h-12 px-6" onClick={scrollToFeatures}>
                Explore features
              </Button>
            </div>

            {/* stats strip */}
            <div className="flex flex-wrap gap-6">
              {stats.map(s => (
                <div key={s.label}>
                  <p className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Playfair Display, serif' }}>{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right: sign-in panel + animated inbox mock */}
          <div className="flex flex-col gap-4">
            <LoginPanel />

            {/* Trust badges */}
            <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Lock className="w-3 h-3 text-green-500" /> TLS encrypted
              </span>
              <span className="flex items-center gap-1">
                <Server className="w-3 h-3 text-blue-500" /> Your servers
              </span>
              <span className="flex items-center gap-1">
                <Shield className="w-3 h-3 text-primary" /> Row-level security
              </span>
            </div>

            {/* Animated product preview */}
            <div className="mt-2">
              <InboxMock />
            </div>
          </div>
        </div>
      </section>

      {/* ── Inbox Preview Banner ──────────────────────────────────────────── */}
      <section className="bg-muted/40 border-b border-border py-10">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-6 text-center">
            Everything you need in one workspace
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: Inbox, label: 'Smart Inbox', desc: 'AI-sorted priority view' },
              { icon: Send, label: 'Compose & Send', desc: 'Rich text + schedule send' },
              { icon: Bell, label: 'Push Alerts', desc: 'Instant new mail notification' },
              { icon: BarChart3, label: 'Admin Control', desc: 'Mailbox health dashboard' },
            ].map(item => (
              <div key={item.label} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <item.icon className="w-4 h-4 text-primary" />
                </div>
                <p className="text-sm font-semibold leading-tight">{item.label}</p>
                <p className="text-xs text-muted-foreground leading-snug">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features Grid ────────────────────────────────────────────────── */}
      <section ref={featuresRef} id="features" className="py-20 md:py-28 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="max-w-2xl mb-14">
            <Badge variant="outline" className="mb-4 text-xs font-semibold border-border text-muted-foreground">
              21 Enterprise Features
            </Badge>
            <h2
              className="text-3xl md:text-4xl font-bold tracking-tight mb-4"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              Built for the way modern teams actually work
            </h2>
            <p className="text-muted-foreground text-base leading-relaxed">
              From AI-powered smart replies to offline PWA support — every feature is designed for real-world enterprise email workflows.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map(f => (
              <div
                key={f.title}
                className="group bg-card border border-border rounded-xl p-5 hover:border-primary/40 hover:shadow-md transition-all duration-200"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                    <f.icon className="w-4.5 h-4.5 text-primary" />
                  </div>
                  {f.badge && (
                    <Badge
                      variant="outline"
                      className="text-[10px] font-bold px-1.5 py-0.5 border-accent/40 text-accent bg-accent/8"
                    >
                      {f.badge}
                    </Badge>
                  )}
                </div>
                <h3 className="font-semibold text-sm mb-1.5 text-foreground">{f.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Notifications Spotlight ──────────────────────────────────────── */}
      <section className="py-20 md:py-28 bg-muted/30 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 md:px-8 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <Badge variant="outline" className="mb-4 text-xs font-semibold border-primary/30 text-primary bg-primary/5">
              <Bell className="w-3 h-3 mr-1" /> Live Notifications
            </Badge>
            <h2
              className="text-3xl md:text-4xl font-bold tracking-tight mb-5"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              Never miss an important email again
            </h2>
            <p className="text-muted-foreground text-base leading-relaxed mb-6">
              Frimps Mail's browser push notification system delivers alerts the instant a new message arrives — 
              even when the tab is closed. Click any notification to jump straight to that email thread.
            </p>
            <ul className="space-y-3">
              {[
                'Instant desktop push notifications — no tab required',
                'Click-to-open navigates directly to the email thread',
                'Badge counts show unread totals on the browser icon',
                'Optional sound alerts configurable per user',
                'Full control via notification preferences in settings',
              ].map(item => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Mock notification card */}
          <div className="flex justify-center">
            <div className="w-full max-w-sm space-y-3">
              {/* Mock browser notification */}
              <div className="bg-card border border-border rounded-2xl p-4 shadow-lg">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
                    <Mail className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-foreground">Frimps Mail</p>
                      <p className="text-[10px] text-muted-foreground shrink-0">just now</p>
                    </div>
                    <p className="text-xs font-semibold mt-0.5 truncate">New message from Supplier</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      Re: Q3 Fuel Delivery Schedule — Please find the updated delivery...
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="flex-1 text-xs font-semibold bg-primary text-primary-foreground rounded-full py-1.5 hover:opacity-90 transition-opacity">
                    Open email
                  </button>
                  <button className="flex-1 text-xs font-medium border border-border rounded-full py-1.5 hover:bg-muted transition-colors">
                    Dismiss
                  </button>
                </div>
              </div>

              {/* Feature bullets */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { icon: Bell, label: 'Push API', sub: 'Native browser' },
                  { icon: Zap, label: 'Real-time', sub: 'Supabase LISTEN' },
                  { icon: Lock, label: 'Permission', sub: 'User-controlled' },
                  { icon: Globe, label: 'Offline PWA', sub: 'Service worker' },
                ].map(item => (
                  <div key={item.label} className="bg-card border border-border rounded-xl p-3 text-center">
                    <item.icon className="w-4 h-4 text-primary mx-auto mb-1" />
                    <p className="text-xs font-semibold">{item.label}</p>
                    <p className="text-[10px] text-muted-foreground">{item.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <section id="faq" className="py-20 md:py-28 bg-muted/20 border-b border-border">
        <div className="max-w-3xl mx-auto px-4 md:px-8">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-4 text-xs font-semibold border-border text-muted-foreground">
              FAQ
            </Badge>
            <h2
              className="text-3xl md:text-4xl font-bold tracking-tight"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              Frequently asked questions
            </h2>
          </div>
          <div className="bg-card border border-border rounded-2xl px-6 divide-y divide-border">
            {faqs.map(faq => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ───────────────────────────────────────────────────── */}
      <section className="py-20 md:py-28 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 md:px-8 text-center">
          <h2
            className="text-3xl md:text-5xl font-bold tracking-tight mb-6"
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            Ready to upgrade your team's email?
          </h2>
          <p className="text-muted-foreground text-base md:text-lg mb-8 max-w-xl mx-auto leading-relaxed">
            Sign in now to access your Frimps Mail inbox — your cPanel mailboxes, AI features, and push notifications are ready.
          </p>
          <a href="#signin">
            <Button size="lg" className="rounded-full font-semibold h-12 px-8">
              Sign in to your inbox <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </a>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="py-10 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <img
                src={defaultLogoUrl}
                alt="Frimps Oil"
                className="h-7 w-auto object-contain"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <span className="text-sm font-semibold text-muted-foreground" style={{ fontFamily: 'Playfair Display, serif' }}>
                Frimps Mail
              </span>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              © {new Date().getFullYear()} Frimps Mail — Frimps Oil Company. Professional webmail for your team.
            </p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <Link to="/login" className="hover:text-foreground transition-colors">Sign in</Link>
              <a href="mailto:admin@frimpsoil.com.gh" className="hover:text-foreground transition-colors">Support</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
