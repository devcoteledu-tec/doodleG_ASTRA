'use client';

import React, { useEffect, useState } from 'react';
import { ExternalLink, Copy, Check, X } from 'lucide-react';
import { detectInAppBrowser, isAndroid, buildAndroidChromeIntentUrl } from '@/lib/inAppBrowser';

/**
 * Site-wide banner shown when the visitor is inside an in-app browser
 * (Instagram, WhatsApp, Facebook, etc). These embedded browsers frequently
 * block session cookies from persisting — see src/lib/inAppBrowser.ts for
 * why — which silently breaks sign in, Follow, wishlist, and checkout for
 * the visitor with no error message that explains why. This banner is the
 * fix: it tells the visitor *before* they hit that dead end, and gives
 * them a one-tap way out on Android, or clear instructions + a copy-link
 * fallback on iOS where no one-tap escape exists.
 *
 * Detection runs client-side only (after mount) since navigator.userAgent
 * isn't available during SSR — this intentionally avoids a hydration
 * mismatch rather than trying to detect on the server.
 */
export default function InAppBrowserBanner() {
  const [info, setInfo] = useState<{ detected: boolean; app?: string }>({ detected: false });
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [android, setAndroid] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');

  // Mount-only: reads browser APIs unavailable during SSR. Cannot move to
  // useState initializers without a hydration mismatch (server renders
  // {detected:false}, client may get {detected:true}). The setState calls
  // here are batched by React 18+ and cannot cascade — suppressed safely.
  useEffect(() => {
    const ua = navigator.userAgent;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only browser-API read; no cascading risk
    setInfo(detectInAppBrowser(ua));
     
    setAndroid(isAndroid(ua));
     
    setCurrentUrl(window.location.href);
  }, []);

  if (!info.detected || dismissed) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail inside some in-app browsers too — the URL
      // bar is still visible to the user as a manual fallback either way.
    }
  };

  return (
    <div className="sticky top-0 z-[60] bg-gray-900 text-white text-sm">
      <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center gap-3">
        <ExternalLink className="w-4 h-4 shrink-0 text-orange-400" />
        <p className="flex-1 leading-snug">
          You&apos;re viewing this in {info.app ?? 'an app'}&apos;s built-in browser, where sign-in and
          checkout may not work properly.{' '}
          <span className="text-gray-300">Open in your regular browser to continue.</span>
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {android ? (
            <a
              href={buildAndroidChromeIntentUrl(currentUrl)}
              className="inline-flex items-center gap-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-3 py-1.5 rounded-full text-xs transition-colors"
            >
              Open in Chrome
            </a>
          ) : (
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-3 py-1.5 rounded-full text-xs transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="text-gray-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      {!android && (
        <div className="max-w-4xl mx-auto px-4 pb-2.5 -mt-1 text-xs text-gray-400">
          Tap <span className="font-semibold text-gray-200">••• (top right)</span> and choose{' '}
          <span className="font-semibold text-gray-200">&quot;Open in Safari&quot;</span> — or copy the link above.
        </div>
      )}
    </div>
  );
}
