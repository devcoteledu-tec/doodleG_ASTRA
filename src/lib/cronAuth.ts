import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';
export function authorizedCron(req: NextRequest): boolean {
  const secret=process.env.CRON_SECRET;
  const provided=req.headers.get('authorization')?.replace(/^Bearer /,'');
  return Boolean(secret && provided && secret.length===provided.length && timingSafeEqual(Buffer.from(secret),Buffer.from(provided)));
}
