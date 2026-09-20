import { z } from 'zod';
import { getSessionFromRequest } from '@/lib/session';
import { NextRequest, NextResponse } from 'next/server';
import { AIService } from '@/services/ai';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

// This route is unauthenticated and calls the billed Gemini API on every
// request, so it needs its own throttle rather than relying on some layer
// above it. See src/lib/rateLimit.ts for the (Supabase-backed, shared)
// implementation.
const RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const ip = getClientIp(req.headers);
    const { allowed, retryAfterSeconds } = await checkRateLimit(`card-writer:${ip}`, RATE_LIMIT, RATE_LIMIT_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
      );
    }

    const parsed = z.object({ senderName: z.string().min(1).max(100), recipientName: z.string().min(1).max(100), relationship: z.string().max(100), occasionTitle: z.string().max(150), tone: z.enum(['sentimental','witty','inside-jokes']), personalDetail: z.string().max(1500).optional() }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Check your card details.' }, { status: 400 });
    const { senderName, recipientName, relationship, occasionTitle, tone, personalDetail } = parsed.data;
    const card = await AIService.generateCardMessage({
      senderName,
      recipientName,
      relationship,
      occasionTitle,
      tone,
      personalDetail,
    });

    return NextResponse.json(card);
  } catch (error) {
    console.error('Error in /api/card-writer API route:', error);
    return NextResponse.json(
      { error: 'Failed to generate card message. Please try again.' },
      { status: 500 }
    );
  }
}
