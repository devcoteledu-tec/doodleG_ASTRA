import type { NextConfig } from "next";

// Baseline Content-Security-Policy for this app.
//
// - connect-src is 'self' only: every Supabase, Gemini, and Twilio call this
//   app makes goes through its own /api/* route handlers (see
//   src/lib/supabaseAdmin.ts, src/services/ai.ts, src/services/whatsapp.ts) —
//   none of those SDKs are ever loaded or called directly from the browser,
//   so the browser itself never needs to reach supabase.co,
//   generativelanguage.googleapis.com, or api.twilio.com.
// - img-src allows any https origin (plus data: URIs) because product
//   images and user-supplied avatar URLs come from arbitrary external
//   hosts chosen by whoever populated the `products_box` table / entered
//   their avatar URL, not a fixed, known set of domains.
// - script-src/style-src include 'unsafe-inline' because Next.js's
//   hydration bootstrap and Tailwind's runtime style injection both rely on
//   inline scripts/styles. A nonce-based version of this policy was tried
//   and reverted: it broke client-side hydration in production in a way
//   that wasn't reproducible locally, which is worse than the slightly
//   weaker (but working) policy below. Revisit with a canary deploy before
//   trying again.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // https://accounts.google.com/gsi/client is Google Identity Services, used
  // to render the "Continue with Google" button on /auth (see
  // src/app/auth/page.tsx). It needs script-src (to load the library),
  // connect-src (it XHRs Google directly), and frame-src (Google renders the
  // button/prompt inside its own iframe).
  //
  // https://us-assets.i.posthog.com is PostHog's asset host: despite the
  // SDK itself being bundled into our own JS (no <script> tag for the core
  // library), it dynamically injects *its own* <script> tags at runtime for
  // optional feature bundles (web-vitals, session-recording, dead-clicks
  // autocapture, surveys) fetched from this host. Without it here, those
  // script loads are silently blocked by the browser (visible as CSP
  // violation errors in the console) and those features never activate,
  // even though connect-src alone was previously assumed to be enough.
  //
  // https://checkout.razorpay.com is Razorpay Checkout.js, loaded
  // dynamically by src/app/cart/CartPageClient.tsx's "Pay Online" button
  // (see loadRazorpayScript). Without this here, the browser silently
  // blocks the <script> load — no console-visible error reaches the app's
  // own error handling, it just surfaces as the generic "Network error
  // while starting payment" message, which is exactly what happened during
  // testing before this was added.
  "script-src 'self' 'unsafe-inline' https://accounts.google.com https://us-assets.i.posthog.com https://checkout.razorpay.com",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com https://checkout.razorpay.com",
  "img-src 'self' https: data:",
  "font-src 'self' data:",
  // PostHog (src/components/PostHogProvider.tsx, src/lib/posthogServer.ts):
  // the core SDK is bundled into our own JS (npm package, not an external
  // <script> tag), but it dynamically loads extra feature-bundle scripts
  // from us-assets.i.posthog.com at runtime — see the script-src comment
  // above. connect-src below is for actually sending events/session-
  // recording data to PostHog's ingestion and asset hosts. Update both if
  // the PostHog Cloud region changes (see NEXT_PUBLIC_POSTHOG_HOST in
  // .env.example — 'us' region shown here).
  //
  // Razorpay: api.razorpay.com is what Checkout.js itself calls once
  // loaded (to create the payment, poll status, etc.) — lumberjack.razorpay.com
  // is its client-side logging/analytics endpoint, which Checkout.js also
  // calls directly; without it present here the checkout still generally
  // works but throws a wall of CSP console errors.
  "connect-src 'self' https://accounts.google.com https://us.i.posthog.com https://us-assets.i.posthog.com https://api.razorpay.com https://lumberjack.razorpay.com",
  // Razorpay's payment modal itself renders inside an iframe served from
  // api.razorpay.com (card/netbanking forms, OTP entry, etc.) — this is
  // separate from script-src above, which only covers loading checkout.js.
  // www.instagram.com: provider reel embeds (src/components/ReelsShowcase.tsx).
  "frame-src https://accounts.google.com https://api.razorpay.com https://checkout.razorpay.com https://www.instagram.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Blocks legacy plugin content (<object>, <embed>, Flash). No page uses
  // these; explicitly denying them prevents an XSS injection from smuggling
  // in a plugin payload that would otherwise fall through to default-src.
  "object-src 'none'",
  // Manifest is served from the same origin as /manifest.webmanifest.
  "manifest-src 'self'",
  // Media (video/audio) is served from the same origin for now; open this
  // up when/if the site hosts external CDN media.
  "media-src 'self' https:",
  // Belt-and-braces for any subresource that slips in as http:// during
  // dev-to-prod drift — the browser upgrades it to https:// before fetch.
  "upgrade-insecure-requests",
].join('; ');

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
          // Force HTTPS for 2 years, include subdomains, and allow the
          // domain to be baked into the browser's HSTS preload list. This
          // eliminates the tiny window where a first-visit http:// redirect
          // could be MITM'd on hostile Wi-Fi.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          // Deny access to every powerful browser feature the app does not
          // actively use. If a page ever legitimately needs one of these
          // (e.g. geolocation for a delivery-address picker), open just
          // that one — never remove this header wholesale.
          {
            key: 'Permissions-Policy',
            value: [
              'accelerometer=()',
              'ambient-light-sensor=()',
              // Reels: direct videos autoplay muted (self) and Instagram's embed (delegated via <iframe allow>).
              'autoplay=(self "https://www.instagram.com")',
              'battery=()',
              'camera=()',
              'display-capture=()',
              'document-domain=()',
              'encrypted-media=(self "https://www.instagram.com")',
              'fullscreen=(self "https://www.instagram.com")',
              'gamepad=()',
              'geolocation=()',
              'gyroscope=()',
              'magnetometer=()',
              'microphone=()',
              'midi=()',
              // 'self' alone would block Razorpay Checkout's iframe (served
              // cross-origin from api.razorpay.com) from using the Payment
              // Request API inside it — explicitly allow that origin too.
              'payment=(self "https://api.razorpay.com")',
              'picture-in-picture=(self "https://www.instagram.com")',
              'publickey-credentials-get=()',
              'screen-wake-lock=()',
              'sync-xhr=()',
              'usb=()',
              'web-share=(self)',
              'xr-spatial-tracking=()',
              'interest-cohort=()',
            ].join(', '),
          },
          // Isolates this document's browsing context group from any
          // window it opens or is opened by. Combined with the CSP
          // frame-ancestors 'none' above, this blocks Spectre-style
          // cross-origin data leaks and tab-nabbing.
          //
          // 'same-origin-allow-popups' (not the stricter 'same-origin'):
          // the "Continue with Google" button on /auth opens a popup to
          // accounts.google.com and relies on that popup being able to
          // postMessage the credential back to this window. Strict
          // 'same-origin' silently blocks that channel — Google's SDK
          // then falls back to POSTing the credential to this page as a
          // full-page form submission, which is what caused the "Confirm
          // Form Resubmission" prompt on refresh/back after Google
          // sign-in. 'same-origin-allow-popups' keeps the isolation from
          // windows we did NOT open while permitting the ones we did.
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          // Only same-origin documents can load this document as a
          // subresource. Prevents other sites from embedding responses.
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          // Legacy header — modern browsers use CSP instead, but this
          // is still respected by older browsers and by some corporate
          // proxies that scan responses.
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          { key: 'X-XSS-Protection', value: '0' },
        ],
      },
    ];
  },
};

export default nextConfig;
