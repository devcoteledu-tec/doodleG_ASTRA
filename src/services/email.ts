/**
 * Transactional email service — currently used for sign-up email
 * verification codes. Talks to the Resend HTTP API directly (no SDK
 * dependency needed, same "plain fetch to a REST API" approach as
 * src/services/whatsapp.ts uses for Twilio).
 *
 * Missing RESEND_API_KEY in development => the send is simulated and the
 * code is logged to the console so local sign-up flows still work end to
 * end. Missing in production => throws, same convention as the Twilio
 * integration in whatsapp.ts (see src/lib/env.ts for the boot-time check).
 */

interface SendVerificationCodeParams {
  to: string;
  code: string;
  name?: string;
}

interface SendResult {
  success: boolean;
  messageId?: string;
  mockLogs?: string[];
}

export class EmailService {
  private static apiKey = process.env.RESEND_API_KEY || '';
  private static fromAddress = process.env.RESEND_FROM_EMAIL || 'doodle_G <onboarding@doodleg.app>';
  // The "From" address just needs to live on a Resend-verified domain — it
  // doesn't need to be a real inbox. This lets replies land somewhere that
  // actually gets checked (e.g. a real Gmail) even while "From" stays on
  // the branded domain.
  private static replyTo = process.env.RESEND_REPLY_TO || '';

  static async sendVerificationCode({ to, code, name }: SendVerificationCodeParams): Promise<SendResult> {
    const escapedName = name?.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
    const greeting = escapedName ? `Hi ${escapedName},` : 'Hi there,';
    const subject = `${code} is your doodle_G verification code`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <p style="font-size: 15px; color: #0a0a0a;">${greeting}</p>
        <p style="font-size: 15px; color: #0a0a0a;">Use this code to verify your email address and finish creating your doodle_G account:</p>
        <div style="margin: 24px 0; text-align: center;">
          <span style="display: inline-block; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #0a0a0a; background: #f2fbf5; border: 2px solid #16a34a; border-radius: 12px; padding: 14px 20px;">${code}</span>
        </div>
        <p style="font-size: 13px; color: #555;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `;

    const mockLogs: string[] = [
      `📧 Sending verification email to: ${to}`,
      `📝 Subject: ${subject}`,
      `🔢 Code: ${code} (valid 10 minutes)`,
      ...(this.replyTo ? [`↩️  Reply-To: ${this.replyTo}`] : []),
    ];

    if (!this.apiKey) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('RESEND_API_KEY is not set in production. Refusing to simulate an email send.');
      }
      console.warn('RESEND_API_KEY missing. Simulating successful mock email delivery.');
      console.log('--- EMAIL DISPATCH SIMULATION ---');
      mockLogs.forEach(log => console.log(log));
      console.log('----------------------------------');
      return { success: true, messageId: `mock_${Math.random().toString(36).slice(2)}`, mockLogs };
    }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.fromAddress,
          to: [to],
          subject,
          html,
          ...(this.replyTo ? { reply_to: this.replyTo } : {}),
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error('Resend API error:', res.status, errText);
        return { success: false };
      }

      const data = await res.json();
      return { success: true, messageId: data.id };
    } catch (err) {
      console.error('Failed to send verification email:', err);
      return { success: false };
    }
  }
}
