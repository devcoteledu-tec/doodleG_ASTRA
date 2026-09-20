import {describe,it,expect,vi,beforeEach} from 'vitest';
import {createSupabaseAdminMock} from './helpers/supabaseMock';
const ai=vi.hoisted(()=>({curateGiftsFromCatalog:vi.fn()}));vi.mock('@/services/ai',()=>({AIService:ai}));
const whatsapp=vi.hoisted(()=>({sendCurationPitch:vi.fn()}));vi.mock('@/services/whatsapp',()=>({WhatsAppService:whatsapp}));
let db:ReturnType<typeof createSupabaseAdminMock>;vi.mock('@/lib/supabaseAdmin',()=>({get supabaseAdmin(){return db;}}));
const {GET}=await import('@/app/api/cron/route');
const job={cycleId:'cycle-a',recipientName:'Jamie',relationship:'Friend',interests:'books',quirks:'',dynamic:'',occasionTitle:'Birthday',phone:'9876543210'};
const products=[{id:'product-a',product_name:'Book',category:'Books',product_description:'Books',price_in_rupees:100,star_count:5,total_reviews:2,available_qty:2}];
function req(auth=true){return new Request('http://localhost/api/cron',{headers:auth?{authorization:'Bearer test-cron-secret'}:{}}) as import('next/server').NextRequest;}
beforeEach(()=>{vi.clearAllMocks();process.env.CRON_SECRET='test-cron-secret';ai.curateGiftsFromCatalog.mockResolvedValue({giftPackages:[{tier:'CLASSIC',title:'Book',estimatedPrice:100,productId:'product-a'}]});whatsapp.sendCurationPitch.mockResolvedValue({success:true,messageId:'SM123'});db=createSupabaseAdminMock({'rpc:claim_due_gifts':[{data:[job],error:null}],catalog_products:[{data:products,error:null}]});});
describe('durable gift dispatch',()=>{
 it('requires bearer authorization',async()=>{expect((await GET(req(false))).status).toBe(401);expect(db.rpcCalls).toHaveLength(0);});
 it('claims work atomically and records confirmed dispatch',async()=>{const r=await GET(req());expect(r.status).toBe(200);expect(db.rpcCalls[0]).toEqual({fn:'claim_due_gifts',params:{p_limit:4}});expect(db.updatedRows.gift_cycles).toContainEqual(expect.objectContaining({dispatch_state:'sent',notification_message_id:'SM123'}));});
 it('does no work when the database has no due/unclaimed cycles',async()=>{db=createSupabaseAdminMock({'rpc:claim_due_gifts':[{data:[],error:null}]});await GET(req());expect(whatsapp.sendCurationPitch).not.toHaveBeenCalled();});
 it('marks ambiguous sends for review instead of auto-resending',async()=>{whatsapp.sendCurationPitch.mockResolvedValue({success:false});await GET(req());expect(db.updatedRows.gift_cycles).toContainEqual(expect.objectContaining({dispatch_state:'needs_review'}));});
 it('does not send fictional gifts when inventory is absent',async()=>{db=createSupabaseAdminMock({'rpc:claim_due_gifts':[{data:[job],error:null}],catalog_products:[{data:[],error:null}]});await GET(req());expect(whatsapp.sendCurationPitch).not.toHaveBeenCalled();expect(db.updatedRows.gift_cycles).toContainEqual(expect.objectContaining({dispatch_state:'pending'}));});
 it('signals database outages',async()=>{db=createSupabaseAdminMock({'rpc:claim_due_gifts':[{data:null,error:{message:'offline'}}]});expect((await GET(req())).status).toBe(503);});
});
