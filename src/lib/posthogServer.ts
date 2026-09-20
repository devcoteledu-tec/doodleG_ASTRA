import { PostHog } from 'posthog-node';

// Server-side capture — used for events that must be recorded reliably
// (sign-in, sign-up) rather than depending on the client-side SDK firing
// after a redirect, which can be lost if the user closes the tab, is on a
// flaky connection, or has an ad-blocker interfering with client-side
// analytics scripts (a real gap for exactly the metric — total sign-ins —
// that matters most for accuracy).
//
// Same project API key as the client SDK (NEXT_PUBLIC_POSTHOG_KEY) — this
// is a write-only ingestion key, not a secret, so reusing the public one
// server-side is the documented/normal PostHog pattern.
let client: PostHog | null = null;

function getPostHogServerClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  if (!client) {
    client = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      // Serverless functions are short-lived — flush almost immediately
      // rather than batching, or events can be lost when the function
      // instance is torn down before the batch interval fires.
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return client;
}

/** Fire-and-forget — never throws, never blocks/fails the calling request if analytics is down or unconfigured. */
export function captureServerEvent(distinctId: string, event: string, properties?: Record<string, unknown>) {
  try {
    const ph = getPostHogServerClient();
    if (!ph) return;
    ph.capture({ distinctId, event, properties });
  } catch (err) {
    console.error('PostHog server capture failed:', err);
  }
}
