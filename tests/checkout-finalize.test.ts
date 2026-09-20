import {describe,it,expect,vi,beforeEach} from 'vitest';
import {createSupabaseAdminMock} from './helpers/supabaseMock';
const fetchPayment=vi.hoisted(()=>vi.fn());vi.mock('@/lib/razorpay',()=>({getRazorpayClient:()=>({payments:{fetch:fetchPayment}})}));
let db:ReturnType<typeof createSupabaseAdminMock>;vi.mock('@/lib/supabaseAdmin',()=>({get supabaseAdmin(){return db;}}));
import {finalizePayment} from '@/lib/checkout';
beforeEach(()=>{fetchPayment.mockReset().mockResolvedValue({id:'pay_1',order_id:'order_1',status:'captured',amount:14000,currency:'INR'});db=createSupabaseAdminMock({checkout_attempts:[{data:{id:'attempt',user_id:'owner',expected_paise:14000},error:null}],'rpc:finalize_checkout':[{data:[{state:'completed',order_id:'db-order',order_number:'DG-1'}],error:null}]});});
describe('processor-backed payment verification',()=>{
 it('only finalizes captured INR payments with exact persisted amount',async()=>{expect((await finalizePayment('pay_1','order_1','owner')).order_id).toBe('db-order');expect(db.rpcCalls[0]).toEqual({fn:'finalize_checkout',params:{p_attempt_id:'attempt',p_payment_id:'pay_1',p_amount_paise:14000}});});
 it.each(['authorized','failed','refunded'])('does not finalize %s payments',async status=>{fetchPayment.mockResolvedValue({status,order_id:'order_1',currency:'INR'});await expect(finalizePayment('pay_1')).rejects.toThrow('PAYMENT_NOT_CAPTURED');expect(db.rpcCalls).toHaveLength(0);});
 it('rejects payment belonging to a different signed-in user',async()=>{await expect(finalizePayment('pay_1','order_1','other')).rejects.toThrow('CHECKOUT_NOT_FOUND');expect(db.rpcCalls).toHaveLength(0);});
 it('rejects different processor order',async()=>{await expect(finalizePayment('pay_1','order_wrong')).rejects.toThrow('PAYMENT_ORDER_MISMATCH');expect(db.rpcCalls).toHaveLength(0);});
 it('rejects a captured amount mismatch',async()=>{fetchPayment.mockResolvedValue({id:'pay_1',order_id:'order_1',status:'captured',amount:1,currency:'INR'});await expect(finalizePayment('pay_1')).rejects.toThrow('PAYMENT_AMOUNT_MISMATCH');expect(db.rpcCalls).toHaveLength(0);});
 it('rejects another currency',async()=>{fetchPayment.mockResolvedValue({id:'pay_1',order_id:'order_1',status:'captured',amount:14000,currency:'USD'});await expect(finalizePayment('pay_1')).rejects.toThrow('PAYMENT_NOT_CAPTURED');});
});
