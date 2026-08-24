import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '@/db/supabase';
import type { User, Session } from '@supabase/supabase-js';
import type { StaffUser, Organization } from '@/types/types';

export type MfaStatus = 'loading' | 'enrolled' | 'not_enrolled';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  staffUser: StaffUser | null;
  organization: Organization | null;
  loading: boolean;
  /** Whether the current session has passed the AAL2 (MFA) challenge */
  mfaVerified: boolean;
  /** Whether the user has an active TOTP factor enrolled */
  mfaStatus: MfaStatus;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null; requiresSignIn: boolean }>;
  signOut: () => Promise<void>;
  refreshStaffUser: () => Promise<void>;
  /** Re-check MFA AAL level — call after completing MFA verify/enroll */
  refreshMfaStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [staffUser, setStaffUser] = useState<StaffUser | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaVerified, setMfaVerified] = useState(false);
  const [mfaStatus, setMfaStatus] = useState<MfaStatus>('loading');

  const checkMfaLevel = useCallback(async () => {
    try {
      const { data: aalData, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) throw error;
      if (!aalData) throw new Error('Could not determine MFA status');
      // AAL2 means MFA challenge was passed this session
      const verified = aalData.currentLevel === 'aal2';
      setMfaVerified(verified);
      // nextLevel === 'aal2' means at least one factor is enrolled
      const enrolled = aalData.nextLevel === 'aal2' || aalData.currentLevel === 'aal2';
      setMfaStatus(enrolled ? 'enrolled' : 'not_enrolled');
    } catch {
      setMfaVerified(false);
      setMfaStatus('not_enrolled');
    }
  }, []);

  const fetchStaffUser = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('staff_users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (!error && data) {
      setStaffUser(data as StaffUser);
      const { data: org } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', data.organization_id)
        .maybeSingle();
      if (org) setOrganization(org as Organization);
    }
  }, []);

  const applySession = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession);
    setUser(nextSession?.user ?? null);

    if (nextSession?.user) {
      setMfaStatus('loading');
      await Promise.all([fetchStaffUser(nextSession.user.id), checkMfaLevel()]);
      return;
    }

    setStaffUser(null);
    setOrganization(null);
    setMfaVerified(false);
    setMfaStatus('loading');
  }, [checkMfaLevel, fetchStaffUser]);

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 5000);

    void supabase.auth.getSession()
      .then(async ({ data: { session }, error }) => {
        if (error) throw error;
        await applySession(session);
      })
      .catch((err) => {
        // Supabase's gotrue-js may throw AbortError when another tab/request
        // steals the navigator lock. This is a transient race condition, not a
        // real auth failure; leaving state as logged-out is safe.
        if (err?.name !== 'AbortError') {
          console.error('Auth session initialization error:', err);
        }
      })
      .finally(() => {
        clearTimeout(timeout);
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      void applySession(session);
    });

    return () => subscription.unsubscribe();
  }, [applySession]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    await applySession(data.session);
    return { error: null };
  };

  const updatePassword = async (password: string) => {
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) return { error: updateError.message, requiresSignIn: false };

    // Replace the cached auth state after changing credentials. If the refresh
    // cannot complete, clear the local session rather than retaining stale data.
    const { data, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !data.session) {
      await supabase.auth.signOut({ scope: 'local' });
      await applySession(null);
      return { error: null, requiresSignIn: true };
    }

    await applySession(data.session);
    return { error: null, requiresSignIn: false };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setStaffUser(null);
    setOrganization(null);
    setMfaVerified(false);
    setMfaStatus('loading');
  };

  const refreshStaffUser = async () => {
    if (user) await fetchStaffUser(user.id);
  };

  const refreshMfaStatus = async () => {
    await checkMfaLevel();
    if (user) await fetchStaffUser(user.id);
  };

  return (
    <AuthContext.Provider value={{
      user, session, staffUser, organization, loading,
      mfaVerified, mfaStatus,
      signIn, updatePassword, signOut, refreshStaffUser, refreshMfaStatus,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
