
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS mfa_enrolled boolean NOT NULL DEFAULT false;
ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS mfa_enrolled_at timestamptz;

COMMENT ON COLUMN staff_users.mfa_enrolled IS 'True once user has confirmed TOTP enrollment';
COMMENT ON COLUMN staff_users.mfa_enrolled_at IS 'Timestamp of first successful MFA enrollment';
