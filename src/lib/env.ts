import { z } from 'zod';

/**
 * Centralized environment-variable validation.
 *
 * Historically, missing env vars (GEMINI_API_KEY, TWILIO_ACCOUNT_SID, etc.)
 * caused individual routes to silently fall back to mock behavior with only
 * a `console.warn` — fine for local dev, dangerous in production (nobody
 * notices "AI curation" is silently mocked in prod until a customer
 * complains). `validateEnv()` checks everything up front, at server boot
 * (see `instrumentation.ts`), and throws a single clear error instead of
 * letting each route discover the problem independently at request time.
 *
 * Deliberately NOT run at module-import time / `next build` time: this file
 * gets pulled in (transitively) during Next's page-data-collection step,
 * which runs without real runtime secrets in most CI/build environments.
 * Throwing there would fail the build itself rather than catching a real
 * deployment misconfiguration. `validateEnv()` is invoked explicitly from
 * `instrumentation.ts`'s `register()` hook, which only runs when the server
 * actually boots (`next start`, or the dev server) — not during `next build`.
 */

// Vars needed for the app to function at all, in every environment
// (auth + database access). Missing any of these means nothing works, dev
// or prod, so these are always required.
//
// NOTE: NEXT_PUBLIC_SUPABASE_ANON_KEY used to be listed here too, but no
// code in this app ever reads it — every Supabase call goes through
// src/lib/supabaseAdmin.ts (service role) via a route handler. Keeping
// it required blocked local dev whenever the anon key wasn't set, for
// no gain. It's fine to still have the value in your .env; it's just no
// longer *required*.
const alwaysRequiredSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string({ message: 'NEXT_PUBLIC_SUPABASE_URL is required (Supabase project URL).' })
    .url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL, e.g. https://xyz.supabase.co'),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string({ message: 'SUPABASE_SERVICE_ROLE_KEY is required.' })
    .min(1, 'SUPABASE_SERVICE_ROLE_KEY is required.'),
  SESSION_SECRET: z
    .string({ message: 'SESSION_SECRET is required.' })
    .min(32, 'SESSION_SECRET must be at least 32 characters (e.g. `openssl rand -base64 48`).'),
});

// Vars that unlock real third-party integrations instead of mock fallbacks.
// Missing in development just means "use the built-in mocks" (see
// src/services/ai.ts and src/services/whatsapp.ts) — that's fine for local
// work. Missing in production is a deployment mistake and should fail boot,
// not silently ship fake AI curations / fake WhatsApp sends to real users.
const productionOnlyRequiredSchema = z.object({
  GEMINI_API_KEY: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().min(1, 'TWILIO_ACCOUNT_SID is required in production.'),
  TWILIO_AUTH_TOKEN: z.string().min(1, 'TWILIO_AUTH_TOKEN is required in production.'),
  TWILIO_SENDER_NUMBER: z.string().min(1, 'TWILIO_SENDER_NUMBER is required in production.'),
  SUPPORT_EMAIL: z.string().email('SUPPORT_EMAIL must be a monitored support inbox.'),
  RESEND_FROM_EMAIL: z.string().min(1, 'Configure a verified sender address.'),
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required in production.'),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(16, 'Configure a strong Razorpay webhook secret.'),
  TWILIO_CONTENT_SID: z.string().min(1, 'Configure an approved WhatsApp template.'),
  TWILIO_WEBHOOK_URL: z.string().url(),
  CRON_SECRET: z.string().min(16, 'CRON_SECRET is required in production (e.g. `openssl rand -hex 32`).'),
  // Server-side secret used to create Razorpay orders and verify payment
  // signatures (src/lib/razorpay.ts). Missing in production would mean
  // checkout's "Pay Online" option 500s for every customer — fail boot
  // instead of discovering that from a support ticket.
  RAZORPAY_KEY_SECRET: z.string().min(1, 'RAZORPAY_KEY_SECRET is required in production.'),
  // Public key id — safe to expose to the browser (that's what NEXT_PUBLIC_
  // means), but still validated here so a missing value fails boot rather
  // than silently rendering a broken "Pay Online" button in prod.
  NEXT_PUBLIC_RAZORPAY_KEY_ID: z.string().min(1, 'NEXT_PUBLIC_RAZORPAY_KEY_ID is required in production.'),
});

let hasValidated = false;

/** True once validateEnv() has run in this process and NODE_ENV === 'production'. */
export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Validate `process.env` for the current NODE_ENV. Call once, at boot
 * (see instrumentation.ts). Throws in production if anything required is
 * missing; only warns outside production so local dev isn't blocked by
 * optional integrations that have mock fallbacks.
 */
export function validateEnv(): void {
  if (hasValidated) return;

  const isProd = isProductionRuntime();
  const errors: string[] = [];

  const alwaysResult = alwaysRequiredSchema.safeParse(process.env);
  if (!alwaysResult.success) {
    for (const issue of alwaysResult.error.issues) {
      errors.push(`  - ${issue.path.join('.') || '(unknown var)'}: ${issue.message}`);
    }
  }

  if (isProd) {
    const prodResult = productionOnlyRequiredSchema.safeParse(process.env);
    if (!prodResult.success) {
      for (const issue of prodResult.error.issues) {
        errors.push(`  - ${issue.path.join('.') || '(unknown var)'}: ${issue.message}`);
      }
    }
  }

  if (errors.length > 0) {
    const message =
      `Environment validation failed (NODE_ENV=${process.env.NODE_ENV ?? 'undefined'}):\n` +
      errors.join('\n') +
      '\n\nSee .env.example for the full list of required variables and where to get each one.';

    if (isProd) {
      // Fail fast: booting a production server with missing config for
      // vars the app actually depends on should never happen silently.
      throw new Error(message);
    }
    // Development / test: warn loudly, but let the process continue — the
    // mock fallbacks in src/services/ai.ts and src/services/whatsapp.ts
    // cover GEMINI_API_KEY / TWILIO_* being absent locally.
    console.warn(`[env] ${message}`);
  }

  hasValidated = true;
}
