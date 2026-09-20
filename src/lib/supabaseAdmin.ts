import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ── Server-only Supabase client ──
// Uses the service role key, which bypasses Row-Level Security. This file
// must NEVER be imported from a 'use client' component or any code that
// ships to the browser — the service role key would be exposed to every
// visitor if it were. All API routes under src/app/api/** should import
// this client (not src/lib/supabase.ts) so that they can safely and
// deliberately bypass RLS after verifying the caller's identity themselves.
if (typeof window !== 'undefined') {
  throw new Error(
    'src/lib/supabaseAdmin.ts was imported in the browser. This client uses ' +
      'the Supabase service role key and must only ever run on the server.'
  );
}

// The client is created lazily, on first actual use, rather than at module
// load time. This matters because this module gets imported (transitively)
// during `next build`'s page-data-collection step, which runs without real
// runtime secrets in most CI/build environments. Eagerly calling
// `createClient()` with an empty URL throws immediately and fails the build
// even though no request is ever made. Deferring construction to request
// time means the build succeeds everywhere, while `src/lib/env.ts` still
// enforces that these vars are actually present before the app serves
// traffic in production.
let cachedClient: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn(
      'Supabase admin environment variables are missing! Make sure ' +
        'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in your ' +
        'server environment (never prefix the service role key with NEXT_PUBLIC_).'
    );
  }

  cachedClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return cachedClient;
}

// Proxy so every existing call site (`supabaseAdmin.from(...)`, etc.) keeps
// working unchanged — the real client is only instantiated the first time a
// property is actually accessed, i.e. at request time, not at import time.
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getSupabaseAdmin();
    return Reflect.get(client as object, prop, receiver);
  },
});
