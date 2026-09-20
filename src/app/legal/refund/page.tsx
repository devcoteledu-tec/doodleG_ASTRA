import type { Metadata } from 'next';
import LegalPageClient, { LEGAL_LAST_UPDATED } from '@/components/legal/LegalPageClient';

export const metadata: Metadata = {
  title: 'Refund & Cancellation Policy — doodle_G',
  description: 'Order cancellation windows, return eligibility, and refund timelines for doodle_G — including COD and prepaid orders, and AI-curated custom items.',
  alternates: { canonical: '/legal/refund' },
  openGraph: {
    type: 'website',
    url: '/legal/refund',
    title: 'Refund & Cancellation Policy | doodle_G',
    description: 'Cancellation windows, return eligibility, and refund timelines for doodle_G orders.',
  },
};

// NOTE: Mirrors the existing "30-Day Returns" copy already live at
// /support?tab=returns so the two pages don't contradict each other — this
// page adds the formal cancellation-window and COD/prepaid refund-mechanics
// detail that a payment gateway (Razorpay/Cashfree) reviewer will look for.
export default function Page() {
  return (
    <LegalPageClient active="refund" title="Refund & Cancellation Policy">
      <h2>1. Order cancellation</h2>
      <p>
        You may cancel an order free of charge any time before it has been dispatched for AI
        curation and packaging. Once a curator has begun assembling your package, the order can no
        longer be cancelled, since components may already be sourced from a third-party artisan or
        home-maker Provider on your behalf. The exact cutoff is shown on your order confirmation
        and order-status page.
      </p>

      <h2>2. 30-day returns</h2>
      <p>
        We offer a hassle-free 30-day return or exchange window on all non-personalized components
        of your package, starting from the delivery date.
      </p>
      <div className="not-prose bg-emerald-50/50 border border-emerald-100 rounded-2xl p-5 space-y-2 my-4">
        <p className="font-bold text-emerald-900 text-sm">How to initiate a return:</p>
        <ol className="list-decimal list-inside text-emerald-800 text-xs space-y-1">
          <li>Log in to your doodle_G account and locate the order in your dashboard.</li>
          <li>Click &quot;Request Return&quot; and select the items you wish to send back.</li>
          <li>Print the prepaid shipping label and drop the parcel at your nearest DTDC / FedEx drop point.</li>
        </ol>
      </div>

      <h2>3. What can&apos;t be returned</h2>
      <p>
        Custom-written cards, opened food products, and highly custom AI-printed items cannot be
        returned, since these are personalized specifically for your recipient and can&apos;t be
        resold.
      </p>

      <h2>4. Refunds — prepaid orders</h2>
      <p>
        Once a returned item passes warehouse check-in, the refund is credited back to your
        original payment method within 5–7 business days.
      </p>

      <h2>5. Refunds — Cash on Delivery (COD) orders</h2>
      <p>
        Since no payment method is on file for COD orders, approved refunds are issued via bank
        transfer or UPI to an account you provide, within 5–7 business days of warehouse check-in.
      </p>

      <h2>6. Damaged or incorrect items</h2>
      <p>
        If your package arrives damaged or doesn&apos;t match your order, contact{' '}
        <a href="/support?tab=contact">Support</a> within 48 hours of delivery with photos of the
        item and packaging, and we&apos;ll arrange a replacement or refund at no extra cost to you.
      </p>

      <h2>7. Questions</h2>
      <p>
        For anything not covered here, reach our support team via the{' '}
        <a href="/support?tab=contact">Contact Us</a> form, or our Grievance Officer at{' '}
        <strong>[GRIEVANCE_OFFICER_EMAIL]</strong>.
      </p>

      <p className="text-xs text-gray-400 mt-8">
        Placeholders in brackets must be filled in with real business details before this page is
        treated as legally binding. Last updated: {LEGAL_LAST_UPDATED}.
      </p>
    </LegalPageClient>
  );
}
