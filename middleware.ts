import { NextRequest, NextResponse } from 'next/server';
import { verifySessionJwt } from './src/lib/sessionToken';

const SESSION_COOKIE_NAME = 'doodleg_session';

// Pages that require a signed-in user.
//
// SEO NOTE: '/shop', '/shop/[id]', '/shop/collection', and '/profiles' + '/profiles/[id]'
// are intentionally PUBLIC. Gating them behind auth was making the entire
// product catalog and provider directory invisible to Googlebot (which never
// has a session cookie) — every crawl was being redirected to /auth (noindex)
// so nothing indexed but the homepage, despite the sitemap/robots/metadata
// being fully wired up for those pages. Browsing is public; only *transacting*
// or seeing *personal* data requires a session:
//  - '/cart'                     — reviewing the cart before checkout
//  - '/wishlist', '/my-profile'  — personal, per-account data
//  - '/onboarding'               — creates recipients/occasions against the
//                                   signed-in user's profile
// Every state-changing / personal API stays protected below (see
// PROTECTED_API_PREFIXES), so opening browse pages does not weaken the
// checkout gate: guests can look, but they cannot order, follow, or write
// anything without a session — that is still enforced at the API layer as
// defense in depth.
const PROTECTED_PAGES = [
  '/orders', '/gifts', '/checkout/recover',
  '/cart',
  '/wishlist',
  '/my-profile',
  '/onboarding',
];

// API prefixes that must always resolve the acting user from the session.
// '/api/orders' is included so placing an order (buying) always requires a
// session — guest checkout is no longer supported now that '/cart' itself
// is gated, so nobody reaches checkout without being signed in; this is
// enforced again here (not just in the route handler) as defense in depth.
//
// Every entry below is also enforced in the route handler itself via
// getSessionFromRequest — the middleware is a second, independent gate.
// If a per-route check is ever accidentally removed, the middleware still
// blocks the request from reaching the handler at all.
const PROTECTED_API_PREFIXES = [
  '/api/dashboard',
  '/api/db-onboard',
  '/api/my-profile',        // covers /api/my-profile AND /api/my-profile/like
  '/api/update-order-tier',
  '/api/update-card',
  '/api/orders',
  '/api/customization-orders', // placing/viewing tailored-hamper orders — same rule as /api/orders
  '/api/plan-for-later',    // added: writes love_data for the signed-in user
  '/api/providers/follow',  // added: mutates follows / topic_interested
];

async function hasValidSession(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return false;

  return Boolean(await verifySessionJwt(token));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const signedWebhook = pathname === '/api/whatsapp/webhook' || pathname === '/api/razorpay/webhook';
  if (pathname.startsWith('/api/') && !signedWebhook && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.headers.get('origin');
    if (req.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== req.nextUrl.origin)) {
      return NextResponse.json({ error: 'Cross-site request rejected.' }, { status: 403 });
    }
  }


  const isProtectedPage = PROTECTED_PAGES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  const isProtectedApi = PROTECTED_API_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  if (!isProtectedPage && !isProtectedApi) {
    return NextResponse.next();
  }

  if (await hasValidSession(req)) {
    return NextResponse.next();
  }

  // API and page callers need different failure shapes. A page navigation
  // (browser address bar / <Link>) expects an HTML response and a redirect
  // is the right UX. An API caller is almost always a fetch() from client
  // code that does `await res.json()` on the response — and fetch()
  // auto-follows redirects, so a redirect-to-/auth here would silently
  // hand that fetch() an HTML page instead of JSON, throw a parse error,
  // and get swallowed by the caller's catch block with no real error
  // surfaced to the user. (This exact bug previously broke Follow/Unfollow
  // for any caller whose session cookie was invalid or missing at click
  // time — most often on mobile, where sessions are more likely to be
  // interrupted mid-browse than on desktop.) API prefixes must always get
  // a clean JSON 401 instead, never a redirect.
  if (isProtectedApi) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const loginUrl = new URL('/auth', req.url);
  loginUrl.searchParams.set('redirect', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/api/:path*',
    '/orders/:path*', '/gifts/:path*', '/checkout/recover/:path*',
    // NOTE: '/shop/:path*' and '/profiles/:path*' are intentionally NOT
    // matched — they're public for SEO (see PROTECTED_PAGES comment above).
    // Keeping them out of the matcher means the middleware doesn't even run
    // on those hot browse routes, saving a JWT verify + Supabase-free
    // roundtrip per crawl/visit.
    '/cart/:path*',
    '/onboarding/:path*',
    '/my-profile/:path*',
    '/wishlist/:path*',
    '/api/dashboard/:path*',
    '/api/db-onboard/:path*',
    '/api/my-profile/:path*',
    '/api/update-order-tier/:path*',
    '/api/update-card/:path*',
    '/api/orders/:path*',
    '/api/customization-orders/:path*',
    '/api/plan-for-later/:path*',
    '/api/providers/follow/:path*',
  ],
};
