import type { Metadata } from 'next';
import CollectionPageClient from './CollectionPageClient';

export const metadata: Metadata = {
  title: 'Shop by Collection & Category',
  description:
    'Explore doodle_G gift collections by category \u2014 filter curated, artisan-made gifts from independent home makers to find the perfect match for any recipient or occasion.',
  alternates: { canonical: '/shop/collection' },
  openGraph: {
    type: 'website',
    url: '/shop/collection',
    title: 'Shop by Collection & Category | doodle_G',
    description: 'Filter curated, artisan-made gifts by category to find the perfect match.',
  },
};

export default function Page() {
  return <CollectionPageClient />;
}
