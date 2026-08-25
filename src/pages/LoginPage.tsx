import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/db/supabase';
import type { BrandingConfig } from '@/types/types';

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [branding, setBranding] = useState<BrandingConfig>({
    primary_color: '#E31E24',
    accent_color: '#F7941D',
    surface_color: '#FFFFFF',
    theme_mode: 'light',
    logo_url: '',
  });

  useEffect(() => {
    if (user) navigate('/inbox', { replace: true });
  }, [user, navigate]);

  // Load branding from domain
  useEffect(() => {
    const hostname = window.location.hostname;
    const domain = hostname === 'localhost' || hostname === '127.0.0.1'
      ? 'frimpsoil.com.gh'
      : hostname;

    supabase
      .from('organizations')
      .select('branding_config, name')
      .eq('domain', domain)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.branding_config) {
          setBranding(data.branding_config as BrandingConfig);
        }
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { toast.error('Please fill in all fields'); return; }
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      toast.error(error.includes('Invalid') ? 'Invalid email or password' : error);
    } else {
      toast.success('Signed in. Checking two-factor authentication…');
    }
  };

  const bg = branding.theme_mode === 'light' ? '#f5f5f5' : '#0f1117';
  const cardBg = branding.surface_color ?? '#ffffff';
  const textColor = branding.theme_mode === 'light' ? '#121212' : '#e8eaf0';
  const mutedColor = branding.theme_mode === 'light' ? '#666' : '#8a8fa0';
  const borderColor = branding.theme_mode === 'light' ? '#e0e0e0' : '#2a2d36';

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: bg }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8"
        style={{
          background: cardBg,
          border: `1px solid ${borderColor}`,
          boxShadow: '0 8px 40px rgba(0,0,0,0.10)',
        }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          {branding.logo_url ? (
            <img
              src={branding.logo_url}
              alt="Organization logo"
              className="h-20 w-auto object-contain mb-4"
              style={{ maxWidth: 200 }}
            />
          ) : (
            <div className="flex items-center gap-2 mb-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: branding.primary_color ?? '#E31E24' }}
              >
                <Mail className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight" style={{ color: textColor, fontFamily: 'Playfair Display, serif' }}>
                Frimps Oil
              </span>
            </div>
          )}
          <h1
            className="text-2xl font-bold text-center"
            style={{ color: textColor, fontFamily: 'Playfair Display, serif' }}
          >
            Login to your account
          </h1>
          <p className="text-sm mt-1 text-center" style={{ color: mutedColor }}>
            Enter your credentials to access your mailbox
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" style={{ color: textColor }}>Email address</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="h-11"
              style={{ borderColor, background: branding.theme_mode === 'dark' ? '#1a1d24' : '#fafafa', color: textColor }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" style={{ color: textColor }}>Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="h-11 pr-10"
                style={{ borderColor, background: branding.theme_mode === 'dark' ? '#1a1d24' : '#fafafa', color: textColor }}
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: mutedColor }}
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-full font-semibold text-base mt-2"
            style={{
              background: branding.primary_color ?? '#E31E24',
              color: '#fff',
              border: 'none',
            }}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Signing in…
              </span>
            ) : 'Sign in'}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs" style={{ color: mutedColor }}>
            Can't access your account?{' '}
            <a
              href="mailto:admin@cosmosmailapp.com"
              className="font-medium underline-offset-4 hover:underline"
              style={{ color: branding.accent_color ?? '#F7941D' }}
            >
              Contact your administrator
            </a>
          </p>
        </div>

        <div className="mt-8 pt-6 text-center" style={{ borderTop: `1px solid ${borderColor}` }}>
          <p className="text-xs" style={{ color: mutedColor }}>
            Powered by <strong style={{ color: branding.primary_color }}>Frimps Mail</strong>
          </p>
        </div>
      </div>
    </div>
  );
}
