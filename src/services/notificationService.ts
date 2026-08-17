/**
 * Frimps Mail — Browser Notification Service
 *
 * Handles:
 *  1. Permission request + storage
 *  2. Supabase Realtime subscription for new messages
 *  3. Native Notification dispatch with click-to-open
 *  4. Tab badge count via document.title
 *  5. Optional audio alert
 */
import { supabase } from '@/db/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface NotificationPrefs {
  push_enabled: boolean;
  sound_enabled: boolean;
  badge_enabled: boolean;
  sound_preset: string;
  custom_sound_url: string | null;
}

const PREFS_KEY = 'cosmos_notif_prefs';
export const SOUND_PRESETS = [
  { id: 'chime', label: 'Clean Chime', description: 'Short, modern bell tone' },
  { id: 'ping', label: 'Soft Ping', description: 'Gentle digital ping' },
  { id: 'ding', label: 'Classic Ding', description: 'Traditional notification ding' },
  { id: 'marimba', label: 'Marimba Note', description: 'Warm marimba-style tap' },
  { id: 'subtle', label: 'Subtle Drop', description: 'Very quiet water droplet' },
  { id: 'custom', label: 'Custom Upload', description: 'Your own uploaded sound' },
] as const;

export type SoundPreset = typeof SOUND_PRESETS[number]['id'];

const DEFAULT_PREFS: NotificationPrefs = {
  push_enabled: true,
  sound_enabled: false,
  badge_enabled: true,
  sound_preset: 'chime',
  custom_sound_url: null,
};

// ── Preference storage (localStorage mirror, synced from DB) ─────────────────
export function getLocalPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return JSON.parse(raw) as NotificationPrefs;
  } catch { /* ignore */ }
  return { ...DEFAULT_PREFS };
}

export function saveLocalPrefs(prefs: NotificationPrefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

// ── Permission handling ──────────────────────────────────────────────────────
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export function getNotificationPermission(): NotificationPermission {
  if (!('Notification' in window)) return 'denied';
  return Notification.permission;
}

// ── DB sync for preferences ──────────────────────────────────────────────────
export async function loadPrefsFromDb(staffUserId: string): Promise<NotificationPrefs> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('push_enabled, sound_enabled, badge_enabled, sound_preset, custom_sound_url')
    .eq('staff_user_id', staffUserId)
    .maybeSingle();
  if (!error && data) {
    const prefs: NotificationPrefs = {
      push_enabled: data.push_enabled ?? true,
      sound_enabled: data.sound_enabled ?? false,
      badge_enabled: data.badge_enabled ?? true,
      sound_preset: data.sound_preset ?? 'chime',
      custom_sound_url: data.custom_sound_url ?? null,
    };
    saveLocalPrefs(prefs);
    return prefs;
  }
  return getLocalPrefs();
}

export async function savePrefsToDb(
  staffUserId: string,
  prefs: NotificationPrefs
): Promise<void> {
  saveLocalPrefs(prefs);
  await supabase
    .from('notification_preferences')
    .upsert(
      {
        staff_user_id: staffUserId,
        push_enabled: prefs.push_enabled,
        sound_enabled: prefs.sound_enabled,
        badge_enabled: prefs.badge_enabled,
        sound_preset: prefs.sound_preset,
        custom_sound_url: prefs.custom_sound_url,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'staff_user_id' }
    );
}

