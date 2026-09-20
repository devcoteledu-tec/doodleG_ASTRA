/**
 * Next.js instrumentation hook — `register()` runs exactly once, when the
 * server actually boots (dev server start, or `next start` in production).
 * It does NOT run during `next build`'s static analysis / page-data
 * collection, which is why this is the right place for env validation
 * rather than top-level code in a shared module (see src/lib/env.ts for why
 * that distinction matters).
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
  // The env vars we care about (Supabase, Twilio, etc.) are only relevant to
  // the Node.js server runtime, not the Edge runtime middleware also loads
  // this project under.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateEnv } = await import('./src/lib/env');
    validateEnv();
  }
}

export const onRequestError: import('next').Instrumentation.onRequestError = async (error, _request, context) => {
 console.error(JSON.stringify({ event: 'request_error', route: context.routePath, message: error instanceof Error ? error.message : 'Unknown server error' }));
};
