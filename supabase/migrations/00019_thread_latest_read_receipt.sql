
-- Add column to threads table
ALTER TABLE threads ADD COLUMN IF NOT EXISTS latest_read_receipt_at timestamptz;

-- Backfill from existing confirmed receipts
UPDATE threads t
SET latest_read_receipt_at = sub.max_receipt
FROM (
  SELECT thread_id, MAX(read_receipt_confirmed_at) AS max_receipt
  FROM messages
  WHERE read_receipt_confirmed_at IS NOT NULL
  GROUP BY thread_id
) sub
WHERE t.id = sub.thread_id;

-- Trigger function: update thread when a message receipt is confirmed
CREATE OR REPLACE FUNCTION update_thread_receipt()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.read_receipt_confirmed_at IS NOT NULL AND
     (OLD.read_receipt_confirmed_at IS NULL OR NEW.read_receipt_confirmed_at <> OLD.read_receipt_confirmed_at) THEN
    UPDATE threads
    SET latest_read_receipt_at = GREATEST(COALESCE(latest_read_receipt_at, '1970-01-01'), NEW.read_receipt_confirmed_at)
    WHERE id = NEW.thread_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_thread_receipt ON messages;
CREATE TRIGGER trg_update_thread_receipt
AFTER UPDATE OF read_receipt_confirmed_at ON messages
FOR EACH ROW EXECUTE FUNCTION update_thread_receipt();
