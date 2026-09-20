import type { Metadata } from 'next';
import CartPageClient from './CartPageClient';

// Cart contents are per-visitor and transactional, not discoverable
// content — noindex keeps it (and its checkout state) out of search
// results while still letting it render normally for real visitors.
export const metadata: Metadata = {
  title: 'Your Cart',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <CartPageClient />;
}
