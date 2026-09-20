import type { Metadata } from 'next';
import JsonLd from '@/components/JsonLd';
import SupportPageClient from './SupportPageClient';

export const metadata: Metadata = {
  title: 'Support & FAQ — Shipping, Returns, and How AI Curation Works',
  description:
    'Answers to common doodle_G questions: how the AI curated surprise gift works, delivery times, returns, and how to write your own greeting card or use the AI Card Writer.',
  alternates: { canonical: '/support' },
  openGraph: {
    type: 'website',
    url: '/support',
    title: 'Support & FAQ | doodle_G',
    description: 'Answers to common questions about ordering, shipping, returns, and AI gift curation.',
  },
};

// Kept in sync by hand with the FAQ tab's question/answer pairs in
// SupportPageClient.tsx — if you edit the questions there, mirror the
// change here too. FAQPage structured data is what earns the expandable
// FAQ rich result directly in Google search, and it's the same
// question/answer shape an AI assistant fielding "how does doodle_G work"
// can quote verbatim instead of paraphrasing from page prose.
const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How does the AI curated surprise package work?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Tell us about the recipient and occasion to get suggestions from available catalog products. Approving a gift saves your preference; it does not charge you, reserve stock or book delivery. Purchase separately through checkout.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I view the products before they are shipped?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. You can review gift suggestions and product details before purchasing. Confirmed purchases appear on your Orders page.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is the delivery time?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Delivery timing depends on the provider and destination. Contact support before ordering for a fixed occasion date; a saved gift plan does not guarantee delivery.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I write my own greeting card?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Absolutely! You can write it yourself during checkout, or use our built-in AI Card Writer in the Hub to draft a beautiful, personalized message.',
      },
    },
  ],
};

export default function Page() {
  return (
    <>
      <JsonLd data={faqJsonLd} />
      <SupportPageClient />
    </>
  );
}
