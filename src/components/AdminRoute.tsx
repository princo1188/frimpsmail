import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import type { ReactNode } from 'react';

export default function AdminRoute({ children }: { children: ReactNode }) {
  const { user, staffUser, loading } = useAuth();
  if (loading) return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (staffUser?.role !== 'admin') return <Navigate to="/inbox" replace />;
  return <>{children}</>;
}
