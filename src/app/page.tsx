import type { Metadata } from 'next';
import { SITE_DESCRIPTION } from '@/lib/seo';
import { fetchProductsServer } from '@/lib/fetchProductsServer';
import HomePageClient from './HomePageClient';

export const metadata: Metadata = {
  title: 'doodle_G — Handmade Gifts for Every Occasion | AI Gift Concierge India',
  description: SITE_DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    title: 'doodle_G — Handmade Gifts for Every Occasion | AI Gift Concierge India',
    description: SITE_DESCRIPTION,
  },
};

// Revalidate every 60 seconds so new products appear within a minute
// without a full redeploy, while still serving cached HTML to crawlers.
export const revalidate = 60;

export default async function Page() {
  const products = await fetchProductsServer();
  return <HomePageClient initialProducts={products} />;
}
