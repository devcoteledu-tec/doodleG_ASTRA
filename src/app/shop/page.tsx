import type { Metadata } from 'next';
import { fetchProductsServer } from '@/lib/fetchProductsServer';
import ShopPageClient from './ShopPageClient';

export const metadata: Metadata = {
  title: 'Shop Gifts for Girlfriend, Boyfriend, Family & Friends — Handmade in India',
  description:
    'Shop personalised, handmade gifts for girlfriend, boyfriend, husband, wife, mom, dad and friends. Birthday, anniversary, Valentine\u2019s and everyday gift boxes, curated by AI and delivered across India.',
  keywords: [
    'gift for girlfriend',
    'gift for boyfriend',
    'gift for wife',
    'gift for husband',
    'birthday gift ideas',
    'anniversary gifts',
    'personalised gifts online',
    'homemade gifts india',
    'handmade gift box',
    'romantic gifts',
    'gift hampers',
    'curated gift boxes',
  ],
  alternates: { canonical: '/shop' },
  openGraph: {
    type: 'website',
    url: '/shop',
    title: 'Shop Gifts for Girlfriend, Boyfriend, Family & Friends | doodle_G',
    description:
      'Personalised, handmade gift boxes for every relationship and occasion — curated by AI, delivered across India.',
    images: ['/og-default.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Shop Gifts for Girlfriend, Boyfriend, Family & Friends | doodle_G',
    description:
      'Personalised, handmade gift boxes for every relationship and occasion — curated by AI.',
    images: ['/og-default.png'],
  },
};

// Revalidate every 60 seconds so new products appear without a redeploy
export const revalidate = 60;

export default async function Page() {
  const products = await fetchProductsServer();
  return <ShopPageClient initialProducts={products} />;
}
