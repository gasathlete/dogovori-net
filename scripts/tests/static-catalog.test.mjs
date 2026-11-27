import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createStaticCheckout, deliverStaticCatalog, recordStaticPaid, reverseStaticPaid, staticRequest } from '../../supabase/functions/_shared/static-catalog.ts';
const user='10000000-0000-4000-8000-000000000001', assetId='20000000-0000-4000-8000-000000000001', orderId='30000000-0000-4000-8000-000000000001';
const bytes=Buffer.from('%PDF-1.4\nSYNTHETIC FIXTURE ONLY\n%%EOF');
const hash=createHash('sha256').update(bytes).digest('hex'), paidAt='2026-09-30T14:00:00.000Z';
const asset={id:assetId,content:'\\x'+bytes.toString('hex'),content_sha256:hash,filename:'synthetic.pdf',mime_type:'application/pdf',environment:'sandbox',revoked_at:null,legal_accepted_at:paidAt,legal_acceptance_ref:'SYNTHETIC-NOT-LEGAL-ACCEPTANCE',reviewer_ref:'TEST-FIXTURE',amount_cents:100,currency:'eur',stripe_price_id:'price_synthetic'};
const body={assetId,requestId:orderId,environment:'sandbox',termsAccepted:true,immediatePerformanceConsent:true,withdrawalLossAcknowledged:true};
const order={id:orderId,user_id:user,asset_id:assetId,asset_sha256:hash,amount_cents:100,currency:'eur',stripe_price_id:'price_synthetic',terms_version:'2026-09-01',refund_version:'2026-09-01',withdrawal_version:'2026-09-01',terms_accepted:true,immediate_performance_consent:true,withdrawal_loss_acknowledged:true,environment:'sandbox',stripe_session_id:'cs_test_synthetic'};
const session={id:'cs_test_synthetic',url:'https://checkout.stripe.com/test',livemode:false,mode:'payment',payment_status:'paid',client_reference_id:orderId,amount_total:100,amount_subtotal:100,currency:'eur',total_details:{amount_discount:0,amount_shipping:0},metadata:{type:'static_catalog',userId:user,orderId,assetId,assetHash:hash,environment:'sandbox'}};
const price={id:'price_synthetic',active:true,livemode:false,type:'one_time',recurring:null,unit_amount:100,currency:'eur',tax_behavior:'inclusive'};
function harness(){
  const h={asset:structuredClone(asset),order:structuredClone(order),staff:true,ent:{order_id:orderId,user_id:user,asset_id:assetId,asset_sha256:hash,stripe_session_id:session.id,stripe_event_id:'evt_paid',paid_at:paidAt,environment:'sandbox',revoked_at:null},review:{asset_id:assetId,asset_sha256:hash,decision:'accepted',created_at:paidAt},proof:{environment:'sandbox',stripe_event_id:'evt_paid',stripe_session_id:session.id,kind:'paid',event_at:paidAt},session:structuredClone(session),price:structuredClone(price),items:null,calls:[],enabled:true,rpcError:null};
  h.items={data:[{quantity:1,amount_total:100,price:h.price}],has_more:false};
  h.db={from(name){
    let filters=[],write=null;
    const q={select(){return q;},order(){return q;},limit(){return q;},eq(k,v){filters.push([k,v]);return q;},upsert(){h.calls.push('upsert');return Promise.resolve({error:null});},update(v){write=v;return q;},maybeSingle(){let row=name==='static_catalog_assets'?h.asset:name==='static_catalog_orders'?h.order:name==='static_catalog_entitlements'?h.ent:h.proof; if(!row||filters.some(([k,v])=>row[k]!==v))row=null;return Promise.resolve({data:row?structuredClone(row):null,error:null});},then(resolve){if(write)Object.assign(h.order,write);const reviews=h.review&&!filters.some(([k,v])=>h.review[k]!==v)?[structuredClone(h.review)]:[];resolve({data:name==='static_catalog_asset_reviews'?reviews:[{id:orderId}],error:null});}};return q;
  },rpc:async(name,args)=>{h.calls.push([name,args]);if(name==='is_staff')return {data:h.staff,error:null};return {data:{ok:true},error:h.rpcError};}};
  h.stripe=()=>({prices:{retrieve:async()=>h.price},checkout:{sessions:{create:async(...a)=>{h.calls.push(['create',...a]);return h.session;},listLineItems:async()=>h.items,list:async()=>({data:[h.session],has_more:false})}},charges:{retrieve:async()=>({payment_intent:'pi_test'})}});
  h.env=k=>k==='STATIC_CATALOG_SANDBOX_CHECKOUT_ENABLED'&&h.enabled?'true':undefined;
  return h;
}
test('sandbox checkout is staff-only and both environments are OFF by default, with no provider call',async()=>{
  for(const patch of [{enabled:false},{staff:false}]){const h=Object.assign(harness(),patch);await assert.rejects(()=>createStaticCheckout(h,user,body));assert(!h.calls.some(x=>x[0]==='create'));}
  await assert.rejects(()=>createStaticCheckout(harness(),user,{...body,environment:'live'}));
});
test('explicit consents and accepted nonrevoked asset required',async()=>{
  for(const key of ['termsAccepted','immediatePerformanceConsent','withdrawalLossAcknowledged'])await assert.rejects(()=>createStaticCheckout(harness(),user,{...body,[key]:false}));
  for(const patch of [{revoked_at:paidAt},{legal_acceptance_ref:''},{environment:'live'}]){const h=harness();Object.assign(h.asset,patch);await assert.rejects(()=>createStaticCheckout(h,user,body));}
});
test('checkout binds server price/hash and stable idempotency, never raw document payload',async()=>{
  const h=harness();const result=await createStaticCheckout(h,user,body);assert.equal(result.order_id,orderId);
  const call=h.calls.find(x=>x[0]==='create');assert.equal(call[1].metadata.assetHash,hash);assert.equal(call[1].line_items[0].price,price.id);assert.equal(call[2].idempotencyKey,`static-catalog:sandbox:${user}:${orderId}`);
  assert.equal(call[1].allow_promotion_codes,false);
});
test('wrong owner order and live/discounted price never reach checkout',async()=>{
  for(const patch of [{user_id:'other'},{asset_sha256:'0'.repeat(64)}]){const h=harness();Object.assign(h.order,patch);await assert.rejects(()=>createStaticCheckout(h,user,body));}
  for(const patch of [{livemode:true},{unit_amount:99},{tax_behavior:'exclusive'}]){const h=harness();Object.assign(h.price,patch);await assert.rejects(()=>createStaticCheckout(h,user,body));}
});
test('paid record validates exact session, line item, user, amount and event proof',async()=>{
  const h=harness();await recordStaticPaid(h,session,'sandbox',{eventId:'evt_paid',paidAt});assert(h.calls.some(x=>x[0]==='record_static_catalog_payment_env'));
  for(const patch of [{amount_total:99},{livemode:true},{payment_status:'unpaid'},{client_reference_id:'other'},{total_details:{amount_discount:1,amount_shipping:0}}])await assert.rejects(()=>recordStaticPaid(harness(),{...session,...patch},'sandbox',{eventId:'evt_paid',paidAt}));
  const t=harness();t.items.data.push(t.items.data[0]);await assert.rejects(()=>recordStaticPaid(t,session,'sandbox',{eventId:'evt_paid',paidAt}));
  const failed=harness();failed.rpcError={message:'simulated'};await assert.rejects(()=>recordStaticPaid(failed,session,'sandbox',{eventId:'evt_paid',paidAt}));
});
test('repeat delivery returns exact bytes with no quota, payment or AI call even while checkout paused',async()=>{
  const h=harness();h.enabled=false;
  for(let n=0;n<2;n++){const r=await deliverStaticCatalog(h,user,orderId);assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes);assert.match(r.headers.get('Cache-Control'),/no-store/);assert.match(r.headers.get('Content-Disposition'),/synthetic.pdf/);}
  assert(!h.calls.some(x=>['create','record_static_catalog_payment_env','consume_quota'].includes(x[0])));
});
test('other owner, unproven payment, refund, missing artifact and tampered bytes fail closed',async()=>{
  for(const mutate of [h=>h.ent.user_id='other',h=>h.ent.revoked_at=paidAt,h=>h.ent=null,h=>h.proof=null,h=>h.asset.revoked_at=paidAt,h=>h.asset.content+='00',h=>h.order.asset_sha256='0'.repeat(64)]){const h=harness();mutate(h);await assert.rejects(()=>deliverStaticCatalog(h,user,orderId));}
});
test('refund binds through provider session, never browser/session guesses',async()=>{
  const h=harness();await reverseStaticPaid(h,{payment_intent:'pi_test'},'sandbox','refund_full',{eventId:'evt_refund',paidAt});assert(h.calls.some(x=>x[0]==='revoke_static_catalog_payment_env'));
  const live=harness();await reverseStaticPaid(live,{payment_intent:'pi_test'},'live','refund_full',{eventId:'evt_refund',paidAt});assert.equal(live.calls.length,0);
});
test('body refuses injected amount, filename, content, hash and return URL',async()=>{
  for(const key of ['amount','content','filename','assetHash','returnUrl'])await assert.rejects(()=>staticRequest(new Request('https://example.test',{method:'POST',body:JSON.stringify({orderId,[key]:'forged'})}),['orderId']));
});

test('checkout requires latest accepted review for exact hash before provider call',async()=>{
  for(const review of [null,{asset_id:assetId,asset_sha256:hash,decision:'rejected'},{asset_id:assetId,asset_sha256:'0'.repeat(64),decision:'accepted'}]){
    const h=harness();h.review=review;
    await assert.rejects(()=>createStaticCheckout(h,user,body),e=>e.code==='asset_not_accepted');
    assert(!h.calls.some(x=>x[0]==='create'));
  }
});
test('environment is passed explicitly into both payment RPCs',async()=>{
  const h=harness();await recordStaticPaid(h,session,'sandbox',{eventId:'evt_paid',paidAt});
  await reverseStaticPaid(h,{payment_intent:'pi_test'},'sandbox','refund_full',{eventId:'evt_refund',paidAt});
  for(const name of ['record_static_catalog_payment_env','revoke_static_catalog_payment_env']){
    assert.equal(h.calls.find(x=>x[0]===name)?.[1].p_environment,'sandbox');
  }
});
test('delivery refuses a payment proof from another environment',async()=>{
  const h=harness();h.proof.environment='live';
  await assert.rejects(()=>deliverStaticCatalog(h,user,orderId),e=>e.code==='payment_unverified');
});
