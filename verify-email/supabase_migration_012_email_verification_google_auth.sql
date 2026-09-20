-- Migration 012: Email verification (OTP) + Google OAuth support
--
-- Adds everything the redesigned /auth page needs:
--   - email_verified          : gate on /api/auth/signin until the address is confirmed
--   - otp_code_hash / otp_expires_at / otp_purpose : short-lived signup verification code
--   - auth_provider           : 'password' | 'google'
--   - google_sub              : Google's stable per-account subject id (unique)
--
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS throughout).

ALTER TABLE signin ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE signin ADD COLUMN IF NOT EXISTS otp_code_hash TEXT;
ALTER TABLE signin ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE signin ADD COLUMN IF NOT EXISTS otp_purpose TEXT;
ALTER TABLE signin ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'password';
ALTER TABLE signin ADD COLUMN IF NOT EXISTS google_sub TEXT;

-- password_hash is now nullable in practice (Google-only accounts have none) —
-- make that explicit for anyone reading the schema.
ALTER TABLE signin ALTER COLUMN password_hash DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS signin_google_sub_unique_idx
  ON signin (google_sub)
  WHERE google_sub IS NOT NULL;

-- Existing rows created before this migration are grandfathered in as verified
-- so current users aren't suddenly locked out of sign-in.
UPDATE signin SET email_verified = TRUE WHERE email_verified IS NOT TRUE;
