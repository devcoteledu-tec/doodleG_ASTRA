import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  subject: z.string().trim().max(150).default(''),
  message: z.string().trim().min(10).max(5000),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter your name, email and a message of 10–5,000 characters.' }, { status: 400 });
  const limit = await checkRateLimit(`support:${getClientIp(req.headers)}`, 5, 3600000);
  if (!limit.allowed) return NextResponse.json({ error: 'Please wait before sending another message.' }, { status: 429 });
  const key = process.env.RESEND_API_KEY;
  const to = process.env.SUPPORT_EMAIL;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !to || !from) return NextResponse.json({ error: 'Support messaging is temporarily unavailable. Please try again later.' }, { status: 503 });
  const { name, email, subject, message } = parsed.data;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], reply_to: email, subject: `Support: ${subject || 'Customer question'}`,
        text: `Name: ${name}\nEmail: ${email}\n\n${message}` }),
    });
    if (!response.ok) throw new Error('EMAIL_PROVIDER_REJECTED');
    const data = await response.json();
    if (!data.id) throw new Error('EMAIL_RECEIPT_MISSING');
    return NextResponse.json({ success: true, reference: data.id });
  } catch {
    return NextResponse.json({ error: 'We could not confirm your message was sent. Please try again later.' }, { status: 503 });
  }
}
