'use client';

import { useEffect, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react';

// ── What this gives you, once NEXT_PUBLIC_POSTHOG_KEY is set ──
// - Visitors: PostHog auto-generates an anonymous distinct_id per browser
//   (cookie-based) the first time it loads, so "unique visitors" is just
//   the unique-user count on your PostHog dashboard — no extra code needed.
// - Time on page / session duration: PostHog's "Web Analytics" and session
//   recording features compute this automatically from pageview + activity
//   events — again, no extra code needed beyond initializing the SDK.
// - Total sign-ins: NOT automatic — see the explicit `posthog.capture('sign_in', ...)`
//   calls added in src/lib/AuthContext.tsx and the server-side capture in
//   src/app/api/auth/signin/route.ts. Page views alone don't tell you when
//   someone actually authenticated.
//
// capture_pageview is set to false below because Next.js App Router
// navigations don't trigger full page loads — PostHogPageView (below)
// manually fires a pageview on every route change instead, which is the
// documented pattern for App Router.
if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    capture_pageview: false,
    // Session replay is optional — it's what powers PostHog's "how long
    // did they spend, what did they click" recordings, not required for
    // the basic visitor/time-spent numbers, but free to enable at this
    // traffic scale and is often the easiest way to *see* engagement
    // rather than just a number.
    session_recording: { maskAllInputs: true },
  });
}

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const posthogClient = usePostHog();

  useEffect(() => {
    if (!pathname || !posthogClient) return;
    const url = searchParams?.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
    posthogClient.capture('$pageview', { $current_url: window.location.origin + url });
  }, [pathname, searchParams, posthogClient]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    // No key configured (e.g. local dev without env vars set) — render
    // children plain rather than initializing an SDK with nothing to send to.
    return <>{children}</>;
  }
  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </PHProvider>
  );
}
