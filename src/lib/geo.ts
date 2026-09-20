// ── Pincode "distance" for shipping estimates ──
// This used to resolve real coordinates via an offline dataset package
// (india-pincode) and compute haversine distance. That package caused
// repeated production issues on Vercel — its bundled data file wasn't
// reliably traced into the serverless function output (outputFileTracingIncludes
// workarounds, __dirname bugs in its ESM build, etc.) — so it's been
// replaced with a much simpler, dependency-free proxy: the absolute
// numeric difference between the two 6-digit PIN codes.
//
// This is explicitly NOT a real distance — PIN codes aren't spatially
// encoded that way (see conversation). It's a coarse, always-computable
// stand-in chosen for reliability over accuracy: no external package, no
// network call, no dataset coverage gaps, so a shipping estimate can
// always be produced as long as both PINs are valid 6-digit numbers.

/** Absolute numeric difference between two 6-digit PIN codes. */
export function pincodeNumericDelta(pincodeA: string, pincodeB: string): number {
  return Math.abs(parseInt(pincodeA, 10) - parseInt(pincodeB, 10));
}
