import type { Metadata } from 'next';
import { fetchProvidersServer } from '@/lib/fetchProvidersServer';
import ProvidersPageClient from './ProvidersPageClient';

export const metadata: Metadata = {
  title: 'Meet Our Home Makers & Artisan Gift Providers',
  description:
    'Discover the independent home makers, artisans, and small studios behind every doodle_G gift \u2014 florists, bakers, woodworkers, candle-makers and more \u2014 and shop directly from the people who make what you buy.',
  alternates: { canonical: '/profiles' },
  openGraph: {
    type: 'website',
    url: '/profiles',
    title: 'Meet Our Home Makers & Artisan Gift Providers | doodle_G',
    description:
      'Discover the independent home makers and small studios behind every doodle_G gift.',
    images: ['/og-default.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Meet Our Home Makers & Artisan Gift Providers | doodle_G',
    description:
      'Discover the independent home makers and small studios behind every doodle_G gift.',
    images: ['/og-default.png'],
  },
};

export const revalidate = 60;

export default async function Page() {
  const providers = await fetchProvidersServer();
  return <ProvidersPageClient initialProviders={providers} />;
}
