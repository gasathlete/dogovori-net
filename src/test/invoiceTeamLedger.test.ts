// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";
let db: PGlite;
const U="00000000-0000-4000-8000-000000000001", T="00000000-0000-4000-8000-000000000003";
beforeAll(async()=>{
 db=new PGlite(); await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE TABLE subscriptions(user_id uuid,stripe_subscription_id text UNIQUE,stripe_customer_id text,product_id text,price_id text,status text,current_period_start timestamptz,current_period_end timestamptz,cancel_at_period_end boolean,environment text,updated_at timestamptz);
 CREATE TABLE download_quota(user_id uuid PRIMARY KEY,plan text DEFAULT 'free',pro_until timestamptz,plan_ops_cap integer,topup_ops_balance integer DEFAULT 0);
 CREATE TABLE topup_purchases(id uuid DEFAULT gen_random_uuid(),user_id uuid,price_id text,ops_added integer,amount_eur numeric,stripe_session_id text UNIQUE,environment text);
 CREATE TABLE teams(id uuid PRIMARY KEY,owner_id uuid,environment text,status text,stripe_subscription_id text,stripe_customer_id text,seat_count integer,current_period_start timestamptz,current_period_end timestamptz,updated_at timestamptz);
 CREATE TABLE team_members(team_id uuid,user_id uuid);
 INSERT INTO download_quota(user_id) VALUES('${U}'); INSERT INTO teams(id,owner_id,environment,status) VALUES('${T}','${U}','sandbox','pending');`);
 await db.exec(readFileSync('docs/migrations/funnel_billing_ledger_20261024.sql','utf8'));
 await db.exec(readFileSync('docs/migrations/funnel_invoice_team_20261024.sql','utf8'));
},30000);
afterAll(async()=>{await db.close();});
const sub={user_id:U,stripe_subscription_id:'sub_one',stripe_customer_id:'cus',product_id:'prod',price_id:'professional_monthly',status:'active',current_period_start:'2098-01-01T00:00:00Z',current_period_end:'2099-01-01T00:00:00Z'};
const sync=(s:object,e='live',n=100)=>db.query('SELECT sync_subscription_event($1,$2,$3,$4)',[s,e,n,`evt${n}`]);
const invoice={invoice_id:'in_one',user_id:U,stripe_subscription_id:'sub_one',stripe_customer_id:'cus',currency:'eur',amount_paid:1290,amount_refunded:0,period_start:sub.current_period_start,period_end:sub.current_period_end};
const rec=(i:object,e='live')=>db.query('SELECT reconcile_subscription_invoice($1,$2,$3)',[i,e,'evt_invoice']);
const plan=async()=>(await db.query<{plan:string}>('SELECT plan FROM download_quota')).rows[0].plan;
it('partial refund preserves paid period; full refund revokes only that period',async()=>{
 await sync(sub); await rec({...invoice,amount_refunded:500}); expect(await plan()).toBe('pro');
 await rec({...invoice,amount_refunded:1290}); expect(await plan()).toBe('free');
 await sync(sub,'live',101); expect(await plan()).toBe('free');
});
it('replayed paid event cannot undo full refund and cross-environment binding is rejected',async()=>{
 await rec(invoice); expect(await plan()).toBe('free');
 await expect(rec(invoice,'sandbox')).rejects.toThrow('invoice_subscription_binding_mismatch');
});
it('another active subscription survives an old invoice refund',async()=>{
 await sync({...sub,stripe_subscription_id:'sub_two'},'live',102); await rec({...invoice,amount_refunded:1290}); expect(await plan()).toBe('pro');
});
it('new paid invoice for the exact refunded period restores only verified access without moving signed event time',async()=>{
 await rec({...invoice,invoice_id:'in_repaid'});
 expect((await db.query<{status:string,last_event_created:number}>("SELECT status,last_event_created FROM subscriptions WHERE stripe_subscription_id='sub_one'")).rows[0]).toEqual({status:'active',last_event_created:101});
});
it('later renewal and manual extension are not revoked by old refunded period',async()=>{
 await sync({...sub,current_period_start:'2099-01-01T00:00:00Z',current_period_end:'2100-01-01T00:00:00Z'},'live',103);
 expect((await db.query<{status:string}>("SELECT status FROM subscriptions WHERE stripe_subscription_id='sub_one'")).rows[0].status).toBe('active');
 await db.exec("UPDATE download_quota SET pro_until='2200-01-01'"); await sync({...sub,stripe_subscription_id:'sub_two',status:'unpaid'},'live',104);
 await sync({...sub,status:'unpaid',current_period_start:'2099-01-01',current_period_end:'2100-01-01'},'live',105); expect(await plan()).toBe('pro');
});
const team={...sub,team_id:T,stripe_subscription_id:'sub_team',seat_count:3};
const ts=(s:object,n:number,e='sandbox')=>db.query('SELECT sync_team_subscription_event($1,$2,$3,$4)',[s,e,n,`team${n}`]);
it('team ordered replay and scheduled cancellation preserve paid seats without live quota changes',async()=>{
 await ts(team,100); await ts({...team,status:'canceled'},102); await ts({...team,seat_count:10},101);
 expect((await db.query<{status:string,seat_count:number}>('SELECT status,seat_count FROM teams')).rows[0]).toEqual({status:'active',seat_count:3});
 await expect(ts(team,103,'live')).rejects.toThrow('team_binding_mismatch');
});
it('team refund revokes once; another active team subscription keeps access',async()=>{
 const proof={...invoice,invoice_id:'in_team',team_id:T,stripe_subscription_id:'sub_team',amount_paid:32700,amount_refunded:32700};
 await Promise.all([rec(proof,'sandbox'),rec(proof,'sandbox')]);
 expect((await db.query<{status:string}>('SELECT status FROM teams')).rows[0].status).toBe('canceled');
 await ts({...team,stripe_subscription_id:'sub_team2'},103); await rec(proof,'sandbox');
 expect((await db.query<{status:string}>('SELECT status FROM teams')).rows[0].status).toBe('active');
});
it('invoice-before-subscription refund tombstone prevents later access',async()=>{
 await rec({...invoice,invoice_id:'in_early',stripe_subscription_id:'sub_early',amount_refunded:1290},'sandbox');
 await sync({...sub,stripe_subscription_id:'sub_early'},'sandbox',120);
 expect((await db.query<{status:string}>("SELECT status FROM subscriptions WHERE stripe_subscription_id='sub_early'")).rows[0].status).toBe('refunded');
});