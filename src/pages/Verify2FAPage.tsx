import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, supabaseUrl } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { ShieldCheck, Loader2, AlertCircle, LogOut } from 'lucide-react';
import { logSecurityEvent } from '@/services/securityAudit';

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 60;

export default function Verify2FAPage() {
  const { organization, signOut, refreshMfaStatus } = useAuth();
  const navigate = useNavigate();

  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const branding = organization?.branding_config ?? {};
  const primaryColor = (branding as Record<string, string>).primary_color ?? '#E31E24';
  const logoUrl = (branding as Record<string, string>).logo_url
    ?? `${supabaseUrl}/storage/v1/object/public/logos/frimps-logo.png`;

  // Countdown timer for lockout
  useEffect(() => {
    if (!lockoutUntil) return;
    const tick = () => {
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockoutUntil(null);
        setAttempts(0);
        setCountdown(0);
        if (timerRef.current) clearInterval(timerRef.current);
      } else {
        setCountdown(remaining);
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [lockoutUntil]);

  const isLocked = lockoutUntil !== null && Date.now() < lockoutUntil;

  const handleVerify = async () => {
    if (code.length !== 6 || isLocked) return;
    setVerifying(true);
    setError(null);

    // Get the enrolled factor
    const { data: factorsData } = await supabase.auth.mfa.listFactors();
    const factor = factorsData?.totp?.[0];
    if (!factor) {
      setError('No MFA factor found. Please contact your administrator.');
      setVerifying(false);
      return;
    }

    // Create challenge
    const { data: chal, error: chalErr } = await supabase.auth.mfa.challenge({ factorId: factor.id });
    if (chalErr || !chal) {
      setError(chalErr?.message ?? 'Could not create MFA challenge. Please try again.');
      setVerifying(false);
      return;
    }

    // Verify
    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId: factor.id,
      challengeId: chal.id,
      code,
    });

    if (verifyErr) {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      if (newAttempts >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_SECONDS * 1000;
        setLockoutUntil(until);
        setError(`Too many failed attempts. Try again in ${LOCKOUT_SECONDS} seconds.`);
      } else {
        setError(`Incorrect code. ${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts !== 1 ? 's' : ''} remaining.`);
      }
      setCode('');
      setVerifying(false);
      return;
    }

    await refreshMfaStatus();
    await logSecurityEvent('mfa_verify', { factor_id: factor.id });
    toast.success('Identity verified — welcome back!');
    navigate('/inbox', { replace: true });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#f4f4f5' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <img src={logoUrl} alt="Logo" className="h-12 w-auto object-contain" />
        </div>

        <Card className="shadow-xl border-0">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ background: `${primaryColor}15` }}>
              <ShieldCheck className="w-6 h-6" style={{ color: primaryColor }} />
            </div>
            <CardTitle className="text-xl">Two-factor authentication</CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              Enter the 6-digit code from your authenticator app to continue.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Authenticator code</Label>
              <Input
                placeholder="000000"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={e => e.key === 'Enter' && handleVerify()}
                inputMode="numeric"
                className="text-center text-2xl tracking-widest font-mono h-12"
                maxLength={6}
                disabled={isLocked}
                autoFocus
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5">
                <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive">{error}</p>
              </div>
            )}

            {isLocked && (
              <p className="text-center text-sm font-mono text-muted-foreground">
                Locked for {countdown}s
              </p>
            )}

            <Button
              className="w-full"
              style={{ background: primaryColor }}
              onClick={handleVerify}
              disabled={code.length !== 6 || verifying || isLocked}
            >
              {verifying ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying…</> : 'Verify'}
            </Button>

            <div className="pt-2 border-t border-border text-center space-y-2">
              <p className="text-xs text-muted-foreground">
                Lost access to your authenticator app?{' '}
                <span className="font-medium text-foreground">Contact your admin</span> to reset your 2FA.
              </p>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" /> Sign out and use a different account
              </button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Frimps Mail · Two-Factor Authentication
        </p>
      </div>
    </div>
  );
}
