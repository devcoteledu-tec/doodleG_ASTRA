import type { Metadata } from 'next';
import OnboardingPageClient from './OnboardingPageClient';

// Multi-step account setup flow — see cart/page.tsx for why this is noindex.
export const metadata: Metadata = {
  title: 'Get Started',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <OnboardingPageClient />;
}
