import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';
import ProtectedRoute from '@/components/ProtectedRoute';
import AdminRoute from '@/components/AdminRoute';
import LandingPage from '@/pages/LandingPage';
import LoginPage from '@/pages/LoginPage';
import InboxPage from '@/pages/InboxPage';
import AdminMailboxesPage from '@/pages/AdminMailboxesPage';
import AdminDashboardPage from '@/pages/AdminDashboardPage';
import WebhooksPage from '@/pages/WebhooksPage';
import ContactsPage from '@/pages/ContactsPage';
import CalendarPage from '@/pages/CalendarPage';
import SettingsPage from '@/pages/SettingsPage';
import Setup2FAPage from '@/pages/Setup2FAPage';
import Verify2FAPage from '@/pages/Verify2FAPage';
import AdminResourcesPage from '@/pages/AdminResourcesPage';
import ResourceSchedulePage from '@/pages/ResourceSchedulePage';

function AppRoutes() {
  useGlobalShortcuts();
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      {/* MFA flow — semi-authenticated (password done, MFA pending) */}
      <Route path="/setup-2fa" element={<Setup2FAPage />} />
      <Route path="/verify-2fa" element={<Verify2FAPage />} />
      {/* Protected (requires AAL2) */}
      <Route path="/inbox" element={<ProtectedRoute><InboxPage /></ProtectedRoute>} />
      <Route path="/inbox/contacts" element={<ProtectedRoute><ContactsPage /></ProtectedRoute>} />
      <Route path="/inbox/calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
      <Route path="/inbox/resource-schedule" element={<ProtectedRoute><ResourceSchedulePage /></ProtectedRoute>} />
      <Route path="/inbox/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      {/* Admin (requires AAL2 + admin role) */}
      <Route path="/admin/mailboxes" element={<AdminRoute><AdminMailboxesPage /></AdminRoute>} />
      <Route path="/admin/dashboard" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />
      <Route path="/admin/webhooks" element={<AdminRoute><WebhooksPage /></AdminRoute>} />
      <Route path="/admin/resources" element={<AdminRoute><AdminResourcesPage /></AdminRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
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
