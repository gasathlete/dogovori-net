import { expect,it,vi } from "vitest";
import { syncSubscriptionEvent, reverseTopup } from "../../supabase/functions/_shared/subscription-event";
const sub={id:"sub",customer:"cus",metadata:{userId:"owner"},status:"canceled",cancel_at_period_end:true,items:{data:[{current_period_end:2000000000,price:{lookup_key:"professional_monthly",product:"prod"}}]}};
it("passes signed ordering and environment to atomic ledger",async()=>{
 const rpc=vi.fn().mockResolvedValue({data:{ok:true},error:null});
 await syncSubscriptionEvent({db:{rpc}} as never,sub,"sandbox",{id:"evt",created:100});
 expect(rpc.mock.calls[0][1]).toMatchObject({p_environment:"sandbox",p_event_created:100,p_event_id:"evt",p_subscription:{status:"canceled",cancel_at_period_end:true,user_id:"owner"}});
});
it("failed ledger is retryable, not acknowledged",async()=>{
 const rpc=vi.fn().mockResolvedValue({data:null,error:{message:"offline"}});
 await expect(syncSubscriptionEvent({db:{rpc}} as never,sub,"live",{id:"evt",created:100})).rejects.toThrow("subscription_sync_failed");
});
it("refund ignores product and cross-environment sessions",async()=>{
 const rpc=vi.fn();const list=vi.fn().mockResolvedValue({data:[{mode:"payment",payment_intent:"pi",livemode:false,metadata:{productId:"contract_check"}},{mode:"payment",payment_intent:"pi",livemode:true,metadata:{priceId:"five_operations"}}]});
 await reverseTopup({db:{rpc},createStripe:()=>({checkout:{sessions:{list}}})} as never,{payment_intent:"pi"},"sandbox");expect(rpc).not.toHaveBeenCalled();
});
it("refund binds exact provider session and payment intent without staff recheck",async()=>{
 const rpc=vi.fn().mockResolvedValue({data:{ok:true},error:null});const list=vi.fn().mockResolvedValue({data:[{id:"cs",mode:"payment",payment_intent:"pi",livemode:false,metadata:{priceId:"five_operations"}}]});
 await reverseTopup({db:{rpc},createStripe:()=>({checkout:{sessions:{list}}})} as never,{payment_intent:"pi"},"sandbox");expect(rpc).toHaveBeenCalledWith("reverse_topup_payment",{p_session_id:"cs",p_payment_intent:"pi",p_environment:"sandbox"});
});