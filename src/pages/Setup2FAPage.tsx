import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, supabaseUrl } from '@/db/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { ShieldCheck, Copy, Loader2, AlertCircle } from 'lucide-react';
import { logSecurityEvent } from '@/services/securityAudit';

interface EnrollData {
  id: string;
  qrCode: string;    // SVG or data-URI
  secret: string;    // plain-text TOTP secret for manual entry
}

export default function Setup2FAPage() {
  const { organization, staffUser, refreshMfaStatus } = useAuth();
  const navigate = useNavigate();

  const [enrollData, setEnrollData] = useState<EnrollData | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const branding = organization?.branding_config ?? {};
  const primaryColor = (branding as Record<string, string>).primary_color ?? '#E31E24';
  const logoUrl = (branding as Record<string, string>).logo_url
    ?? `${supabaseUrl}/storage/v1/object/public/logos/frimps-logo.png`;

  // On mount: list existing factors first. If a verified factor exists, just mark
  // the DB as enrolled and redirect. Otherwise, delete any leftover (stale)
  // unverified TOTP factors and enroll a fresh one.
  useEffect(() => {
    let cancelled = false;
    const setup = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data: factorsData, error: listErr } = await supabase.auth.mfa.listFactors();
        if (listErr) throw listErr;

        const verifiedFactor = factorsData?.totp?.find(f => f.status === 'verified');
        if (verifiedFactor) {
          // User already has a verified factor but the DB flag is out of sync
          if (staffUser) {
            await supabase.from('staff_users').update({
              mfa_enrolled: true,
              mfa_enrolled_at: new Date().toISOString(),
            }).eq('id', staffUser.id);
          }
          await refreshMfaStatus();
          if (!cancelled) {
            toast.success('Two-factor authentication is already enabled');
            navigate('/inbox', { replace: true });
          }
          return;
        }

        // Drop any leftover TOTP factors (including unverified/stale ones) so setup
        // always starts from a clean state. Unverified factors are returned in the
        // "all" array but are not surfaced in typed "totp".
        const remainingFactors = factorsData?.all?.filter(f => f.factor_type === 'totp') ?? [];
        for (const factor of remainingFactors) {
          const { error: unenrollErr } = await supabase.auth.mfa.unenroll({
            factorId: factor.id,
          });
          if (unenrollErr && !unenrollErr.message?.includes('not found')) {
            throw unenrollErr;
          }
        }

        // Enroll a fresh factor
        const { data, error: enrollErr } = await supabase.auth.mfa.enroll({
          factorType: 'totp',
        });
        if (enrollErr) throw enrollErr;
        if (!data) throw new Error('Could not start 2FA setup. Please refresh.');

        if (!cancelled) {
          setEnrollData({
            id: data.id,
            qrCode: data.totp.qr_code,
            secret: data.totp.secret,
          });
        }

        // Create a challenge immediately so it's ready when the user types
        const { data: chal, error: chalErr } = await supabase.auth.mfa.challenge({ factorId: data.id });
        if (!cancelled) {
          if (chalErr || !chal) setError(chalErr?.message ?? 'Could not create MFA challenge.');
          else setChallengeId(chal.id);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not start 2FA setup. Please refresh.');
          setLoading(false);
        }
      }
    };

    setup();
    return () => { cancelled = true; };
  }, [navigate, refreshMfaStatus, staffUser]);

  const handleVerify = async () => {
    if (!enrollData || !challengeId || code.length !== 6) return;
    setVerifying(true);
    setError(null);
    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId: enrollData.id,
      challengeId,
      code,
    });
    if (verifyErr) {
      setError('Incorrect code — please try again.');
      setVerifying(false);
      return;
    }
    // Mark enrolled in DB
    if (staffUser) {
      await supabase.from('staff_users').update({
        mfa_enrolled: true,
        mfa_enrolled_at: new Date().toISOString(),
      }).eq('id', staffUser.id);
    }
    await refreshMfaStatus();
    await logSecurityEvent('mfa_enroll', { factor_id: enrollData.id });
    toast.success('Two-factor authentication enabled!');
    navigate('/inbox', { replace: true });
  };

  const copySecret = () => {
    if (enrollData?.secret) {
      navigator.clipboard.writeText(enrollData.secret);
      toast.success('Secret copied to clipboard');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#f4f4f5' }}>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <img src={logoUrl} alt="Logo" className="h-12 w-auto object-contain" />
        </div>

        <Card className="shadow-xl border-0">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ background: `${primaryColor}15` }}>
              <ShieldCheck className="w-6 h-6" style={{ color: primaryColor }} />
            </div>
            <CardTitle className="text-xl">Set up two-factor authentication</CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              Scan the QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.), then enter the 6-digit code to confirm.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {loading ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Generating QR code…</p>
              </div>
            ) : error && !enrollData ? (
              <div className="flex items-start gap-3 rounded-lg bg-destructive/10 p-4">
                <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            ) : enrollData ? (
              <>
                {/* QR Code */}
                <div className="flex flex-col items-center gap-3">
                  <div
                    className="p-3 rounded-xl border border-border bg-white"
                    dangerouslySetInnerHTML={{ __html: enrollData.qrCode }}
                  />
                  <p className="text-xs text-muted-foreground text-center">
                    Can't scan? Enter the secret manually below.
                  </p>
                  <button
                    onClick={copySecret}
                    className="flex items-center gap-2 font-mono text-xs bg-muted rounded-lg px-3 py-2 hover:bg-muted/80 transition-colors w-full justify-between"
                  >
                    <span className="truncate">{enrollData.secret}</span>
                    <Copy className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                  </button>
                </div>

                {/* Verify code */}
                <div className="space-y-2">
                  <Label>Verification code</Label>
                  <Input
                    placeholder="000000"
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={e => e.key === 'Enter' && handleVerify()}
                    inputMode="numeric"
                    className="text-center text-2xl tracking-widest font-mono h-12"
                    maxLength={6}
                    autoFocus
                  />
                  {error && (
                    <p className="text-xs text-destructive flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
                    </p>
                  )}
                </div>

                <Button
                  className="w-full"
                  style={{ background: primaryColor }}
                  onClick={handleVerify}
                  disabled={code.length !== 6 || verifying}
                >
                  {verifying ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying…</> : 'Enable 2FA'}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  This is required for all staff accounts. You won't be able to access your inbox until 2FA is set up.
                </p>
              </>
            ) : null}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Frimps Mail · Two-Factor Authentication
        </p>
      </div>
    </div>
  );
}
