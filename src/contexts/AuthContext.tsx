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
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!aalData) { setMfaVerified(false); setMfaStatus('loading'); return; }
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

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 5000);

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      clearTimeout(timeout);
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await Promise.all([fetchStaffUser(session.user.id), checkMfaLevel()]);
        setLoading(false);
      } else {
        setLoading(false);
      }
    }).catch((err) => {
      clearTimeout(timeout);
      setLoading(false);
      // Supabase's gotrue-js may throw AbortError when another tab/request
      // steals the navigator lock. This is a transient race condition, not a
      // real auth failure; leaving state as logged-out is safe.
      if (err?.name !== 'AbortError') {
        console.error('Auth session initialization error:', err);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchStaffUser(session.user.id);
        checkMfaLevel();
      } else {
        setStaffUser(null);
        setOrganization(null);
        setMfaVerified(false);
        setMfaStatus('loading');
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchStaffUser, checkMfaLevel]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
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
      signIn, signOut, refreshStaffUser, refreshMfaStatus,
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
