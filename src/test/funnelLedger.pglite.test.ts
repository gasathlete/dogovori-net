// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";
let db: PGlite;
const U="00000000-0000-4000-8000-000000000001", V="00000000-0000-4000-8000-000000000002";
beforeAll(async()=>{
 db=new PGlite(); await db.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email_confirmed_at timestamptz,raw_user_meta_data jsonb DEFAULT '{}');
 CREATE TABLE public.user_consents(id uuid DEFAULT gen_random_uuid(),user_id uuid,consent_type text,document_version text,granted boolean,consent_event_id uuid,metadata jsonb,created_at timestamptz DEFAULT now(), UNIQUE(user_id,consent_type,consent_event_id));
 CREATE TABLE public.download_quota(user_id uuid PRIMARY KEY,plan text DEFAULT 'free',pro_until timestamptz,plan_ops_cap integer,topup_ops_balance integer DEFAULT 0);
 CREATE TABLE public.subscriptions(id uuid DEFAULT gen_random_uuid(), user_id uuid,stripe_subscription_id text UNIQUE,stripe_customer_id text,product_id text,price_id text,status text,current_period_start timestamptz,current_period_end timestamptz,cancel_at_period_end boolean,environment text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
 CREATE TABLE public.topup_purchases(id uuid DEFAULT gen_random_uuid(),user_id uuid,price_id text,ops_added integer,amount_eur numeric,stripe_session_id text UNIQUE,environment text,created_at timestamptz DEFAULT now());
 INSERT INTO public.download_quota(user_id) VALUES('${U}'),('${V}');
 `);
 await db.exec(readFileSync("docs/migrations/funnel_confirmation_handoff_20261024.sql","utf8"));
 await db.exec(readFileSync("docs/migrations/funnel_billing_ledger_20261024.sql","utf8"));
 await db.exec(readFileSync("docs/migrations/funnel_refund_replay_20261024.sql","utf8"));
},30000);
afterAll(async()=>{await db?.close();});
const as=async(u:string)=>{await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[u]);};
const handoff={event_id:"10000000-0000-4000-8000-000000000001",terms:true,privacy:true,age_18:true,operational_notifications:true,marketing:true,return_path:"/plans"};
it("signup attempt has no consent, confirmed owner consumes once across devices",async()=>{
 await db.query("INSERT INTO auth.users(id,raw_user_meta_data) VALUES($1,$2)",[U,{signup_handoff:handoff}]);await as(U);
 expect((await db.query<{r:any}>("SELECT consume_signup_handoff() r")).rows[0].r.reason).toBe("confirmation_required");
 expect((await db.query<{n:number}>("SELECT count(*)::int n FROM user_consents")).rows[0].n).toBe(0);
 await db.query("UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1",[U]);
 const first=(await db.query<{r:any}>("SELECT consume_signup_handoff() r")).rows[0].r;expect(first.return_path).toBe("/plans");
 await db.query("SELECT consume_signup_handoff()");expect((await db.query<{n:number}>("SELECT count(*)::int n FROM user_consents")).rows[0].n).toBe(5);
});
it("different owner cannot consume another identity and metadata edits cannot replace evidence",async()=>{
 await db.query("INSERT INTO auth.users(id,email_confirmed_at) VALUES($1,now())",[V]);await as(V);
 expect((await db.query<{r:any}>("SELECT consume_signup_handoff() r")).rows[0].r.reason).toBe("nothing_pending");
 await db.query("UPDATE auth.users SET raw_user_meta_data=$1 WHERE id=$2",[{signup_handoff:{...handoff,marketing:false}},U]);
 expect((await db.query<{e:any}>("SELECT evidence e FROM signup_handoffs WHERE user_id=$1",[U])).rows[0].e.marketing).toBe(true);
});
it("unbound invalid and expired evidence cannot grant consent",async()=>{
 const x="00000000-0000-4000-8000-000000000003";
 await db.query("INSERT INTO auth.users(id,email_confirmed_at,raw_user_meta_data) VALUES($1,now(),$2)",[x,{signup_handoff:{...handoff,return_path:"https://evil.example"}}]);
 expect((await db.query<{p:string}>("SELECT return_path p FROM signup_handoffs WHERE user_id=$1",[x])).rows[0].p).toBe("/account");
 await db.query("UPDATE signup_handoffs SET expires_at=now()-interval '1 second' WHERE user_id=$1",[x]);await as(x);
 expect((await db.query<{r:any}>("SELECT consume_signup_handoff() r")).rows[0].r.reason).toBe("expired");
});
it("withdrawal after signup cannot be overwritten by delayed handoff",async()=>{
 const x="00000000-0000-4000-8000-000000000004";
 await db.query("INSERT INTO auth.users(id,email_confirmed_at,raw_user_meta_data) VALUES($1,now(),$2)",[x,{signup_handoff:handoff}]);
 await db.query("INSERT INTO user_consents(user_id,consent_type,granted,created_at) VALUES($1,'marketing',false,now()+interval '1 second')",[x]);await as(x);await db.query("SELECT consume_signup_handoff()");
 expect((await db.query<{n:number}>("SELECT count(*)::int n FROM user_consents WHERE user_id=$1 AND consent_type='marketing' AND granted",[x])).rows[0].n).toBe(0);
});
const sub={user_id:U,stripe_subscription_id:"sub_test",stripe_customer_id:"cus_test",product_id:"prod_test",price_id:"professional_monthly",status:"active",current_period_start:"2026-10-24T00:00:00Z",current_period_end:"2099-01-01T00:00:00Z",cancel_at_period_end:false};
const sync=async(s:object,env:string,t:number,id:string)=>(await db.query<{r:any}>("SELECT sync_subscription_event($1,$2,$3,$4) r",[s,env,t,id])).rows[0].r;
it("sandbox subscriptions never modify live quota",async()=>{
 await sync(sub,"sandbox",100,"evt100");expect((await db.query<{p:string}>("SELECT plan p FROM download_quota WHERE user_id=$1",[U])).rows[0].p).toBe("free");
});
it("stale/replayed events do not resurrect canceled subscription",async()=>{
 await sync({...sub,status:"canceled"},"sandbox",102,"evt102");expect((await sync(sub,"sandbox",101,"evt101")).applied).toBe(false);
 expect((await sync(sub,"sandbox",102,"evt102")).applied).toBe(false);
 await expect(sync(sub,"live",103,"evt103")).rejects.toThrow("subscription_binding_mismatch");
});
it("scheduled cancellation preserves live access until paid period end",async()=>{
 await sync({...sub,stripe_subscription_id:"sub_live",status:"canceled",cancel_at_period_end:true},"live",104,"evt104");
 expect((await db.query<{p:string}>("SELECT plan p FROM download_quota WHERE user_id=$1",[U])).rows[0].p).toBe("pro");
});
it("concurrent replay grants once and refunds once in isolated sandbox ledger",async()=>{
 const credit=()=>db.query("SELECT credit_topup_ops($1,'five_operations',5,2.9,'cs_test','sandbox')",[U]);await Promise.all([credit(),credit(),credit()]);
 expect((await db.query<{n:number}>("SELECT ops_balance n FROM billing_test_balances WHERE user_id=$1",[U])).rows[0].n).toBe(5);
 await expect(db.query("SELECT reverse_topup_payment('cs_test','pi_test','live')")).rejects.toThrow("reversal_binding_mismatch");
 const reverse=()=>db.query("SELECT reverse_topup_payment('cs_test','pi_test','sandbox')");await Promise.all([reverse(),reverse()]);await credit();
 expect((await db.query<{n:number}>("SELECT ops_balance n FROM billing_test_balances WHERE user_id=$1",[U])).rows[0].n).toBe(0);
 expect((await db.query<{n:number}>("SELECT topup_ops_balance n FROM download_quota WHERE user_id=$1",[U])).rows[0].n).toBe(0);
});
it("refund arriving before paid webhook prevents later grant",async()=>{
 await db.query("SELECT reverse_topup_payment('cs_reordered','pi_reordered','sandbox')");
 await expect(db.query("SELECT credit_topup_ops($1,'five_operations',5,2.9,'cs_reordered','sandbox')",[U])).rejects.toThrow("payment_already_reversed");
});