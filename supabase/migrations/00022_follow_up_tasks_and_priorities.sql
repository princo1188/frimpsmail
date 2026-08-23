ALTER TABLE public.follow_up_reminders
  ALTER COLUMN thread_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

UPDATE public.follow_up_reminders
SET due_at = remind_at
WHERE due_at IS NULL;

DROP INDEX IF EXISTS public.idx_follow_up_reminders_due;
CREATE INDEX idx_follow_up_reminders_due
  ON public.follow_up_reminders (staff_user_id, is_dismissed, completed_at, due_at);
