# Security

## Reporting vulnerabilities

If you discover a security vulnerability, please report it privately rather
than opening a public issue. Contact the maintainer directly.

## CSRF protection

This application does not use a traditional per-request CSRF token. The
intended mitigation is the combination of three independent layers:

1. **SameSite=Lax session cookies** — the browser will not attach the
   session cookie on cross-origin POST/PUT/DELETE requests initiated by a
   third-party site (see `src/lib/session.ts`).

2. **JSON-only API surface** — every state-changing route parses
   `req.json()`, never `application/x-www-form-urlencoded` or
   `multipart/form-data`. A cross-origin `<form>` submission cannot
   produce a `Content-Type: application/json` request, so it is rejected
   before any business logic runs.

3. **CORS default-deny** — Next.js does not set `Access-Control-Allow-Origin`
   unless explicitly configured. No CORS headers are configured in this
   app, so the browser blocks cross-origin `fetch()` calls from reading
   the response (and preflight for non-simple methods fails outright).

Together these prevent a third-party site from forging authenticated
requests on behalf of a signed-in user.

## Authentication

- Passwords are hashed with **bcrypt** at cost factor 12 (see
  `src/lib/password.ts`). Legacy SHA-256 hashes from an earlier scheme are
  transparently upgraded on next successful login.

- Sessions are signed **HS256 JWTs** stored in an `httpOnly`, `Secure`,
  `SameSite=Lax` cookie with a 7-day expiry (see `src/lib/session.ts`).

- The `SESSION_SECRET` minimum length (32 characters) is enforced at server
  boot — the app refuses to start if the secret is too short or missing.

## Defense in depth

Every protected route is gated **twice**: once by the Next.js middleware
(`middleware.ts`) and once by the route handler itself via
`getSessionFromRequest`. If either gate is accidentally removed, the other
still blocks unauthenticated access.

## Payment security (Razorpay)

Online orders go through three independent verification steps before the
order is ever created (see `src/app/api/orders/route.ts`):

1. **Signature verification** — proves the callback was actually issued by
   Razorpay, not forged by the client.
2. **Replay protection** — rejects a valid payment ID that has already been
   used for a previous order.
3. **Amount verification** — confirms the amount Razorpay captured matches
   the server-computed total for this exact cart (never the client-supplied
   total).

All prices are recomputed server-side from the database by
`computeServerTrustedPricing` — the client cannot influence the charged
amount.

## Rate limiting

Auth-sensitive and billed API routes are protected by a **database-backed
atomic rate limiter** (`src/lib/rateLimit.ts`) that is global across all
serverless instances and fails **closed** on database errors — if the
rate-limit store is unreachable, requests are denied rather than allowed
through.

## HTTP security headers

All responses carry a hardened header set configured in `next.config.ts`:

- `Content-Security-Policy` — hand-tuned per-directive policy
- `Strict-Transport-Security` — 2-year max-age with `preload`
- `X-Frame-Options: DENY` and `frame-ancestors 'none'`
- `Cross-Origin-Opener-Policy: same-origin-allow-popups`
- `Cross-Origin-Resource-Policy: same-origin`
- `Permissions-Policy` — deny-by-default for all device APIs
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

## Environment variables

- The Supabase **service role key** is only ever used server-side
  (`src/lib/supabaseAdmin.ts`). A runtime guard throws immediately if the
  module is ever imported in a browser context.
- `.env.local` is gitignored and never committed. `.env.example` contains
  placeholder values and setup instructions only.
- All required variables are validated at server **boot** (not build time)
  via `src/lib/env.ts` + `instrumentation.ts`. A misconfigured deploy fails
  loudly instead of silently serving mock data to real customers.

## Dependency auditing

Run `npm audit` regularly. The CI pipeline should be extended with
`npm audit --audit-level=high` once GitHub Actions is connected.
