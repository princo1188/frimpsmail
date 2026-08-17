
-- ============================================================
-- Notification sound preference
-- ============================================================
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS sound_preset text DEFAULT 'chime',
  ADD COLUMN IF NOT EXISTS custom_sound_url text DEFAULT NULL;

-- Add storage bucket for custom notification sounds
INSERT INTO storage.buckets (id, name, public)
VALUES ('notification-sounds', 'notification-sounds', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: users can read/write their own sounds
CREATE POLICY "notification_sounds_own_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'notification-sounds' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "notification_sounds_own_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'notification-sounds' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "notification_sounds_own_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'notification-sounds' AND (storage.foldername(name))[1] = auth.uid()::text);
