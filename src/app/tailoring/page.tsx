import type { Metadata } from 'next';
import TailoringPageClient from './TailoringPageClient';

export const metadata: Metadata = {
  title: 'Tailor Your Hamper — Build a Custom Gift Box',
  description:
    'Design your own gift hamper. Drag and drop sweets, drinks, self-care items and more into a custom box, watch the slots fill up in real time, and check out a hamper made exactly your way.',
  keywords: [
    'custom gift hamper',
    'build your own gift box',
    'tailor your hamper',
    'personalised gift hamper india',
    'diy gift box',
    'custom gift basket',
  ],
  alternates: { canonical: '/tailoring' },
  openGraph: {
    type: 'website',
    url: '/tailoring',
    title: 'Tailor Your Hamper — Build a Custom Gift Box | doodle_G',
    description:
      'Drag and drop sweets, drinks, self-care items and more into a custom hamper — build a gift made exactly your way.',
    images: ['/og-default.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tailor Your Hamper — Build a Custom Gift Box | doodle_G',
    description: 'Drag and drop your way to a one-of-a-kind gift hamper.',
    images: ['/og-default.png'],
  },
};

export default function Page() {
  return <TailoringPageClient />;
}
