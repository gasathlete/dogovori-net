import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { boundedRequestText, verifyStripeProof } from '../../supabase/functions/_shared/webhook-proof.ts';
const now=1790780400000, timestamp=String(now/1000), secret='synthetic-test-secret';
const event={id:'evt_synthetic',created:now/1000,livemode:false,type:'checkout.session.completed',data:{object:{id:'cs_test_synthetic'}}};
const sign=(body,t=timestamp)=>`t=${t},v1=${createHmac('sha256',secret).update(`${t}.${body}`).digest('hex')}`;
test('exact raw body proof and rotated signature are accepted',async()=>{
  const body=JSON.stringify(event);
  assert.deepEqual(await verifyStripeProof(`${sign(body)},v1=${'0'.repeat(64)}`,body,secret,'sandbox',now),event);
});
for(const value of ['NaN','Infinity','-1','1e9','','999999999999999999999'])test(`timestamp ${value} is rejected even with valid HMAC`,async()=>{
  const body=JSON.stringify(event);await assert.rejects(()=>verifyStripeProof(sign(body,value),body,secret,'sandbox',now));
});
test('duplicate timestamp, expired proof, body alteration and wrong secret rejected',async()=>{
  const body=JSON.stringify(event);
  for(const signature of [sign(body)+`,t=${timestamp}`,sign(body,String(now/1000-301)),sign(body).replace(/v1=./,'v1=f')]){
    await assert.rejects(()=>verifyStripeProof(signature,body+' ',secret,'sandbox',now));
  }
  await assert.rejects(()=>verifyStripeProof(sign(body),body,'wrong','sandbox',now));
});
test('sandbox and live event proofs cannot cross environments',async()=>{
  const body=JSON.stringify(event);await assert.rejects(()=>verifyStripeProof(sign(body),body,secret,'live',now));
});
for(const patch of [{id:''},{created:null},{livemode:undefined},{data:{object:null}}])test(`malformed signed event ${JSON.stringify(patch)}`,async()=>{
  const body=JSON.stringify({...event,...patch});await assert.rejects(()=>verifyStripeProof(sign(body),body,secret,'sandbox',now));
});
test('declared and streaming limits apply before decoding',async()=>{
  await assert.rejects(()=>boundedRequestText(new Request('https://example.test',{method:'POST',body:'abc',headers:{'Content-Length':'99'}}),3));
  await assert.rejects(()=>boundedRequestText(new Request('https://example.test',{method:'POST',body:'abcd'}),3));
  assert.equal(await boundedRequestText(new Request('https://example.test',{method:'POST',body:'abc'}),3),'abc');
  await assert.rejects(()=>boundedRequestText(new Request('https://example.test',{method:'POST',body:new Uint8Array([255])}),3));
});
