import { NextRequest, NextResponse } from 'next/server';
import { authorizedCron } from '@/lib/cronAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRazorpayClient } from '@/lib/razorpay';
import { finalizePayment } from '@/lib/checkout';
export const maxDuration=60;
export async function GET(req:NextRequest) {
  if(!authorizedCron(req)) return NextResponse.json({error:'Unauthorized'},{status:401});
  try {
    const {data,error}=await supabaseAdmin.from('checkout_attempts').select('id,razorpay_order_id').eq('state','pending').not('razorpay_order_id','is',null).order('updated_at').limit(5);
    if(error) throw error;
    let recovered=0;
    for(const attempt of data || []) {
      const payments=await getRazorpayClient().orders.fetchPayments(attempt.razorpay_order_id);
      const payment=payments.items.find(p=>p.status==='captured');
      if(payment) { await finalizePayment(payment.id,attempt.razorpay_order_id); recovered++; }
      await supabaseAdmin.from('checkout_attempts').update({updated_at:new Date().toISOString()}).eq('id',attempt.id);
    }
    return NextResponse.json({recovered});
  } catch(error) { console.error('[payments/reconcile]',error); return NextResponse.json({error:'Reconciliation failed.'},{status:503}); }
}
