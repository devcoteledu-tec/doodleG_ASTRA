import type { Metadata } from 'next';
import MyProfilePageClient from './MyProfilePageClient';

// Signed-in user's own account page — see cart/page.tsx for why this is
// noindex (not to be confused with the public provider profile pages at
// /profiles/[id], which ARE indexed and get full metadata).
export const metadata: Metadata = {
  title: 'My Account',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <MyProfilePageClient />;
}
