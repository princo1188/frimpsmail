import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import type { ReactNode } from 'react';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return (
    <div className="flex h-screen items-center justify-center" style={{ background: '#f5f5f5' }}>
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 rounded-full border-[3px] border-[#E31E24] border-t-transparent animate-spin" />
        <p className="text-sm font-medium" style={{ color: '#666' }}>Loading Frimps Mail…</p>
      </div>
    </div>
  );

  // Not signed in at all → login
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  return <>{children}</>;
}
