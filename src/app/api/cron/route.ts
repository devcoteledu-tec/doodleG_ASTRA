import { NextRequest, NextResponse } from 'next/server';
import { authorizedCron } from '@/lib/cronAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { AIService } from '@/services/ai';
import { WhatsAppService } from '@/services/whatsapp';
import { rankCandidatesByTier } from '@/lib/giftMatching';
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  if (!authorizedCron(req)) return NextResponse.json({ error:'Unauthorized' },{status:401});
  try {
    const {data: jobs,error}=await supabaseAdmin.rpc('claim_due_gifts',{p_limit:4});
    if(error) throw error;
    const outcomes=await Promise.all((jobs || []).map(async (job: {cycleId:string;recipientName:string;relationship:string;interests:string;quirks:string;dynamic:string;occasionTitle:string;phone:string}) => {
      let sending=false;
      try {
        const {data: products,error:catalogError}=await supabaseAdmin.from('catalog_products').select('id,product_name,category,product_description,price_in_rupees,star_count,total_reviews,available_qty').gt('available_qty',0).order('id').limit(500);
        if(catalogError) throw catalogError;
        const candidates=rankCandidatesByTier((products || []).map(p=>({id:p.id,name:p.product_name,category:p.category,description:p.product_description || '',price:Number(p.price_in_rupees),rating:Number(p.star_count),totalReviews:Number(p.total_reviews),availableQty:p.available_qty,emoji:'🎁'})),job);
        if(!Object.values(candidates).some(p=>p.length)) throw new Error('NO_CATALOG_MATCH');
        const result=await AIService.curateGiftsFromCatalog(job,candidates);
        const {error:saveError}=await supabaseAdmin.rpc('save_gift_packages',{p_cycle_id:job.cycleId,p_packages:result.giftPackages});
        if(saveError) throw saveError;
        const {error:claimError}=await supabaseAdmin.from('gift_cycles').update({dispatch_state:'sending'}).eq('id',job.cycleId);
        if(claimError) throw claimError;
        sending=true;
        const sent=await WhatsAppService.sendCurationPitch({to:job.phone,recipientName:job.recipientName,occasionTitle:job.occasionTitle,orderId:job.cycleId,packages:result.giftPackages.map(p=>({...p,price:p.estimatedPrice}))});
        if(!sent.success) throw new Error('DELIVERY_UNCONFIRMED');
        const {error:sentError}=await supabaseAdmin.from('gift_cycles').update({dispatch_state:'sent',notification_sent_at:new Date().toISOString(),notification_message_id:sent.messageId}).eq('id',job.cycleId);
        if(sentError) throw sentError;
        return {cycleId:job.cycleId,state:'sent'};
      } catch(error) {
        console.error('[gifts/dispatch]',job.cycleId,error);
        await supabaseAdmin.from('gift_cycles').update({dispatch_state:sending?'needs_review':'pending',dispatch_next_attempt_at:new Date(Date.now()+3600000).toISOString(),dispatch_error:sending?'Delivery uncertain; inspect Twilio before retrying.':'Curation failed; retry on next scheduled run.'}).eq('id',job.cycleId);
        return {cycleId:job.cycleId,state:sending?'needs_review':'retry'};
      }
    }));
    return NextResponse.json({success:outcomes.every((o:{state:string})=>o.state==='sent'),outcomes});
  } catch(error) { console.error('[gifts/cron]',error); return NextResponse.json({error:'Scheduler failed.'},{status:503}); }
}
