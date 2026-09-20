import type { Metadata } from 'next';
import SocialRedirectPageClient from './SocialRedirectPageClient';

// Outbound redirect/interstitial to a provider's external social profile —
// no unique content of its own, so noindex avoids duplicate/thin-content
// pages piling up in search results (one per provider x platform).
export const metadata: Metadata = {
  title: 'Redirecting…',
  robots: { index: false, follow: false },
};

export default function Page({ params }: { params: Promise<{ platform: string }> }) {
  return <SocialRedirectPageClient params={params} />;
}
