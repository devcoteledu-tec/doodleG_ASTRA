import type { Metadata } from 'next';
import AuthPageClient from './AuthPageClient';

// Sign-in/sign-up form — see cart/page.tsx for why this is noindex (a
// login page ranking for the brand name would just steal clicks that
// should land on the homepage).
export const metadata: Metadata = {
  title: 'Sign In',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <AuthPageClient />;
}
