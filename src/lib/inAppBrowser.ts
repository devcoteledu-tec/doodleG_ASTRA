// ── In-app browser detection ──
// Instagram, Facebook, WhatsApp, and similar apps open links inside their
// own embedded WebView instead of the phone's real browser (Safari/Chrome).
// On iOS in particular, these embedded WebViews frequently run in an
// ephemeral/isolated storage mode that silently drops or refuses to
// persist cookies — including our httpOnly session cookie — even though
// the request looks completely normal from the server's side. There is no
// reliable server-only or client-JS-only fix for this; it's a restriction
// imposed by the host app, not a bug in this codebase. The standard,
// widely-used mitigation is detecting the in-app browser and prompting the
// visitor to continue in their real browser, where cookies work normally.
//
// This matters a lot for doodle_G specifically: the entire growth loop is
// providers sharing their doodleg.in/profiles/<slug> link on Instagram, so
// a large share of real traffic arrives exactly through the browser class
// that breaks session persistence. Any action that requires a signed-in
// session — sign in, sign up, follow, wishlist, checkout — is affected,
// not just "Follow".

export interface InAppBrowserInfo {
  detected: boolean;
  /** Human-readable app name, for the banner copy. */
  app?: string;
}

const PATTERNS: Array<{ re: RegExp; app: string }> = [
  { re: /Instagram/i, app: 'Instagram' },
  { re: /FBAN|FBAV|FB_IAB/i, app: 'Facebook' },
  { re: /WhatsApp/i, app: 'WhatsApp' },
  { re: /Line\//i, app: 'Line' },
  { re: /Snapchat/i, app: 'Snapchat' },
  { re: /MicroMessenger/i, app: 'WeChat' },
  { re: /(musical_ly|TikTok|BytedanceWebview)/i, app: 'TikTok' },
  { re: /LinkedInApp/i, app: 'LinkedIn' },
  { re: /Twitter/i, app: 'Twitter/X' },
];

export function detectInAppBrowser(userAgent: string): InAppBrowserInfo {
  for (const { re, app } of PATTERNS) {
    if (re.test(userAgent)) return { detected: true, app };
  }
  return { detected: false };
}

/** True on Android — used to decide whether we can offer a one-tap "open
 * in Chrome" intent link, versus iOS where no such universal escape exists
 * and we fall back to written instructions + a copy-link button. */
export function isAndroid(userAgent: string): boolean {
  return /Android/i.test(userAgent);
}

/** Builds an Android intent:// URL that forces the current page to reopen
 * in Chrome specifically, bypassing the host app's embedded WebView. */
export function buildAndroidChromeIntentUrl(currentUrl: string): string {
  const url = new URL(currentUrl);
  const withoutScheme = `${url.host}${url.pathname}${url.search}`;
  return `intent://${withoutScheme}#Intent;scheme=https;package=com.android.chrome;end`;
}
