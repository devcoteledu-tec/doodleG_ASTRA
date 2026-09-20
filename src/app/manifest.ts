import type { MetadataRoute } from 'next';
import { SITE_NAME, SITE_TAGLINE } from '@/lib/seo';

// Generates /manifest.webmanifest.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} – ${SITE_TAGLINE}`,
    short_name: SITE_NAME,
    description: 'AI-curated surprise gifts, sourced from independent home makers and artisans, delivered end-to-end over WhatsApp.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#000000',
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
