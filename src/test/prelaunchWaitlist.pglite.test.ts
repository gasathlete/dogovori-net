// @vitest-environment node
/**
 * Изпълним SQL тест за docs/migrations/stage_prelaunch_waitlist.sql върху
 * истински PostgreSQL (PGlite, в паметта). Само синтетични имейли; никаква
 * връзка към свързана база. Миграцията НЕ е приложена никъде.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const MIGRATION = readFileSync("docs/migrations/stage_prelaunch_waitlist.sql", "utf8");
const V = "prelaunch_waitlist_v1";
const U1 = "cccccccc-0000-4000-8000-000000000001";

const BASE = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
  $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO anon, authenticated, service_role;
`;

async function fresh() {
  const db = new PGlite();
  await db.exec(BASE);
  await db.exec(MIGRATION);
  return db;
}

async function as<T = Record<string, unknown>>(
  db: PGlite,
  role: "anon" | "authenticated" | "service_role",
  sql: string,
  params: unknown[] = [],
  claims: { sub?: string; email?: string } = {},
) {
  return db.transaction(async (tx) => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [claims.sub ?? ""]);
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await tx.exec(`SET LOCAL ROLE ${role}`);
    return tx.query<T>(sql, params);
  });
}

const request = async (db: PGlite, email: string, feature = "assistant", consent: unknown = true, version: unknown = V) =>
  (await as<{ ok: boolean }>(db, "anon",
    `SELECT public.request_prelaunch_waitlist($1, $2, $3, $4) AS ok`, [email, feature, consent, version])).rows[0].ok;

async function configure(db: PGlite, cfg: { enabled?: boolean; days?: number | null; ref?: string | null; max?: number } = {}) {
  await as(db, "service_role",
    `INSERT INTO public.prelaunch_waitlist_config (id, enabled, retention_days, approval_ref, max_per_window)
     VALUES (true, $1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET enabled = EXCLUDED.enabled, retention_days = EXCLUDED.retention_days,
       approval_ref = EXCLUDED.approval_ref, max_per_window = EXCLUDED.max_per_window`,
    [cfg.enabled ?? true, cfg.days === undefined ? 30 : cfg.days, cfg.ref === undefined ? "review-synthetic-1" : cfg.ref, cfg.max ?? 200]);
}

const rows = async (db: PGlite) =>
  (await as<{ email: string; feature: string; consent_at: string; retention_until: string; consent_version: string }>(
    db, "service_role", `SELECT email, feature, consent_at::text, retention_until::text, consent_version FROM public.prelaunch_waitlist ORDER BY email, feature`)).rows;

async function denied(p: Promise<unknown>) {
  await expect(p).rejects.toThrow(/permission denied|violates/i);
}

describe("неконфигурирано = затворено", { timeout: 60_000 }, () => {
  it("без ред в конфигурацията, изключено или без срок/одобрение: false и нищо не се записва", async () => {
    const db = await fresh();
    expect(await request(db, "a@example.test")).toBe(false);
    await configure(db, { enabled: false });
    expect(await request(db, "a@example.test")).toBe(false);
    await configure(db, { days: null });
    expect(await request(db, "a@example.test")).toBe(false);
    await configure(db, { ref: null });
    expect(await request(db, "a@example.test")).toBe(false);
    expect(await rows(db)).toHaveLength(0);
  });
  it("anon/authenticated не могат да четат, пишат или конфигурират", async () => {
    const db = await fresh();
    await denied(as(db, "anon", `SELECT * FROM public.prelaunch_waitlist`));
    await denied(as(db, "authenticated", `SELECT * FROM public.prelaunch_waitlist`, [], { sub: U1 }));
    await denied(as(db, "anon", `INSERT INTO public.prelaunch_waitlist_config (id, enabled, retention_days, approval_ref) VALUES (true, true, 30, 'x')`));
    await denied(as(db, "authenticated", `SELECT * FROM public.prelaunch_waitlist_config`, [], { sub: U1 }));
    await denied(as(db, "anon", `SELECT * FROM public.prelaunch_waitlist_admission`));
    await denied(as(db, "anon", `SELECT public.withdraw_prelaunch_waitlist('a@example.test')`));
    await denied(as(db, "authenticated", `SELECT public.purge_expired_prelaunch_waitlist()`, [], { sub: U1 }));
    await denied(as(db, "anon", `SELECT public.withdraw_my_prelaunch_waitlist()`));
  });
});

describe("валидиране", { timeout: 60_000 }, () => {
  it("само точната версия, истинско съгласие, валиден имейл и позната функция", async () => {
    const db = await fresh();
    await configure(db);
    expect(await request(db, "a@example.test", "assistant", false)).toBe(false);
    expect(await request(db, "a@example.test", "assistant", null)).toBe(false);
    expect(await request(db, "a@example.test", "assistant", true, "prelaunch_waitlist_v2")).toBe(false);
    expect(await request(db, "a@example.test", "assistant", true, "anything")).toBe(false);
    expect(await request(db, "not-an-email")).toBe(false);
    expect(await request(db, "a@example.test", "unknown_feature")).toBe(false);
    expect(await rows(db)).toHaveLength(0);
    expect(await request(db, "  Mixed@Example.TEST ")).toBe(true);
    const r = await rows(db);
    expect(r).toHaveLength(1);
    expect(r[0].email).toBe("mixed@example.test");
    expect(r[0].consent_version).toBe(V);
  });
  it("service_role не може да запише ред без краен срок или с чужда версия", async () => {
    const db = await fresh();
    await denied(as(db, "service_role",
      `INSERT INTO public.prelaunch_waitlist (email, feature, consent_version, retention_until) VALUES ('a@example.test','assistant','${V}', NULL)`));
    await denied(as(db, "service_role",
      `INSERT INTO public.prelaunch_waitlist (email, feature, consent_version, retention_until) VALUES ('a@example.test','assistant','v9', now() + interval '1 day')`));
  });
});

describe("срок и идемпотентност", { timeout: 60_000 }, () => {
  it("срокът е сървърно изчислен и краен; повторен опит не опреснява съгласие/срок и не харчи прием", async () => {
    const db = await fresh();
    await configure(db, { days: 30, max: 1 });
    expect(await request(db, "a@example.test")).toBe(true);
    const [first] = await rows(db);
    const diff = (await as<{ d: number }>(db, "service_role",
      `SELECT extract(epoch FROM (retention_until - consent_at))/86400 AS d FROM public.prelaunch_waitlist`)).rows[0].d;
    expect(Number(diff)).toBe(30);
    await configure(db, { days: 365, max: 1 });
    expect(await request(db, "A@example.test")).toBe(true); // таванът е 1, но повторът не харчи прием
    const [again] = await rows(db);
    expect(again.consent_at).toBe(first.consent_at);
    expect(again.retention_until).toBe(first.retention_until);
  });
  it("изтекъл запис не се удължава тихо: ново съгласие с нов срок", async () => {
    const db = await fresh();
    await configure(db, { days: 10 });
    await request(db, "a@example.test");
    await as(db, "service_role",
      `UPDATE public.prelaunch_waitlist SET consent_at = now() - interval '20 days', retention_until = now() - interval '10 days'`);
    expect(await request(db, "a@example.test")).toBe(true);
    const r = await rows(db);
    expect(r).toHaveLength(1);
    expect(new Date(r[0].retention_until).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("ограничен прием", { timeout: 60_000 }, () => {
  it("глобалният таван за прозореца спира нови записи, без да зависи от клиентски данни", async () => {
    const db = await fresh();
    await configure(db, { max: 2 });
    expect(await request(db, "a@example.test")).toBe(true);
    expect(await request(db, "b@example.test")).toBe(true);
    expect(await request(db, "c@example.test")).toBe(false);
    expect((await rows(db)).map((r) => r.email)).toEqual(["a@example.test", "b@example.test"]);
    const adm = (await as<{ admitted: number }>(db, "service_role", `SELECT admitted FROM public.prelaunch_waitlist_admission`)).rows;
    expect(adm).toEqual([{ admitted: 2 }]);
  });
});

describe("оттегляне и изчистване", { timeout: 60_000 }, () => {
  it("собственикът оттегля само имейла от своята сесия; чужд имейл остава", async () => {
    const db = await fresh();
    await configure(db);
    await request(db, "owner@example.test", "assistant");
    await request(db, "owner@example.test", "subscription");
    await request(db, "other@example.test", "assistant");
    const n = (await as<{ n: number }>(db, "authenticated", `SELECT public.withdraw_my_prelaunch_waitlist() AS n`, [],
      { sub: U1, email: "Owner@Example.test" })).rows[0].n;
    expect(n).toBe(2);
    expect((await rows(db)).map((r) => r.email)).toEqual(["other@example.test"]);
    const none = (await as<{ n: number }>(db, "authenticated", `SELECT public.withdraw_my_prelaunch_waitlist() AS n`, [],
      { sub: U1 })).rows[0].n;
    expect(none).toBe(0);
  });
  it("service_role оттегля по имейл и изчиства само изтеклите", async () => {
    const db = await fresh();
    await configure(db);
    await request(db, "a@example.test");
    await request(db, "b@example.test");
    await request(db, "c@example.test");
    await as(db, "service_role",
      `UPDATE public.prelaunch_waitlist SET consent_at = now() - interval '40 days', retention_until = now() - interval '1 day' WHERE email = 'b@example.test'`);
    expect((await as<{ n: number }>(db, "service_role", `SELECT public.purge_expired_prelaunch_waitlist() AS n`)).rows[0].n).toBe(1);
    expect((await as<{ n: number }>(db, "service_role", `SELECT public.withdraw_prelaunch_waitlist(' A@example.test') AS n`)).rows[0].n).toBe(1);
    expect((await rows(db)).map((r) => r.email)).toEqual(["c@example.test"]);
  });
});
