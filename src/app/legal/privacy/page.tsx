import type { Metadata } from 'next';
import LegalPageClient, { LEGAL_LAST_UPDATED } from '@/components/legal/LegalPageClient';

export const metadata: Metadata = {
  title: 'Privacy Policy — doodle_G',
  description: 'How doodle_G collects, uses, and protects your personal data, including information shared for AI gift curation and WhatsApp order coordination.',
  alternates: { canonical: '/legal/privacy' },
  openGraph: {
    type: 'website',
    url: '/legal/privacy',
    title: 'Privacy Policy | doodle_G',
    description: 'How doodle_G collects, uses, and protects your personal data.',
  },
};

// NOTE: Standard-form Indian e-commerce Privacy Policy (aligned with the IT
// Act, 2000 / SPDI Rules, 2011, with an eye toward the DPDP Act, 2023),
// tailored to doodle_G's AI curation and WhatsApp coordination flows. This
// is a template starting point — have it reviewed by counsel before launch,
// and confirm it matches your actual data practices, retention periods, and
// any sub-processors (payment gateway, WhatsApp Business API provider,
// logistics partners) once those are finalized.
export default function Page() {
  return (
    <LegalPageClient active="privacy" title="Privacy Policy">
      <p>
        This Privacy Policy explains how <strong>[REGISTERED_ENTITY_NAME]</strong>
        (&quot;doodle_G&quot;, &quot;we&quot;, &quot;us&quot;) collects, uses, discloses, and protects your
        personal information when you use our website, app, and related services.
      </p>

      <h2>1. Information we collect</h2>
      <ul>
        <li>Account details: name, email address, phone number, delivery address.</li>
        <li>
          Curation inputs: details you provide about the gift recipient (relationship, occasion,
          interests, quirks) so our AI can generate a personalized recommendation.
        </li>
        <li>Order and payment information, processed via our payment gateway partner.</li>
        <li>Communications sent to support, including messages exchanged over WhatsApp.</li>
        <li>Usage data such as pages viewed, device/browser type, and approximate location.</li>
      </ul>

      <h2>2. How we use your information</h2>
      <ul>
        <li>To generate AI-curated gift recommendations and process your orders.</li>
        <li>To coordinate delivery, including sending updates over WhatsApp where you&apos;ve provided a phone number.</li>
        <li>To provide customer support and respond to grievances.</li>
        <li>To improve the Platform and personalize future recommendations.</li>
        <li>To comply with legal obligations, including tax and consumer protection requirements.</li>
      </ul>

      <h2>3. How your information is shared</h2>
      <p>
        We share the minimum information necessary with: (a) third-party artisan/home-maker
        Providers, so they can prepare the specific item in your order; (b) logistics and courier
        partners, to deliver your order; (c) our payment gateway provider, to process payment; and
        (d) our WhatsApp Business API provider, to send order coordination messages. We do not sell
        your personal information to advertisers.
      </p>

      <h2>4. Data security</h2>
      <p>
        We use reasonable technical and organizational safeguards to protect your information.
        No method of transmission or storage is completely secure, and we cannot guarantee
        absolute security.
      </p>

      <h2>5. Data retention</h2>
      <p>
        We retain your information for as long as needed to fulfill the purposes described above,
        or as required by applicable law, after which it is deleted or anonymized.
      </p>

      <h2>6. Your rights</h2>
      <p>
        You may request access to, correction of, or deletion of your personal information by
        contacting us using the details below, subject to any legal or contractual retention
        requirements.
      </p>

      <h2>7. Cookies</h2>
      <p>
        We use cookies and similar technologies to keep you signed in, remember your cart, and
        understand how the Platform is used. You can control cookies through your browser settings.
      </p>

      <h2>8. Grievance Officer</h2>
      <p>
        Grievance Officer: <strong>[GRIEVANCE_OFFICER_NAME]</strong>
        <br />
        Email: <strong>[GRIEVANCE_OFFICER_EMAIL]</strong>
        <br />
        Response SLA: <strong>[GRIEVANCE_RESPONSE_SLA]</strong>
      </p>

      <h2>9. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. Material changes will be reflected by
        an updated &quot;Last updated&quot; date above.
      </p>

      <p className="text-xs text-gray-400 mt-8">
        Placeholders in brackets must be filled in with real business details before this page is
        treated as legally binding. Last updated: {LEGAL_LAST_UPDATED}.
      </p>
    </LegalPageClient>
  );
}
