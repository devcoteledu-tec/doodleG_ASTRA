import { normalizeIndianPhone } from '@/lib/phone';
export interface SendTemplateMessageParams {
  to: string; recipientName: string; occasionTitle: string; orderId: string;
  packages: Array<{ tier: string; title: string; description: string; price: number }>;
}
export class WhatsAppService {
  static async sendCurationPitch(params: SendTemplateMessageParams): Promise<{ success: boolean; messageId?: string; mockLogs?: string[] }> {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const contentSid = process.env.TWILIO_CONTENT_SID;
    if (!sid || !token) {
      if (process.env.NODE_ENV === 'production') throw new Error('TWILIO credentials are required.');
      return { success: true, messageId: 'SMmock_development', mockLogs: ['Development-only message simulation'] };
    }
    if (process.env.NODE_ENV === 'production' && !contentSid) throw new Error('TWILIO_CONTENT_SID must reference an approved WhatsApp template.');
    const payload = new URLSearchParams({ To: `whatsapp:${normalizeIndianPhone(params.to)}`, From: process.env.TWILIO_SENDER_NUMBER || 'whatsapp:+14155238886' });
    if (contentSid) {
      // Approved template: recipient {{1}}, occasion {{2}}, summary {{3}},
      // link suffix {{4}}. Use a CTA URL button pointing to /gifts?cycle={{4}}.
      // Approval is performed after session/ownership verification in the web app.
      payload.set('ContentSid', contentSid);
      payload.set('ContentVariables', JSON.stringify({
        '1': params.recipientName, '2': params.occasionTitle,
        '3': params.packages.map(p => `${p.tier}: ${p.title} (₹${p.price})`).join('; ').slice(0, 900),
        '4': params.orderId,
      }));
    } else {
      payload.set('Body', `Gifts for ${params.recipientName}'s ${params.occasionTitle}:\n` + params.packages.map(p => `${p.tier}: ${p.title} (₹${p.price.toFixed(0)})\n${p.description}\nReply APPROVE_GIFT_${params.orderId}_${p.tier}`).join('\n\n'));
    }
    try {
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST', signal: AbortSignal.timeout(8000),
        headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: payload.toString(),
      });
      const data = await response.json();
      return response.ok && typeof data.sid === 'string' ? { success: true, messageId: data.sid } : { success: false };
    } catch { return { success: false }; }
  }
  static async sendTextReply(to: string, text: string): Promise<boolean> {
    const sid=process.env.TWILIO_ACCOUNT_SID, token=process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) {
      if (process.env.NODE_ENV === 'production') throw new Error('TWILIO credentials are required.');
      return true;
    }
    try {
      const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method:'POST', signal:AbortSignal.timeout(8000), headers:{Authorization:'Basic '+Buffer.from(`${sid}:${token}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({To:`whatsapp:${normalizeIndianPhone(to)}`,From:process.env.TWILIO_SENDER_NUMBER || '',Body:text}).toString() });
      return response.ok;
    } catch { return false; }
  }
}
