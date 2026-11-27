import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({ latest:vi.fn(),rpc:vi.fn(), user:vi.fn(),upsert:vi.fn() }));
vi.mock("@/integrations/supabase/client",()=>({supabase:{ auth:{getUser:m.user},rpc:m.rpc,from:()=>{const b={select:()=>b,eq:()=>b,order:()=>b,limit:()=>b,maybeSingle:m.latest,upsert:m.upsert};return b;}}}));
import { hasConsent,flushPendingConsents } from "@/lib/consents";
beforeEach(()=>{sessionStorage.clear();m.user.mockResolvedValue({data:{user:{id:"owner"}}});m.rpc.mockResolvedValue({data:{ok:true},error:null});m.upsert.mockClear();});
it("latest withdrawal beats historic acceptance",async()=>{m.latest.mockResolvedValue({data:{granted:false},error:null});expect(await hasConsent("marketing")).toBe(false);});
it("latest acceptance is active",async()=>{m.latest.mockResolvedValue({data:{granted:true},error:null});expect(await hasConsent("marketing")).toBe(true);});
it("unbound local signup choice cannot transfer to another account",async()=>{
sessionStorage.setItem("pending_consents",JSON.stringify({terms:true,privacy:true,age_18:true,operational_notifications:true,marketing:true}));await flushPendingConsents();expect(m.upsert).not.toHaveBeenCalled();expect(sessionStorage.getItem("pending_consents")).toBeNull();
});