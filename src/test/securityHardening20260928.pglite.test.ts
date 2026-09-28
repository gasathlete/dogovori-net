// @vitest-environment node
/**
 * Поведенчески тестове за docs/migrations/security_hardening_2026_09_28.sql
 * върху истински PostgreSQL (PGlite) с минимални синтетични таблици и
 * политиките в текущия production вид. Не се докосва жива база.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const PATCH = readFileSync("docs/migrations/security_hardening_2026_09_28.sql", "utf8");

const ALICE = "aaaaaaaa-0000-4000-8000-000000000001";
const BOB = "bbbbbbbb-0000-4000-8000-000000000002";
const STAFF = "cccccccc-0000-4000-8000-000000000003";
const TEAM = "dddddddd-0000-4000-8000-000000000004";
const REQ = "eeeeeeee-0000-4000-8000-000000000005";
const SIGNER = "ffffffff-0000-4000-8000-000000000006";

// Production-like state before the patch (policies copied from pg_policies).
const BASE = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
CREATE TABLE public.user_roles (user_id uuid, role text);
INSERT INTO public.user_roles VALUES ('${STAFF}', 'admin');
CREATE FUNCTION public.is_staff(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','moderator')) $$;

CREATE TABLE public.quota_session_charges (id uuid DEFAULT gen_random_uuid(), user_id uuid, session_id text, doc_key text, kind text, created_at timestamptz DEFAULT now());
CREATE TABLE public.corrections_batch_charges (id uuid DEFAULT gen_random_uuid(), user_id uuid, session_id text, batch_id text, ops_charged int, created_at timestamptz DEFAULT now());
ALTER TABLE public.quota_session_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corrections_batch_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY qsc_select_own ON public.quota_session_charges FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY qsc_insert_own ON public.quota_session_charges FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY cbc_insert_own ON public.corrections_batch_charges FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
-- Simplified server-side charge function with the same "existing row = paid" rule.
CREATE FUNCTION public.consume_quota_session(_session_id text, _doc_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.quota_session_charges WHERE user_id = auth.uid() AND session_id = _session_id AND doc_key = _doc_key) THEN
    RETURN jsonb_build_object('charged', false);
  END IF;
  INSERT INTO public.quota_session_charges (user_id, session_id, doc_key, kind) VALUES (auth.uid(), _session_id, _doc_key, 'contract');
  RETURN jsonb_build_object('charged', true);
END $$;

CREATE TYPE public.signing_status AS ENUM ('draft','pending','in_progress','completed','cancelled','expired','declined');
CREATE TABLE public.signing_requests (id uuid PRIMARY KEY, owner_id uuid, team_id uuid, title text, document_snapshot text,
  status public.signing_status, completed_at timestamptz, cancelled_at timestamptz, updated_at timestamptz);
CREATE TABLE public.signing_request_signers (id uuid PRIMARY KEY, request_id uuid, email text, name text, role text, order_idx int,
  status text, sign_token text, otp_code_hash text, otp_expires_at timestamptz, otp_attempts int, notified_at timestamptz,
  viewed_at timestamptz, signed_at timestamptz, declined_at timestamptz, decline_reason text, signature_data_url text,
  signature_name text, signer_ip_hash text, signer_user_agent text, created_at timestamptz, updated_at timestamptz,
  signer_eik text, signer_capacity text, representative_declaration text, ses_equivalence_accepted boolean,
  ses_equivalence_text_version text, document_hash_at_sign text, signature_method text, qes_file_path text,
  qes_file_name text, qes_file_size int, qes_file_mime text);
ALTER TABLE public.signing_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signing_request_signers ENABLE ROW LEVEL SECURITY;
CREATE POLICY sr_select ON public.signing_requests FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY signing_requests_update_own ON public.signing_requests FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY ss_select ON public.signing_request_signers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.signing_requests r WHERE r.id = request_id AND r.owner_id = auth.uid()));
CREATE POLICY signing_signers_update_via_request ON public.signing_request_signers FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.signing_requests r WHERE r.id = request_id AND r.owner_id = auth.uid()));
INSERT INTO public.signing_requests VALUES ('${REQ}', '${ALICE}', NULL, 't', 'snapshot', 'pending', NULL, NULL, now());
INSERT INTO public.signing_request_signers (id, request_id, email, status, sign_token, otp_code_hash)
  VALUES ('${SIGNER}', '${REQ}', 'bob@example.test', 'otp_sent', 'tok', 'hash');

CREATE TABLE public.teams (id uuid PRIMARY KEY, name text, owner_id uuid, stripe_subscription_id text, stripe_customer_id text,
  seat_count int, logo_url text, brand_color text, vat_data jsonb, status text, environment text, current_period_start timestamptz,
  current_period_end timestamptz, created_at timestamptz, updated_at timestamptz, letterhead_enabled boolean,
  signature_data_url text, signature_name text, company_eik text, company_vat text, company_address text, company_mol text,
  company_email text, company_phone text, company_website text, eu_only_ai boolean, sso_config jsonb);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY teams_select ON public.teams FOR SELECT TO authenticated USING (true);
CREATE POLICY teams_update_admin ON public.teams FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
INSERT INTO public.teams (id, owner_id, seat_count, status) VALUES ('${TEAM}', '${ALICE}', 3, 'active');

CREATE TABLE public.team_members (id uuid DEFAULT gen_random_uuid(), team_id uuid, user_id uuid, role text, invited_at timestamptz, joined_at timestamptz);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_members_admin_manage ON public.team_members FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.owner_id = auth.uid()));

CREATE TABLE public.profiles (id uuid PRIMARY KEY, display_name text, company text, vat_number text, avatar_url text,
  created_at timestamptz, updated_at timestamptz, signature_data_url text, signature_name text, allow_third_country_ai boolean,
  assistant_messages_used int DEFAULT 0, assistant_quota_reset_at timestamptz, tutorial_seen_at timestamptz,
  plan_welcome_seen_at timestamptz, plan_welcome_plan text);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING (auth.uid() = id);
INSERT INTO public.profiles (id, assistant_messages_used) VALUES ('${ALICE}', 40), ('${BOB}', 0);

CREATE TABLE public.user_consents (id uuid DEFAULT gen_random_uuid(), user_id uuid, consent_type text, document_version text,
  granted boolean, granted_at timestamptz DEFAULT now(), revoked_at timestamptz, metadata jsonb);
ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY uc_select ON public.user_consents FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY user_consents_insert_own ON public.user_consents FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_consents_update_own ON public.user_consents FOR UPDATE TO authenticated USING (auth.uid() = user_id);
INSERT INTO public.user_consents (user_id, consent_type, document_version, granted) VALUES ('${ALICE}', 'terms', 'v1', true);

CREATE TABLE public.legal_sources (id uuid PRIMARY KEY, active boolean);
CREATE TABLE public.legal_documents (id uuid DEFAULT gen_random_uuid(), source_id uuid, raw_text text);
CREATE TABLE public.legal_versions (id uuid DEFAULT gen_random_uuid(), doc_key text, published_at timestamptz);
ALTER TABLE public.legal_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY ls_read ON public.legal_sources FOR SELECT USING (true);
CREATE POLICY "legal_documents public read" ON public.legal_documents FOR SELECT USING (true);
CREATE POLICY legal_versions_public_read ON public.legal_versions FOR SELECT TO anon, authenticated USING (true);
INSERT INTO public.legal_sources VALUES ('11111111-0000-4000-8000-000000000001', true), ('11111111-0000-4000-8000-000000000002', false);
INSERT INTO public.legal_documents (source_id, raw_text) VALUES ('11111111-0000-4000-8000-000000000001', 'ЗЗД'), ('11111111-0000-4000-8000-000000000002', 'чернова');
INSERT INTO public.legal_versions (doc_key, published_at) VALUES ('terms', now() - interval '1 day'), ('terms', NULL), ('terms', now() + interval '10 days');

CREATE FUNCTION public.cleanup_anonymous_drafts() RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ SELECT 0 $$;
CREATE FUNCTION public.verify_cron_secret(_secret text) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT false $$;
CREATE FUNCTION public.admin_list_users(_search text, _limit int) RETURNS int LANGUAGE sql SECURITY DEFINER AS $$ SELECT 0 $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
`;

type Role = "anon" | "authenticated" | "service_role";

async function fresh(patched: boolean) {
  const db = new PGlite();
  await db.exec(BASE);
  if (patched) await db.exec(PATCH);
  return db;
}

async function as<T = Record<string, unknown>>(db: PGlite, role: Role, uid: string | null, sql: string) {
  return db.transaction(async (tx) => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
    await tx.query(`SELECT set_config('request.jwt.claim.role', $1, true)`, [role]);
    await tx.exec(`SET LOCAL ROLE ${role}`);
    return tx.query<T>(sql);
  });
}

async function fails(p: Promise<unknown>) {
  let err: unknown = null;
  try { await p; } catch (e) { err = e; }
  expect(err, "очакван отказ").not.toBeNull();
}

describe("security hardening 2026-09-28", { timeout: 120_000 }, () => {
  it("S1 reproduces: self-inserted charge row makes the next download free", async () => {
    const db = await fresh(false);
    await as(db, "authenticated", ALICE,
      `INSERT INTO public.quota_session_charges (user_id, session_id, doc_key, kind) VALUES ('${ALICE}', 's1', 'doc', 'contract')`);
    const r = await as<{ r: { charged: boolean } }>(db, "authenticated", ALICE, `SELECT public.consume_quota_session('s1','doc') AS r`);
    expect(r.rows[0].r.charged).toBe(false);
  });

  it("S1 fixed: clients cannot write ledgers; real charge still works and replays free", async () => {
    const db = await fresh(true);
    await fails(as(db, "authenticated", ALICE,
      `INSERT INTO public.quota_session_charges (user_id, session_id, doc_key, kind) VALUES ('${ALICE}', 's1', 'doc', 'contract')`));
    await fails(as(db, "authenticated", ALICE,
      `INSERT INTO public.corrections_batch_charges (user_id, session_id, batch_id, ops_charged) VALUES ('${ALICE}', 's1', 'b', 0)`));
    await fails(as(db, "anon", null,
      `INSERT INTO public.quota_session_charges (user_id, session_id, doc_key, kind) VALUES (NULL, 's1', 'doc', 'contract')`));
    const first = await as<{ r: { charged: boolean } }>(db, "authenticated", ALICE, `SELECT public.consume_quota_session('s1','doc') AS r`);
    expect(first.rows[0].r.charged).toBe(true);
    const again = await as<{ r: { charged: boolean } }>(db, "authenticated", ALICE, `SELECT public.consume_quota_session('s1','doc') AS r`);
    expect(again.rows[0].r.charged).toBe(false);
    const own = await as(db, "authenticated", ALICE, `SELECT id FROM public.quota_session_charges`);
    expect(own.rows.length).toBe(1);
    const foreign = await as(db, "authenticated", BOB, `SELECT id FROM public.quota_session_charges`);
    expect(foreign.rows.length).toBe(0);
  });

  it("S2 reproduces: envelope owner reads OTP hash and marks the signer as signed", async () => {
    const db = await fresh(false);
    const r = await as<{ otp_code_hash: string }>(db, "authenticated", ALICE, `SELECT otp_code_hash FROM public.signing_request_signers`);
    expect(r.rows[0].otp_code_hash).toBe("hash");
    await as(db, "authenticated", ALICE, `UPDATE public.signing_request_signers SET status = 'signed', signed_at = now()`);
    const s = await db.query<{ status: string }>(`SELECT status FROM public.signing_request_signers`);
    expect(s.rows[0].status).toBe("signed");
  });

  it("S2 fixed: owner sees safe columns only, cannot forge signer state or complete envelope", async () => {
    const db = await fresh(true);
    await fails(as(db, "authenticated", ALICE, `SELECT otp_code_hash FROM public.signing_request_signers`));
    await fails(as(db, "authenticated", ALICE, `SELECT * FROM public.signing_request_signers`));
    const safe = await as(db, "authenticated", ALICE, `SELECT id, status, sign_token FROM public.signing_request_signers`);
    expect(safe.rows.length).toBe(1);
    const other = await as(db, "authenticated", BOB, `SELECT id FROM public.signing_request_signers`);
    expect(other.rows.length).toBe(0);
    await fails(as(db, "authenticated", ALICE, `UPDATE public.signing_request_signers SET status = 'signed'`));
    await fails(as(db, "authenticated", ALICE, `UPDATE public.signing_requests SET status = 'completed'`));
    await fails(as(db, "authenticated", ALICE, `UPDATE public.signing_requests SET document_snapshot = 'x'`));
    // Legitimate cancel still works for the owner only.
    const bob = await as(db, "authenticated", BOB, `UPDATE public.signing_requests SET status = 'cancelled', cancelled_at = now() RETURNING id`);
    expect(bob.rows.length).toBe(0);
    const ok = await as(db, "authenticated", ALICE, `UPDATE public.signing_requests SET status = 'cancelled', cancelled_at = now() RETURNING id`);
    expect(ok.rows.length).toBe(1);
    // Cancelled cannot be reopened; service role remains able to maintain.
    await fails(as(db, "authenticated", ALICE, `UPDATE public.signing_requests SET status = 'pending'`));
    await as(db, "service_role", null, `UPDATE public.signing_request_signers SET status = 'signed'`);
  });

  it("S3 fixed: team admin edits branding but not billing, membership is server-only", async () => {
    const db = await fresh(true);
    await fails(as(db, "authenticated", ALICE, `UPDATE public.teams SET seat_count = 999`));
    await fails(as(db, "authenticated", ALICE, `UPDATE public.teams SET status = 'active', current_period_end = now() + interval '10 years'`));
    await fails(as(db, "authenticated", ALICE, `UPDATE public.teams SET owner_id = '${BOB}'`));
    const ok = await as(db, "authenticated", ALICE, `UPDATE public.teams SET logo_url = 'l', company_eik = '123' RETURNING id`);
    expect(ok.rows.length).toBe(1);
    const bob = await as(db, "authenticated", BOB, `UPDATE public.teams SET logo_url = 'x' RETURNING id`);
    expect(bob.rows.length).toBe(0);
    await fails(as(db, "authenticated", ALICE,
      `INSERT INTO public.team_members (team_id, user_id, role) VALUES ('${TEAM}', '${BOB}', 'owner')`));
  });

  it("S4/S5 fixed: quota counters and consent evidence are not client-writable", async () => {
    const db = await fresh(true);
    await fails(as(db, "authenticated", ALICE, `UPDATE public.profiles SET assistant_messages_used = 0`));
    const ok = await as(db, "authenticated", ALICE, `UPDATE public.profiles SET display_name = 'А' RETURNING id`);
    expect(ok.rows.length).toBe(1);
    const foreign = await as(db, "authenticated", ALICE, `UPDATE public.profiles SET display_name = 'X' WHERE id = '${BOB}' RETURNING id`);
    expect(foreign.rows.length).toBe(0);
    await fails(as(db, "authenticated", ALICE, `UPDATE public.user_consents SET granted_at = now() - interval '1 year'`));
    const ins = await as(db, "authenticated", ALICE,
      `INSERT INTO public.user_consents (user_id, consent_type, document_version, granted) VALUES ('${ALICE}', 'terms', 'v1', false) RETURNING id`);
    expect(ins.rows.length).toBe(1);
    await fails(as(db, "authenticated", ALICE,
      `INSERT INTO public.user_consents (user_id, consent_type, document_version, granted) VALUES ('${BOB}', 'terms', 'v1', true)`));
  });

  it("S6 fixed: is_staff answers only for self or service role", async () => {
    const before = await fresh(false);
    const leak = await as<{ ok: boolean }>(before, "anon", null, `SELECT public.is_staff('${STAFF}') AS ok`);
    expect(leak.rows[0].ok).toBe(true);
    const db = await fresh(true);
    expect((await as<{ ok: boolean }>(db, "anon", null, `SELECT public.is_staff('${STAFF}') AS ok`)).rows[0].ok).toBe(false);
    expect((await as<{ ok: boolean }>(db, "authenticated", ALICE, `SELECT public.is_staff('${STAFF}') AS ok`)).rows[0].ok).toBe(false);
    expect((await as<{ ok: boolean }>(db, "authenticated", STAFF, `SELECT public.is_staff('${STAFF}') AS ok`)).rows[0].ok).toBe(true);
    expect((await as<{ ok: boolean }>(db, "service_role", null, `SELECT public.is_staff('${STAFF}') AS ok`)).rows[0].ok).toBe(true);
    expect((await as<{ ok: boolean }>(db, "authenticated", ALICE, `SELECT public.is_staff('${ALICE}') AS ok`)).rows[0].ok).toBe(false);
  });

  it("S7 fixed: maintenance/oracle functions are service-only, admin RPCs need sign-in", async () => {
    const db = await fresh(true);
    const priv = async (role: string, fn: string) =>
      (await db.query<{ ok: boolean }>(`SELECT has_function_privilege('${role}', '${fn}', 'EXECUTE') AS ok`)).rows[0].ok;
    expect(await priv("anon", "public.cleanup_anonymous_drafts()")).toBe(false);
    expect(await priv("authenticated", "public.cleanup_anonymous_drafts()")).toBe(false);
    expect(await priv("service_role", "public.cleanup_anonymous_drafts()")).toBe(true);
    expect(await priv("anon", "public.verify_cron_secret(text)")).toBe(false);
    expect(await priv("authenticated", "public.verify_cron_secret(text)")).toBe(false);
    expect(await priv("anon", "public.admin_list_users(text, integer)")).toBe(false);
    expect(await priv("authenticated", "public.admin_list_users(text, integer)")).toBe(true);
  });

  it("S8 fixed: legal texts stay public but only active sources / published versions", async () => {
    const db = await fresh(true);
    const docs = await as<{ raw_text: string }>(db, "anon", null, `SELECT raw_text FROM public.legal_documents`);
    expect(docs.rows.map((r) => r.raw_text)).toEqual(["ЗЗД"]);
    const staffDocs = await as(db, "authenticated", STAFF, `SELECT raw_text FROM public.legal_documents`);
    expect(staffDocs.rows.length).toBe(2);
    const versions = await as(db, "anon", null, `SELECT id FROM public.legal_versions`);
    expect(versions.rows.length).toBe(1);
  });

  it("patch is idempotent", async () => {
    const db = await fresh(true);
    await db.exec(PATCH);
  });
});
