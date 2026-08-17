
-- ============================================================
-- Notification Preferences
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  push_enabled boolean NOT NULL DEFAULT true,
  sound_enabled boolean NOT NULL DEFAULT false,
  badge_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT notification_preferences_user_unique UNIQUE (staff_user_id)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_prefs_own" ON public.notification_preferences
  USING (staff_user_id = auth.uid())
  WITH CHECK (staff_user_id = auth.uid());

-- Saved searches: add text query column (if still jsonb from old migration)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'saved_searches'
      AND column_name = 'query'
      AND data_type = 'jsonb'
  ) THEN
    ALTER TABLE public.saved_searches
      ALTER COLUMN query TYPE text USING (query::text),
      ALTER COLUMN query SET DEFAULT '';
  END IF;
END $$;

-- Add filters column to saved_searches if missing
ALTER TABLE public.saved_searches
  ADD COLUMN IF NOT EXISTS filters jsonb DEFAULT '{}';
