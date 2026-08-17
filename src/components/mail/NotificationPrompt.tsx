import { useState } from 'react';
import { Bell, BellOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  requestNotificationPermission,
  getNotificationPermission,
  savePrefsToDb,
  getLocalPrefs,
} from '@/services/notificationService';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface NotificationPromptProps {
  onDismiss: () => void;
}

export default function NotificationPrompt({ onDismiss }: NotificationPromptProps) {
  const { staffUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const permission = getNotificationPermission();

  if (permission !== 'default') return null;

  const handleEnable = async () => {
    setLoading(true);
    const result = await requestNotificationPermission();
    setLoading(false);
    if (result === 'granted') {
      if (staffUser) {
        const prefs = { ...getLocalPrefs(), push_enabled: true };
        await savePrefsToDb(staffUser.id, prefs);
      }
      toast.success('Push notifications enabled!');
      onDismiss();
    } else if (result === 'denied') {
      toast.error('Notifications blocked — enable them in your browser settings.');
      onDismiss();
    } else {
      onDismiss();
    }
  };

  return (
    <div className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 shadow-md w-full max-w-md animate-in slide-in-from-bottom-2">
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Bell className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">Enable push notifications</p>
        <p className="text-xs text-muted-foreground mt-0.5">Get alerted instantly when new emails arrive.</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button size="sm" className="h-7 text-xs rounded-full px-3" onClick={handleEnable} disabled={loading}>
          {loading ? <span className="h-3 w-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : 'Enable'}
        </Button>
        <button
          onClick={onDismiss}
          className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// Standalone "re-enable" button for settings
export function NotificationStatusBadge() {
  const permission = getNotificationPermission();
  if (permission === 'granted') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
        <Bell className="w-3.5 h-3.5" /> Notifications active
      </span>
    );
  }
  if (permission === 'denied') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-destructive font-medium">
        <BellOff className="w-3.5 h-3.5" /> Blocked by browser
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground font-medium">
      <Bell className="w-3.5 h-3.5" /> Not enabled
    </span>
  );
}
