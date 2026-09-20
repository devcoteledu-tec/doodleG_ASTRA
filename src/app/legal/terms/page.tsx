import type { Metadata } from 'next';
import LegalPageClient, { LEGAL_LAST_UPDATED } from '@/components/legal/LegalPageClient';

export const metadata: Metadata = {
  title: 'Terms & Conditions — doodle_G',
  description: 'The terms that govern your use of doodle_G, our AI-curated gifting service, WhatsApp order coordination, and marketplace of third-party artisans and home-makers.',
  alternates: { canonical: '/legal/terms' },
  openGraph: {
    type: 'website',
    url: '/legal/terms',
    title: 'Terms & Conditions | doodle_G',
    description: 'The terms that govern your use of the doodle_G gifting platform.',
  },
};

// NOTE: Standard-form Indian e-commerce Terms & Conditions, tailored to
// doodle_G's model (AI-curated gifting, WhatsApp coordination, third-party
// artisan/home-maker sourcing, COD + prepaid checkout). This is a template
// starting point, not a substitute for review by qualified legal counsel
// before going live with real transactions.
export default function Page() {
  return (
    <LegalPageClient active="terms" title="Terms & Conditions">
      <p>
        These Terms &amp; Conditions (&quot;Terms&quot;) govern your access to and use of the doodle_G
        website, mobile experience, and related services (collectively, the &quot;Platform&quot;),
        operated by <strong>[REGISTERED_ENTITY_NAME]</strong> (&quot;doodle_G&quot;, &quot;we&quot;, &quot;us&quot;, &quot;our&quot;).
        By creating an account, placing an order, or otherwise using the Platform, you agree to
        be bound by these Terms. If you do not agree, please do not use the Platform.
      </p>

      <h2>1. Who we are</h2>
      <p>
        doodle_G is an AI-assisted gift curation service. You tell us about the person you&apos;re
        shopping for, our system analyzes that input to recommend a curated gift package, and we
        coordinate packaging and delivery — including, in some cases, order updates over WhatsApp.
        Some items in a curated package may be sourced from third-party artisans, small businesses,
        or independent home-makers listed on the Platform (&quot;Providers&quot;) rather than from doodle_G
        directly.
      </p>

      <h2>2. Eligibility and accounts</h2>
      <p>
        You must be at least 18 years old, or the age of majority in your jurisdiction, to place an
        order. You are responsible for maintaining the confidentiality of your account credentials
        and for all activity under your account. Please notify us immediately of any unauthorized use.
      </p>

      <h2>3. Orders, pricing, and payment</h2>
      <p>
        All prices displayed on the Platform are in Indian Rupees (INR) and inclusive of applicable
        taxes unless stated otherwise. We accept Cash on Delivery (COD) and prepaid payments through
        our payment gateway partner. An order is confirmed only once payment is authorized (for
        prepaid orders) or the order is accepted (for COD orders). We reserve the right to refuse or
        cancel any order, including in cases of suspected fraud, pricing errors, or non-serviceable
        delivery locations.
      </p>

      <h2>4. WhatsApp-based order coordination</h2>
      <p>
        By providing your phone number at checkout, you consent to receive order confirmations,
        curation updates, delivery coordination, and related transactional messages from doodle_G
        over WhatsApp. These messages are operational in nature and not third-party marketing. You
        may opt out of non-essential updates at any time by contacting support.
      </p>

      <h2>5. Third-party artisans and Providers</h2>
      <p>
        Where a curated package includes items sourced from an independent Provider, that Provider
        is responsible for the quality, description accuracy, and legal compliance of their own
        item, subject to the quality checks doodle_G applies before dispatch. doodle_G facilitates
        the transaction and remains your point of contact for support, refunds, and grievances
        regardless of which Provider fulfilled a given item.
      </p>

      <h2>6. Delivery</h2>
      <p>
        Estimated delivery timelines are shown at checkout and on our{' '}
        <a href="/support?tab=shipping">Shipping Policy</a> page. Timelines are estimates, not
        guarantees, and may be affected by courier delays, remote locations, or circumstances
        outside our control.
      </p>

      <h2>7. Cancellations, returns, and refunds</h2>
      <p>
        Cancellation windows, return eligibility, and refund timelines are set out in our{' '}
        <a href="/legal/refund">Refund &amp; Cancellation Policy</a>, which forms part of these Terms.
      </p>

      <h2>8. Intellectual property</h2>
      <p>
        All content on the Platform — including text, graphics, logos, and the AI curation
        methodology — is owned by or licensed to doodle_G and may not be copied, reproduced, or
        redistributed without our prior written consent.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, doodle_G&apos;s aggregate liability for any claim
        arising from your use of the Platform is limited to the amount you paid for the order giving
        rise to the claim. We are not liable for indirect, incidental, or consequential damages.
      </p>

      <h2>10. Grievance redressal</h2>
      <p>
        In accordance with the Consumer Protection (E-Commerce) Rules, 2020 and the Information
        Technology Act, 2000, grievances may be addressed to our Grievance Officer, whose details
        are published in the site footer and below.
      </p>
      <p>
        Grievance Officer: <strong>[GRIEVANCE_OFFICER_NAME]</strong>
        <br />
        Email: <strong>[GRIEVANCE_OFFICER_EMAIL]</strong>
        <br />
        Response SLA: <strong>[GRIEVANCE_RESPONSE_SLA]</strong>
      </p>

      <h2>11. Governing law</h2>
      <p>
        These Terms are governed by the laws of India, and courts at <strong>[JURISDICTION_CITY]</strong>{' '}
        shall have exclusive jurisdiction over any disputes.
      </p>

      <h2>12. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. Material changes will be reflected by an
        updated &quot;Last updated&quot; date above. Continued use of the Platform after changes take
        effect constitutes acceptance of the revised Terms.
      </p>

      <p className="text-xs text-gray-400 mt-8">
        Placeholders in brackets (e.g. [REGISTERED_ENTITY_NAME]) must be filled in with real business
        details before this page is treated as legally binding. See the business disclosure block in
        the site footer for the same set of fields. Last updated: {LEGAL_LAST_UPDATED}.
      </p>
    </LegalPageClient>
  );
}