// ── Custom sound upload ─────────────────────────────────────────────────────
export async function uploadCustomSound(
  staffUserId: string,
  file: File
): Promise<{ url: string | null; error: string | null }> {
  if (!file.type.startsWith('audio/')) {
    return { url: null, error: 'Please upload an audio file (MP3, WAV, OGG).' };
  }
  if (file.size > 2 * 1024 * 1024) {
    return { url: null, error: 'Audio files must be under 2 MB.' };
  }

  const ext = file.name.split('.').pop() || 'mp3';
  const path = `${staffUserId}/${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from('notification-sounds')
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    return { url: null, error: uploadError.message };
  }

  const { data } = supabase.storage.from('notification-sounds').getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

export async function deleteCustomSound(url: string | null): Promise<void> {
  if (!url) return;
  try {
    const pathMatch = url.split('/notification-sounds/')[1];
    if (pathMatch) {
      await supabase.storage.from('notification-sounds').remove([pathMatch]);
    }
  } catch { /* ignore */ }
}

// ── Notification sound generator ────────────────────────────────────────────
function playWebAudioTone(
  ctx: AudioContext,
  type: OscillatorType,
  frequencies: number[],
  durations: number[],
  gain = 0.12
): void {
  let time = ctx.currentTime;
  frequencies.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    gainNode.gain.setValueAtTime(0, time);
    gainNode.gain.linearRampToValueAtTime(gain, time + 0.015);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + durations[i]);
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + durations[i]);
    time += durations[i] * 0.65;
  });
}

export function playPresetSound(preset: string): void {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    switch (preset) {
      case 'ping':
        playWebAudioTone(ctx, 'sine', [1200], [0.25], 0.1);
        break;
      case 'ding':
        playWebAudioTone(ctx, 'triangle', [880, 1175], [0.2, 0.35], 0.12);
        break;
      case 'marimba':
        playWebAudioTone(ctx, 'sine', [523, 659, 784], [0.15, 0.15, 0.25], 0.11);
        break;
      case 'subtle':
        playWebAudioTone(ctx, 'sine', [600, 800], [0.08, 0.12], 0.04);
        break;
      case 'chime':
      default:
        playWebAudioTone(ctx, 'sine', [880, 1100, 1320], [0.18, 0.22, 0.35], 0.1);
        break;
    }
  } catch { /* ignore */ }
}

export async function playCustomSound(url: string): Promise<void> {
  if (!url) return;
  try {
    const audio = new Audio(url);
    audio.volume = 0.5;
    await audio.play();
  } catch { /* ignore */ }
}

export function playNotificationSound(prefs: NotificationPrefs): void {
  if (!prefs.sound_enabled) return;
  if (prefs.sound_preset === 'custom' && prefs.custom_sound_url) {
    playCustomSound(prefs.custom_sound_url);
  } else {
    playPresetSound(prefs.sound_preset);
  }
}

// ── Notification dispatch ────────────────────────────────────────────────────
export function showEmailNotification(
  sender: string,
  subject: string,
  snippet: string,
  threadId: string,
  prefs: NotificationPrefs
): void {
  if (!prefs.push_enabled) return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const title = `New email from ${sender}`;
  const body = subject ? `${subject}\n${snippet}` : snippet;

  try {
    const notification = new Notification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: `cosmos-mail-${threadId}`,
      requireInteraction: false,
      silent: !prefs.sound_enabled,
    });

    notification.onclick = () => {
      window.focus();
      // Navigate to the thread — we use a custom event so the app can react
      window.dispatchEvent(
        new CustomEvent('cosmos:open-thread', { detail: { threadId } })
      );
      notification.close();
    };
  } catch { /* Notification API not available */ }

  if (prefs.sound_enabled) {
    playNotificationSound(prefs);
  }
}

// ── Badge (document.title unread count) ─────────────────────────────────────
let _unreadCount = 0;
const _baseTitle = 'Frimps Mail';

export function updateBadgeCount(count: number, prefs: NotificationPrefs): void {
  _unreadCount = count;
  if (!prefs.badge_enabled) {
    document.title = _baseTitle;
    return;
  }
  document.title = count > 0 ? `(${count}) ${_baseTitle}` : _baseTitle;

  // PWA badge API (Chrome / supported browsers)
  if ('setAppBadge' in navigator && count >= 0) {
    try {
      if (count > 0) {
        (navigator as Navigator & { setAppBadge: (n: number) => Promise<void> }).setAppBadge(count);
      } else {
        (navigator as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge();
      }
    } catch { /* ignore */ }
  }
}

export function clearBadge(): void {
  updateBadgeCount(0, getLocalPrefs());
}

export function getCurrentUnreadCount(): number {
  return _unreadCount;
}

// ── Realtime subscription ────────────────────────────────────────────────────
let _channel: RealtimeChannel | null = null;
let _subscribedMailboxId: string | null = null;

interface NewMessagePayload {
  new: {
    id: string;
    thread_id: string;
    from_name?: string | null;
    from_address?: string | null;
    body_text?: string | null;
    subject?: string | null;
  };
}

export function subscribeToNewMessages(
  mailboxId: string,
  staffUserId: string,
  onNewMessage?: (threadId: string) => void
): void {
  if (_subscribedMailboxId === mailboxId && _channel) return;

  // Unsubscribe from previous
  unsubscribeFromMessages();

  _subscribedMailboxId = mailboxId;

  _channel = supabase
    .channel(`cosmos-notif-${mailboxId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `mailbox_id=eq.${mailboxId}`,
      },
      async (payload: NewMessagePayload) => {
        const msg = payload.new;
        if (!msg?.id) return;

        // Load latest prefs from cache
        const prefs = getLocalPrefs();
        if (!prefs.push_enabled) return;

        const sender = msg.from_name || msg.from_address || 'Someone';
        const snippet =
          msg.body_text
            ? msg.body_text.replace(/\s+/g, ' ').slice(0, 100).trim()
            : '';

        // Fetch thread subject
        let subject = '';
        try {
          const { data } = await supabase
            .from('threads')
            .select('subject')
            .eq('id', msg.thread_id)
            .maybeSingle();
          subject = data?.subject ?? '';
        } catch { /* ignore */ }

        // Dispatch notification
        showEmailNotification(sender, subject, snippet, msg.thread_id, prefs);

        // Update unread count
        try {
          const { count } = await supabase
            .from('threads')
            .select('*', { count: 'exact', head: true })
            .eq('mailbox_id', mailboxId)
            .eq('is_read', false);
          if (typeof count === 'number') {
            updateBadgeCount(count, prefs);
          }
        } catch { /* ignore */ }

        onNewMessage?.(msg.thread_id);
      }
    )
    .subscribe();

  // Load initial prefs from DB (async, no await at call site)
  loadPrefsFromDb(staffUserId).then(prefs => {
    saveLocalPrefs(prefs);
  });
}

export function unsubscribeFromMessages(): void {
  if (_channel) {
    _channel.unsubscribe();
    _channel = null;
    _subscribedMailboxId = null;
  }
}

// ── Boot: request permission on demand (call from NotificationPrompt) ────────
export async function initNotifications(
  staffUserId: string,
  mailboxId: string,
  onNewMessage?: (threadId: string) => void
): Promise<NotificationPermission> {
  const permission = await requestNotificationPermission();
  if (permission === 'granted') {
    subscribeToNewMessages(mailboxId, staffUserId, onNewMessage);
  }
  return permission;
}
