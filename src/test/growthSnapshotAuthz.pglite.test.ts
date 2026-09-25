// @vitest-environment node
/**
 * growth_snapshot: SECURITY DEFINER с проверка по current_user (винаги
 * собственика) пропуска всеки. Истински PostgreSQL (PGlite), синтетични
 * празни таблици; живата функция НЕ се извиква и бизнес данни не се четат.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const FIX = readFileSync("docs/migrations/0048_growth_snapshot_authz.sql", "utf8");
const SRC = readFileSync("supabase/migrations/20260811215209_bc8f22db-519e-453c-acb0-002eec899f82.sql", "utf8")
  .split("\n");
// Точната уязвима дефиниция от изходната миграция (редове 35–247).
const VULN = SRC.slice(34, 247).join("\n");

const STAFF = "cccccccc-0000-4000-8000-000000000001";
const USER = "cccccccc-0000-4000-8000-000000000002";

const BASE = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO anon, authenticated, service_role;
CREATE TABLE public.user_roles (user_id uuid, role text);
INSERT INTO public.user_roles VALUES ('${STAFF}', 'admin');
CREATE FUNCTION public.is_staff(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role IN ('admin','moderator')) $$;
CREATE TABLE public.page_views (created_at timestamptz, event text, visitor_day_hash text, session_id text, path text, utm_source text, referrer_host text);
CREATE TABLE public.profiles (created_at timestamptz);
CREATE TABLE public.subscriptions (created_at timestamptz, status text);
CREATE TABLE public.saved_documents (created_at timestamptz);
CREATE TABLE public.uploaded_contracts (created_at timestamptz);
CREATE TABLE public.quota_session_charges (created_at timestamptz);
CREATE TABLE public.topup_purchases (created_at timestamptz, ops_added int, amount_eur numeric);
CREATE TABLE public.funnel_events (created_at timestamptz, name text, props jsonb, session_id text);
CREATE TABLE public.signing_requests (created_at timestamptz, status text);
CREATE TABLE public.feedback_submissions (created_at timestamptz, category text, rating int);
`;

async function fresh(sql: string) {
  const db = new PGlite();
  await db.exec(BASE);
  await db.exec(sql);
  return db;
}
async function call(db: PGlite, role: "anon" | "authenticated" | "service_role", claimRole: string | null, uid: string | null) {
  return db.transaction(async (tx) => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
    await tx.query(`SELECT set_config('request.jwt.claim.role', $1, true)`, [claimRole ?? ""]);
    await tx.exec(`SET LOCAL ROLE ${role}`);
    return tx.query(`SELECT public.growth_snapshot(now() - interval '1 day', now()) AS s`);
  });
}
async function denied(p: Promise<unknown>) {
  let err: unknown = null;
  try { await p; } catch (e) { err = e; }
  expect(err, "очакван отказ").not.toBeNull();
}

describe("growth_snapshot authz", { timeout: 60_000 }, () => {
  it("УЯЗВИМА версия: обикновен authenticated (не-staff) получава снимка", async () => {
    const db = await fresh(VULN);
    const r = await call(db, "authenticated", "authenticated", USER);
    expect(r.rows.length).toBe(1);
  });

  it("ПОПРАВЕНА: обикновен потребител, anon, липсваща роля и липсващ uid са отказани", async () => {
    const db = await fresh(FIX);
    await denied(call(db, "authenticated", "authenticated", USER));
    await denied(call(db, "anon", "anon", null));
    await denied(call(db, "authenticated", null, USER)); // липсва auth.role()
    await denied(call(db, "authenticated", "authenticated", null)); // липсва auth.uid()
    await denied(call(db, "authenticated", "", STAFF)); // празна роля
  });

  it("ПОПРАВЕНА: anon няма EXECUTE", async () => {
    const db = await fresh(FIX);
    const r = await db.query<{ ok: boolean }>(
      `SELECT has_function_privilege('anon', 'public.growth_snapshot(timestamptz, timestamptz)', 'EXECUTE') AS ok`);
    expect(r.rows[0].ok).toBe(false);
  });

  it("ПОПРАВЕНА: staff и service_role получават снимка", async () => {
    const db = await fresh(FIX);
    expect((await call(db, "authenticated", "authenticated", STAFF)).rows.length).toBe(1);
    expect((await call(db, "service_role", "service_role", null)).rows.length).toBe(1);
  });

  it("ПОПРАВЕНА: тялото е същото освен проверката и search_path", async () => {
    const strip = (s: string) => s.replace(/  IF NOT \([\s\S]*?END IF;/, "").replace(/SET search_path[^\n]*/, "");
    const fixedBody = FIX.slice(FIX.indexOf("CREATE OR REPLACE FUNCTION"), FIX.indexOf("$function$;") + 11);
    const origBody = VULN.slice(0, VULN.indexOf("$function$;") + 11);
    expect(strip(fixedBody).replace(/\s+--[^\n]*/g, "")).toBe(strip(origBody));
  });
});
