import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { MailProvider } from '@/contexts/MailContext';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';
import ProtectedRoute from '@/components/ProtectedRoute';
import AdminRoute from '@/components/AdminRoute';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import CommandPalette from '@/components/mail/CommandPalette';
import LandingPage from '@/pages/LandingPage';
import LoginPage from '@/pages/LoginPage';
import InboxPage from '@/pages/InboxPage';
import AdminMailboxesPage from '@/pages/AdminMailboxesPage';
import AdminDashboardPage from '@/pages/AdminDashboardPage';
import WebhooksPage from '@/pages/WebhooksPage';
import ContactsPage from '@/pages/ContactsPage';
import CalendarPage from '@/pages/CalendarPage';
import SettingsPage from '@/pages/SettingsPage';
import AdminResourcesPage from '@/pages/AdminResourcesPage';
import AdminSyncStatusPage from '@/pages/AdminSyncStatusPage';
import ResourceSchedulePage from '@/pages/ResourceSchedulePage';
import FollowUpsPage from '@/pages/FollowUpsPage';
import NotFound from '@/pages/NotFound';

function PublicModule({ name, children }: { name: string; children: ReactNode }) {
  return <ErrorBoundary moduleName={name}>{children}</ErrorBoundary>;
}

function MailModule({ name, children }: { name: string; children: ReactNode }) {
  return (
    <ProtectedRoute>
      <MailProvider>
        <ErrorBoundary moduleName={name}>
          <CommandPalette />
          {children}
        </ErrorBoundary>
      </MailProvider>
    </ProtectedRoute>
  );
}

function AdminModule({ name, children }: { name: string; children: ReactNode }) {
  return (
    <AdminRoute>
      <ErrorBoundary moduleName={name}>{children}</ErrorBoundary>
    </AdminRoute>
  );
}

function AppRoutes() {
  useGlobalShortcuts();
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<PublicModule name="Landing"><LandingPage /></PublicModule>} />
      <Route path="/login" element={<PublicModule name="Login"><LoginPage /></PublicModule>} />
      {/* MFA flow — semi-authenticated (password done, MFA pending) */}
      <Route path="/setup-2fa" element={<Navigate to="/inbox" replace />} />
      <Route path="/verify-2fa" element={<Navigate to="/inbox" replace />} />
      {/* Protected (requires AAL2) */}
      <Route path="/inbox" element={<MailModule name="Inbox"><InboxPage /></MailModule>} />
      <Route path="/inbox/contacts" element={<MailModule name="Contacts"><ContactsPage /></MailModule>} />
      <Route path="/inbox/groups" element={<Navigate to="/inbox/contacts?tab=groups" replace />} />
      <Route path="/inbox/calendar" element={<MailModule name="Calendar"><CalendarPage /></MailModule>} />
      <Route path="/inbox/schedule" element={<Navigate to="/inbox/calendar" replace />} />
      <Route path="/inbox/follow-ups" element={<MailModule name="Follow-ups"><FollowUpsPage /></MailModule>} />
      <Route path="/inbox/resource-schedule" element={<MailModule name="Resource schedule"><ResourceSchedulePage /></MailModule>} />
      <Route path="/inbox/resources" element={<Navigate to="/inbox/resource-schedule" replace />} />
      <Route path="/inbox/settings" element={<MailModule name="Settings"><SettingsPage /></MailModule>} />
      {/* Admin (requires AAL2 + admin role) */}
      <Route path="/admin/mailboxes" element={<AdminModule name="Admin mailboxes"><AdminMailboxesPage /></AdminModule>} />
      <Route path="/admin/dashboard" element={<AdminModule name="Admin dashboard"><AdminDashboardPage /></AdminModule>} />
      <Route path="/admin/webhooks" element={<AdminModule name="Webhooks"><WebhooksPage /></AdminModule>} />
      <Route path="/admin/resources" element={<AdminModule name="Resources"><AdminResourcesPage /></AdminModule>} />
      <Route path="/admin/sync-status" element={<AdminModule name="Sync status"><AdminSyncStatusPage /></AdminModule>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
        <Toaster position="bottom-right" richColors />
      </AuthProvider>
    </ThemeProvider>
  );
}
