
-- ============================================================
-- 1. Extend calendar_events with all Phase 1 + Phase 2 fields
-- ============================================================

-- Rename description -> agenda (add new column, copy, drop old)
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS agenda text;
UPDATE calendar_events SET agenda = description WHERE agenda IS NULL AND description IS NOT NULL;

-- Department
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT 'General';

-- Status (confirmed | tentative | cancelled)
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed'
  CHECK (status IN ('confirmed','tentative','cancelled'));

-- Task tracking
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS is_task boolean NOT NULL DEFAULT false;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS is_completed boolean NOT NULL DEFAULT false;

-- Recurrence (rrule)
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS recurrence_rule text;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS recurrence_end_date date;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS parent_event_id uuid REFERENCES calendar_events(id) ON DELETE SET NULL;

-- Reminders
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS reminder_minutes_before integer;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

-- ============================================================
-- 2. calendar_event_attachments
-- ============================================================
CREATE TABLE IF NOT EXISTS calendar_event_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  filename text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE calendar_event_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_access_calendar_attachments" ON calendar_event_attachments;
CREATE POLICY "org_access_calendar_attachments" ON calendar_event_attachments
  USING (
    EXISTS (
      SELECT 1 FROM calendar_events ce
      JOIN staff_users su ON su.organization_id = ce.organization_id
      WHERE ce.id = calendar_event_attachments.event_id
        AND su.id = auth.uid()
    )
  );

-- ============================================================
-- 3. resources
-- ============================================================
CREATE TABLE IF NOT EXISTS resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'other' CHECK (type IN ('room','vehicle','equipment','other')),
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_access_resources" ON resources;
CREATE POLICY "org_access_resources" ON resources
  USING (
    organization_id IN (
      SELECT organization_id FROM staff_users WHERE id = auth.uid()
    )
  );

-- Service role full access
DROP POLICY IF EXISTS "service_role_resources" ON resources;
CREATE POLICY "service_role_resources" ON resources
  TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 4. resource_bookings
-- ============================================================
CREATE TABLE IF NOT EXISTS resource_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  calendar_event_id uuid NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE resource_bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_access_resource_bookings" ON resource_bookings;
CREATE POLICY "org_access_resource_bookings" ON resource_bookings
  USING (
    EXISTS (
      SELECT 1 FROM resources r
      JOIN staff_users su ON su.organization_id = r.organization_id
      WHERE r.id = resource_bookings.resource_id
        AND su.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "service_role_resource_bookings" ON resource_bookings;
CREATE POLICY "service_role_resource_bookings" ON resource_bookings
  TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 5. Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_calendar_events_reminder
  ON calendar_events(reminder_minutes_before, start_at)
  WHERE reminder_minutes_before IS NOT NULL AND reminder_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_events_department ON calendar_events(department);
CREATE INDEX IF NOT EXISTS idx_calendar_events_parent ON calendar_events(parent_event_id) WHERE parent_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_resource_bookings_resource ON resource_bookings(resource_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_resource_bookings_event ON resource_bookings(calendar_event_id);
