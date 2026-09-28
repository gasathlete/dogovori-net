// @vitest-environment node
/**
 * S12 (targeted shared_links guard) и S15 (подправяне на собственик/път в
 * saved_documents и uploaded_contracts) — поведение преди и след пача върху
 * PGlite с политиките в production вид. Не се докосва жива база.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const FULL = readFileSync("docs/migrations/security_hardening_2026_09_28.sql", "utf8");
const section = (from: string, to: string) => FULL.slice(FULL.indexOf(from), FULL.indexOf(to));
const PATCH = section("-- S12 (high)", "-- S13 (medium)") + section("-- S15 (high)", "-- S14 = S4");

const ALICE = "aaaaaaaa-0000-4000-8000-000000000001";
const BOB = "bbbbbbbb-0000-4000-8000-000000000002";
const MALLORY = "cccccccc-0000-4000-8000-000000000003";
const TEAM = "dddddddd-0000-4000-8000-000000000004";
const BOB_UC = "11111111-0000-4000-8000-000000000001";
const BOB_SD = "22222222-0000-4000-8000-000000000002";
const ALICE_SD = "22222222-0000-4000-8000-000000000003";

const BASE = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
CREATE TABLE public.team_members (team_id uuid, user_id uuid);
INSERT INTO public.team_members VALUES ('${TEAM}', '${BOB}'), ('${TEAM}', '${MALLORY}');
CREATE FUNCTION public.is_team_member(_u uuid, _t uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT EXISTS (SELECT 1 FROM public.team_members WHERE user_id = _u AND team_id = _t) $$;
CREATE TABLE public.uploaded_contracts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, team_id uuid, title text, storage_path text);
CREATE TABLE public.saved_documents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, team_id uuid, title text, payload jsonb DEFAULT '{}');
ALTER TABLE public.uploaded_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY uploaded_contracts_all_own ON public.uploaded_contracts FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.is_team_member(auth.uid(), team_id))
  WITH CHECK (auth.uid() = user_id OR public.is_team_member(auth.uid(), team_id));
CREATE POLICY saved_documents_all_own ON public.saved_documents FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.is_team_member(auth.uid(), team_id))
  WITH CHECK (auth.uid() = user_id OR public.is_team_member(auth.uid(), team_id));
INSERT INTO public.uploaded_contracts VALUES ('${BOB_UC}', '${BOB}', '${TEAM}', 'Боб', '${BOB}/team.pdf');
INSERT INTO public.saved_documents VALUES ('${BOB_SD}', '${BOB}', '${TEAM}', 'Боб', '{"text":"x"}');
INSERT INTO public.saved_documents VALUES ('${ALICE_SD}', '${ALICE}', NULL, 'Алиса', '{}');
CREATE TABLE public.shared_links (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid, uploaded_contract_id uuid, owner_id uuid,
  token text, expires_at timestamptz, viewed_at timestamptz, signed_at timestamptz, signed_signature text, signer_name text,
  signer_ip_hash text, revoked_at timestamptz, created_at timestamptz DEFAULT now(), owner_signed_at timestamptz, owner_signature text,
  owner_signer_name text, signed_pdf_path text, password_hash text, password_salt text, signature_method text, qes_file_path text,
  qes_file_name text, qes_file_mime text, qes_file_size int);
ALTER TABLE public.shared_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY shared_links_select_own ON public.shared_links FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY shared_links_insert_own ON public.shared_links FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY shared_links_update_own ON public.shared_links FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
`;

type Role = "authenticated" | "service_role";
async function fresh(patched: boolean) {
  const db = new PGlite();
  await db.exec(BASE);
  if (patched) await db.exec(PATCH);
  return db;
}
async function as<T = Record<string, unknown>>(db: PGlite, role: Role, uid: string | null, sql: string) {
  return db.transaction(async (tx) => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
    await tx.exec(`SET LOCAL ROLE ${role}`);
    return tx.query<T>(sql);
  });
}
async function fails(p: Promise<unknown>) {
  let err: unknown = null;
  try { await p; } catch (e) { err = e; }
  expect(err, "очакван отказ").not.toBeNull();
}

describe("S15 document owner/path forgery", { timeout: 120_000 }, () => {
  it("reproduces before the patch: team member forges owner + path on INSERT and UPDATE", async () => {
    const db = await fresh(false);
    await as(db, "authenticated", MALLORY,
      `INSERT INTO public.uploaded_contracts (user_id, team_id, title, storage_path) VALUES ('${BOB}', '${TEAM}', 'x', '${BOB}/private.pdf')`);
    await as(db, "authenticated", MALLORY,
      `UPDATE public.uploaded_contracts SET storage_path = '${BOB}/private.pdf' WHERE id = '${BOB_UC}'`);
    await as(db, "authenticated", MALLORY,
      `UPDATE public.saved_documents SET user_id = '${MALLORY}' WHERE id = '${BOB_SD}'`);
    const r = await db.query<{ n: number }>(`SELECT count(*)::int n FROM public.uploaded_contracts WHERE storage_path = '${BOB}/private.pdf'`);
    expect(r.rows[0].n).toBe(2);
  });

  it("denies forgery after the patch", async () => {
    const db = await fresh(true);
    await fails(as(db, "authenticated", MALLORY,
      `INSERT INTO public.uploaded_contracts (user_id, team_id, title, storage_path) VALUES ('${BOB}', '${TEAM}', 'x', '${BOB}/private.pdf')`));
    await fails(as(db, "authenticated", MALLORY,
      `INSERT INTO public.saved_documents (user_id, team_id, title) VALUES ('${BOB}', '${TEAM}', 'x')`));
    await fails(as(db, "authenticated", MALLORY,
      `UPDATE public.uploaded_contracts SET storage_path = '${BOB}/private.pdf' WHERE id = '${BOB_UC}'`));
    await fails(as(db, "authenticated", MALLORY,
      `UPDATE public.uploaded_contracts SET user_id = '${MALLORY}', storage_path = '${MALLORY}/a.pdf' WHERE id = '${BOB_UC}'`));
    await fails(as(db, "authenticated", MALLORY,
      `UPDATE public.saved_documents SET user_id = '${MALLORY}' WHERE id = '${BOB_SD}'`));
    await fails(as(db, "authenticated", MALLORY,
      `UPDATE public.saved_documents SET payload = '{"text":"x","storage_path":"${BOB}/private.pdf"}' WHERE id = '${BOB_SD}'`));
    // Traversal/foreign prefix even for own rows.
    await fails(as(db, "authenticated", ALICE,
      `INSERT INTO public.uploaded_contracts (user_id, title, storage_path) VALUES ('${ALICE}', 'x', '${ALICE}/../${BOB}/p.pdf')`));
    await fails(as(db, "authenticated", ALICE,
      `UPDATE public.saved_documents SET payload = '{"storage_path":"${BOB}/p.pdf"}' WHERE id = '${ALICE_SD}'`));
    const r = await db.query<{ p: string }>(`SELECT storage_path p FROM public.uploaded_contracts WHERE id = '${BOB_UC}'`);
    expect(r.rows[0].p).toBe(`${BOB}/team.pdf`);
  });

  it("keeps legitimate own creates, own pointer changes, team metadata edits and service role", async () => {
    const db = await fresh(true);
    await as(db, "authenticated", ALICE,
      `INSERT INTO public.uploaded_contracts (user_id, title, storage_path) VALUES ('${ALICE}', 'мой', '${ALICE}/a.pdf')`);
    await as(db, "authenticated", MALLORY,
      `INSERT INTO public.uploaded_contracts (user_id, team_id, title, storage_path) VALUES ('${MALLORY}', '${TEAM}', 'екипен', '${MALLORY}/t.pdf')`);
    await as(db, "authenticated", ALICE,
      `UPDATE public.saved_documents SET payload = '{"storage_path":"${ALICE}/b.pdf"}' WHERE id = '${ALICE_SD}'`);
    const upd = await as(db, "authenticated", MALLORY,
      `UPDATE public.uploaded_contracts SET title = 'Преименуван от екипа' WHERE id = '${BOB_UC}' RETURNING id`);
    expect(upd.rows.length).toBe(1);
    await as(db, "authenticated", MALLORY, `UPDATE public.saved_documents SET title = 'Ново' WHERE id = '${BOB_SD}'`);
    await as(db, "authenticated", BOB, `UPDATE public.uploaded_contracts SET storage_path = '${BOB}/v2.pdf' WHERE id = '${BOB_UC}'`);
    await as(db, "service_role", null,
      `INSERT INTO public.uploaded_contracts (user_id, title, storage_path) VALUES ('${BOB}', 'сървър', '${BOB}/s.pdf')`);
  });
});

describe("S12 targeted shared_links guard (no blanket revocation)", { timeout: 120_000 }, () => {
  it("keeps client create, owner-sign once and revoke once; blocks server-only columns and foreign targets", async () => {
    const db = await fresh(true);
    expect(PATCH).not.toMatch(/REVOKE\s+INSERT[^;]*shared_links/i);
    expect(PATCH).not.toMatch(/DROP POLICY[^;]*shared_links_insert_own/i);
    const created = await as<{ id: string }>(db, "authenticated", ALICE,
      `INSERT INTO public.shared_links (owner_id, document_id, token) VALUES ('${ALICE}', '${ALICE_SD}', 'tok-alice') RETURNING id`);
    const id = created.rows[0].id;
    await fails(as(db, "authenticated", ALICE,
      `INSERT INTO public.shared_links (owner_id, document_id, token) VALUES ('${ALICE}', '${BOB_SD}', 'evil')`));
    await fails(as(db, "authenticated", ALICE,
      `INSERT INTO public.shared_links (owner_id, document_id, token, signed_at, signer_name) VALUES ('${ALICE}', '${ALICE_SD}', 'forged', now(), 'Боб')`));
    for (const set of ["signed_at = now()", "signer_name = 'Боб'", `signed_pdf_path = '${BOB}/x.pdf'`, "token = 'x'", "qes_file_path = 'q'", "document_id = NULL"]) {
      await fails(as(db, "authenticated", ALICE, `UPDATE public.shared_links SET ${set} WHERE id = '${id}'`));
    }
    await as(db, "authenticated", ALICE,
      `UPDATE public.shared_links SET owner_signed_at = now(), owner_signature = 'data:image/png;base64,AA', owner_signer_name = 'Алиса' WHERE id = '${id}'`);
    await fails(as(db, "authenticated", ALICE, `UPDATE public.shared_links SET owner_signer_name = 'друг' WHERE id = '${id}'`));
    await as(db, "authenticated", ALICE, `UPDATE public.shared_links SET revoked_at = now() WHERE id = '${id}'`);
    await fails(as(db, "authenticated", ALICE, `UPDATE public.shared_links SET revoked_at = NULL WHERE id = '${id}'`));
    // Service role (sign-shared-document / get-shared-document) keeps full capability.
    await as(db, "service_role", null, `UPDATE public.shared_links SET signed_at = now(), viewed_at = now(), signer_name = 'Боб' WHERE id = '${id}'`);
    await as(db, "service_role", null,
      `INSERT INTO public.shared_links (owner_id, document_id, token) VALUES ('${BOB}', '${BOB_SD}', 'svc')`);
  });

  it("S12+S15 sections are idempotent", async () => {
    const db = await fresh(true);
    await db.exec(PATCH);
  });
});
