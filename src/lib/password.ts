import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const COST_FACTOR = 12;

/** Hash a plaintext password with bcrypt (per-password salt, cost factor 12). */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST_FACTOR);
}

/** Verify a plaintext password against a bcrypt hash. */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** True if `hash` looks like a bcrypt hash ($2a$/$2b$/$2y$ prefix). */
export function isBcryptHash(hash: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(hash);
}

/**
 * The old (insecure) hashing scheme this app used before the bcrypt migration.
 * Kept only so existing rows can be verified once and transparently upgraded
 * to bcrypt on next successful login — never use this for new passwords.
 */
export function legacySha256(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}
