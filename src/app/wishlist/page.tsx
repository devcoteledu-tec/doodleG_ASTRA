import type { Metadata } from 'next';
import WishlistPageClient from './WishlistPageClient';

// Per-visitor account content — see cart/page.tsx for why this is noindex.
export const metadata: Metadata = {
  title: 'Your Wishlist',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <WishlistPageClient />;
}
