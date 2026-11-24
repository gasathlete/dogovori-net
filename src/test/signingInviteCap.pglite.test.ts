// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const OWNER = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER = "bbbbbbbb-0000-4000-8000-000000000002";

async function setup() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS;
    CREATE TYPE signing_order_mode AS ENUM ('sequential','parallel');
    CREATE TYPE signing_status AS ENUM ('draft','pending','in_progress','completed','cancelled','expired','declined');
    CREATE TABLE signing_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL, team_id uuid,
      saved_document_id uuid, uploaded_contract_id uuid, title text NOT NULL, document_snapshot jsonb, metadata jsonb,
      order_mode signing_order_mode NOT NULL, expires_at timestamptz, status signing_status, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE signing_request_signers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES signing_requests(id),
      name text, email text, role text, order_idx int, sign_token text);`);
  await db.exec(readFileSync("drizzle/migrations/0037_atomic_signing_invite_cap.sql", "utf8").replace(/--> statement-breakpoint/g, ""));
  return db;
}
const signers = (n: number) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ name: `S${i}`, email: `s${i}@example.test`, order_idx: i, sign_token: `t${i}` })));
const req = JSON.stringify({ title: "Синтетичен", document_snapshot: {}, order_mode: "parallel", expires_at: new Date(Date.now() + 864e5).toISOString() });
const call = (db: PGlite, owner: string, n: number) =>
  db.query<{ r: { ok: boolean; error?: string } }>("SELECT public.create_signing_envelope_capped($1,$2::jsonb,$3::jsonb,50) r", [owner, req, signers(n)]).then(x => x.rows[0].r);
const total = async (db: PGlite, owner: string) =>
  (await db.query<{ c: number }>("SELECT count(*)::int c FROM signing_request_signers s JOIN signing_requests r ON r.id=s.request_id WHERE r.owner_id=$1", [owner])).rows[0].c;

it("parallel invitation requests around the limit never exceed 50 per owner", async () => {
  const db = await setup();
  try {
    expect((await call(db, OWNER, 40)).ok).toBe(true);
    const results = await Promise.all([call(db, OWNER, 6), call(db, OWNER, 6), call(db, OWNER, 6), call(db, OWNER, 4)]);
    expect(await total(db, OWNER)).toBeLessThanOrEqual(50);
    expect(results.filter(r => r.ok === false).every(r => r.error === "daily_invite_limit")).toBe(true);
    expect(results.some(r => r.ok === false)).toBe(true);
    // Exactly at the limit is allowed, one more is refused, and refusals write nothing.
    const db2 = await setup();
    try {
      expect((await call(db2, OWNER, 49)).ok).toBe(true);
      expect((await call(db2, OWNER, 1)).ok).toBe(true);
      expect(await call(db2, OWNER, 1)).toMatchObject({ ok: false, error: "daily_invite_limit" });
      expect(await total(db2, OWNER)).toBe(50);
      expect((await call(db2, OTHER, 50)).ok).toBe(true); // limit is per account
      // Invitations older than 24h no longer count.
      await db2.exec("UPDATE signing_requests SET created_at = now() - interval '25 hours' WHERE owner_id='" + OWNER + "'");
      expect((await call(db2, OWNER, 1)).ok).toBe(true);
    } finally { await db2.close(); }
  } finally { await db.close(); }
}, 30000);

it("only the service role may run the capped operation", async () => {
  const db = await setup();
  try {
    for (const role of ["anon", "authenticated"]) {
      await expect(db.transaction(async tx => { await tx.exec(`SET LOCAL ROLE ${role}`); await tx.query("SELECT public.create_signing_envelope_capped($1,$2::jsonb,$3::jsonb,50)", [OWNER, req, signers(1)]); })).rejects.toThrow(/permission denied/);
    }
  } finally { await db.close(); }
}, 30000);
