/**
 * Durable, shared rate limiter backed by a Supabase table
 * (rate_limit_windows) and an atomic Postgres function
 * (check_and_increment_rate_limit — see supabase_migration_014_rate_limit_store.sql).
 *
 * This replaces the previous in-memory Map implementation, which had two
 * problems on Vercel's serverless deployments:
 *  - State lived in a module-level Map, so it reset on every cold start /
 *    redeploy.
 *  - Each concurrently-running instance had its own Map, so the *effective*
 *    limit across all instances was (limit × instance count), not the
 *    configured limit.
 * Together these made brute-force protection on the auth routes, and the
 * billing guard on the unauthenticated AI routes (/api/curate,
 * /api/card-writer), both effectively bypassable. Backing the counter with
 * a single Supabase table makes the limit global and atomic instead.
 */

import { supabaseAdmin } from './supabaseAdmin';

// Fallback used when no IP can be determined from headers at all (e.g. a
// local request with no proxy in front of it). Everyone without an IP
// shares one bucket rather than skipping the limit entirely.
const NO_IP_SHARED_KEY = 'no-ip';

/** Extracts the caller's IP from the headers a proxy (Vercel) sets, if present. */
export function getClientIp(headers: Headers): string {
  // 'x-forwarded-for' can be a comma-separated list (client, proxy1, proxy2, ...);
  // the first entry is the original client.
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }

  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  return NO_IP_SHARED_KEY;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the caller should retry — only meaningful when !allowed. */
  retryAfterSeconds: number;
}

interface RateLimitRpcRow {
  allowed: boolean;
  retry_after_seconds: number;
}

// Used whenever the RPC call itself fails (network/DB error) — every call
// site of checkRateLimit guards either an auth-sensitive route or a route
// that calls a billed third-party API, so an unreachable rate-limit store
// must fail CLOSED (treat the request as not allowed) rather than silently
// letting an unlimited number of requests through during an outage. 60
// seconds is an arbitrary but reasonable "try again shortly" hint; the
// underlying DB issue is what actually needs to resolve, not this timer.
const RPC_FAILURE_RETRY_AFTER_SECONDS = 60;

/**
 * Fixed-window check-and-increment for `key`, backed by a shared Supabase
 * table so the count is enforced globally across every serverless instance
 * and survives restarts. Returns whether this call is within `limit`
 * requests per `windowMs`, and (when it isn't) how long until the window
 * resets.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const { data, error } = await supabaseAdmin.rpc('check_and_increment_rate_limit', {
    p_key: key,
    p_limit: limit,
    p_window_ms: windowMs,
  });

  if (error) {
    console.error(`Rate limit RPC failed for key "${key}":`, error);
    return { allowed: false, retryAfterSeconds: RPC_FAILURE_RETRY_AFTER_SECONDS };
  }

  const row: RateLimitRpcRow | undefined = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.allowed !== 'boolean') {
    return { allowed: false, retryAfterSeconds: RPC_FAILURE_RETRY_AFTER_SECONDS };
  }

  return {
    allowed: Boolean(row.allowed),
    retryAfterSeconds: Number(row.retry_after_seconds) || 0,
  };
}
