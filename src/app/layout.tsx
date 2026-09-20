import type { Metadata } from 'next';
import './globals.css';
import { CartProvider } from '@/lib/CartContext';
import { AuthProvider } from '@/lib/AuthContext';
import { PostHogProvider } from '@/components/PostHogProvider';
import JsonLd from '@/components/JsonLd';
import InAppBrowserBanner from '@/components/InAppBrowserBanner';
import { SITE_NAME, SITE_URL, SITE_TAGLINE, SITE_DESCRIPTION, SITE_KEYWORDS } from '@/lib/seo';

// `metadataBase` makes every relative URL used in per-page `openGraph.images`,
// `alternates.canonical`, etc. resolve to an absolute one automatically —
// without it, Next.js falls back to localhost in local builds and social
// crawlers (which require absolute URLs) silently get broken previews.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} – ${SITE_TAGLINE}`,
    // Every page below sets its own <title>, which Next.js slots into %s.
    // Keeping the site name on every tab/SERP result reinforces brand
    // recall for repeat and branded searches ("doodle_G reviews", etc).
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  applicationName: SITE_NAME,
  generator: 'Next.js',
  referrer: 'strict-origin-when-cross-origin',
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  formatDetection: { email: false, address: false, telephone: false },
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-icon.png',
  },
  manifest: '/manifest.webmanifest',
  openGraph: {
    type: 'website',
    url: '/',
    siteName: SITE_NAME,
    title: `${SITE_NAME} – ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    locale: 'en_US',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: `${SITE_NAME} – ${SITE_TAGLINE}` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} – ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: ['/og-default.png'],
  },
  // Fill these in with real verification tokens once the property is
  // registered in Google Search Console / Bing Webmaster Tools — until
  // then they're a no-op (Next.js omits the meta tag when the value is
  // undefined), left here so hardening SEO later is a one-line edit
  // instead of rediscovering where this goes.
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
    other: process.env.BING_SITE_VERIFICATION
      ? { 'msvalidate.01': process.env.BING_SITE_VERIFICATION }
      : undefined,
  },
};

// Organization + WebSite JSON-LD, present on every page via the root
// layout. This is what tells Google (and answer-engine/LLM crawlers) what
// the business *is* independent of whichever page a visitor lands on:
// name, canonical URL, logo, and a plain-language description that
// explicitly names the "independent home makers / artisans" fulfillment
// model — the same phrase a person would type into a search box or ask a
// chatbot. The WebSite entry's `potentialAction` is the schema Google uses
// to power a sitelinks search box directly in search results.
const organizationJsonLd = {
  '@context': 'https://schema.org',
  // OnlineStore is a subtype of Organization specifically for e-commerce
  // sites — Google treats it as a stronger signal for product-grid /
  // shopping rich results than plain Organization, and answer engines
  // pick it up as "this is a place you can actually buy things from"
  // rather than "this is a company that exists".
  '@type': 'OnlineStore',
  '@id': `${SITE_URL}/#organization`,
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/favicon.ico`,
  image: `${SITE_URL}/favicon.ico`,
  description: SITE_DESCRIPTION,
  slogan: SITE_TAGLINE,
  // Publishing the site-wide keyword bag as structured data lets answer
  // engines and product-grid crawlers see the full search-space this
  // store covers (girlfriend/boyfriend/anniversary/homemade/etc.) without
  // having to infer it from body copy on the homepage alone.
  keywords: SITE_KEYWORDS.join(', '),
  areaServed: { '@type': 'Country', name: 'India' },
  currenciesAccepted: 'INR',
  paymentAccepted: 'UPI, Credit Card, Debit Card, Razorpay',
};

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE_URL}/#website`,
  url: SITE_URL,
  name: SITE_NAME,
  description: SITE_DESCRIPTION,
  publisher: { '@id': `${SITE_URL}/#organization` },
  potentialAction: {
    '@type': 'SearchAction',
    target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/shop?q={search_term_string}` },
    'query-input': 'required name=search_term_string',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <JsonLd data={[organizationJsonLd, websiteJsonLd]} />
        <InAppBrowserBanner />
        <PostHogProvider>
          <AuthProvider>
            <CartProvider>
              {children}
            </CartProvider>
          </AuthProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
