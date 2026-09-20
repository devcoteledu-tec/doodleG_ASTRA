// Shared helper for looking up a PIN code against India Post's official,
// free/public API (no key required). Extracted from
// src/app/api/verify-pincode/route.ts so src/app/api/orders/route.ts can
// resolve gpo_name/district/state the same way, rather than duplicating
// the fetch/parse logic.
//
// This is intentionally the ONLY external-network dependency left in the
// PIN-handling code — the shipping *cost* itself (src/lib/shipping.ts) is
// now pure arithmetic on the two pincodes and never calls out to anything,
// after repeated production issues with the previous offline-dataset
// approach (india-pincode's bundled data file wasn't reliably traced into
// Vercel's serverless function output). Callers here must treat a failed
// lookup as non-fatal — see resolvePincodeLocation's return type.

const INDIA_POST_BASE = 'https://api.postalpincode.in/pincode';

interface IndiaPostOffice {
  Name: string;
  District: string;
  State: string;
  Country: string;
}
interface IndiaPostResponse {
  Status: string;
  PostOffice: IndiaPostOffice[] | null;
}

export interface ResolvedPincodeLocation {
  valid: boolean;
  district?: string;
  state?: string;
  country?: string;
  /** Distinct post office names sharing this PIN. */
  offices?: string[];
}

/**
 * Resolves a 6-digit PIN via India Post's live API. Returns
 * `{ valid: false }` for a not-found/invalid PIN, and `null` (not a thrown
 * error) if the upstream is unreachable/slow/malformed — callers should
 * treat `null` as "couldn't verify right now", not as an error to surface
 * to the user as a hard failure.
 */
export async function resolvePincodeLocation(pincode: string): Promise<ResolvedPincodeLocation | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const upstream = await fetch(`${INDIA_POST_BASE}/${pincode}`, { signal: controller.signal });
    if (!upstream.ok) return null;

    const data = (await upstream.json().catch(() => null)) as IndiaPostResponse[] | null;
    const result = data?.[0];

    if (!result || result.Status !== 'Success' || !result.PostOffice?.length) {
      return { valid: false };
    }

    const first = result.PostOffice[0];
    const offices = Array.from(new Set(result.PostOffice.map(po => po.Name)));

    return { valid: true, district: first.District, state: first.State, country: first.Country, offices };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
