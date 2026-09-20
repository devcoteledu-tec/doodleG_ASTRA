import crypto from 'crypto';

/** How long a freshly-issued verification code stays valid. */
export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Generates a 6-digit numeric code, e.g. "042917". Zero-padded. */
export function generateOtp(): string {
  const n = crypto.randomInt(0, 1_000_000);
  return n.toString().padStart(6, '0');
}

/**
 * OTP codes are never stored in plaintext — only this SHA-256 digest is
 * persisted (see supabase_migration_012). Codes are short-lived and
 * single-purpose, so a fast hash is fine here (unlike passwords, which use
 * bcrypt in src/lib/password.ts).
 */
export function hashOtp(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/** Constant-time-ish comparison via hash equality (avoids leaking timing on plain string compare). */
export function verifyOtp(code: string, hash: string): boolean {
  const candidate = hashOtp(code);
  if (candidate.length !== hash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(hash));
}

export function otpExpiryTimestamp(): string {
  return new Date(Date.now() + OTP_TTL_MS).toISOString();
}

export function isOtpExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return true;
  const expires = new Date(expiresAt).getTime();
  return !Number.isFinite(expires) || expires <= Date.now();
}
