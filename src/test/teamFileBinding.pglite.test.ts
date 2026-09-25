/**
 * Изпълним регресионен тест за team-file RLS уязвимостта върху ИСТИНСКИ
 * PostgreSQL (PGlite, в паметта). Само синтетични данни; никаква връзка към
 * свързана база. Доказва атаката при старите политики и отказа след
 * docs/migrations/stage_team_file_binding.sql.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const MIGRATION = readFileSync("docs/migrations/stage_team_file_binding.sql", "utf8");
const PREFLIGHT = readFileSync("docs/migrations/stage_team_file_binding_preflight.sql", "utf8");

const A = "aaaaaaaa-0000-4000-8000-000000000001"; // жертва, НЕ е в екип T
const M = "aaaaaaaa-0000-4000-8000-000000000002"; // нападател, член на T
const N = "aaaaaaaa-0000-4000-8000-000000000003"; // съотборник в T
const O = "aaaaaaaa-0000-4000-8000-000000000004"; // законен собственик, член на T
const F = "aaaaaaaa-0000-4000-8000-000000000005"; // член на чужд екип U
const T = "bbbbbbbb-0000-4000-8000-000000000001";
const U = "bbbbbbbb-0000-4000-8000-000000000002";

const BASE = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA storage;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth, storage, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
  $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
GRANT EXECUTE ON FUNCTION storage.foldername(text) TO anon, authenticated, service_role;
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL, name text NOT NULL, owner_id text);
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated, service_role;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_contracts_select_own ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'user-contracts' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE TABLE public.team_members (team_id uuid NOT NULL, user_id uuid NOT NULL);
CREATE FUNCTION public.is_team_member(_user_id uuid, _team_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT EXISTS (SELECT 1 FROM public.team_members WHERE user_id = _user_id AND team_id = _team_id) $$;
REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) TO authenticated, service_role;
CREATE TABLE public.uploaded_contracts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  team_id uuid, storage_path text, title text);
CREATE TABLE public.saved_documents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  team_id uuid, payload jsonb NOT NULL DEFAULT '{}'::jsonb, title text);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.uploaded_contracts, public.saved_documents TO authenticated;
GRANT ALL ON public.uploaded_contracts, public.saved_documents TO service_role;
ALTER TABLE public.uploaded_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_documents ENABLE ROW LEVEL SECURITY;
INSERT INTO public.team_members VALUES ('${T}','${M}'),('${T}','${N}'),('${T}','${O}'),('${U}','${F}');
INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES
  ('user-contracts','${A}/secret.pdf','${A}'), ('user-contracts','${O}/shared.pdf','${O}');
`;

// Точно живите стари политики (метаданни от 2026-09-25).
const OLD = `
CREATE POLICY saved_documents_all_own ON public.saved_documents FOR ALL TO authenticated
  USING (auth.uid() = user_id OR (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id)))
  WITH CHECK (auth.uid() = user_id OR (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id)));
CREATE POLICY uploaded_contracts_all_own ON public.uploaded_contracts FOR ALL TO authenticated
  USING (auth.uid() = user_id OR (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id)))
  WITH CHECK (auth.uid() = user_id OR (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id)));
CREATE POLICY "user_contracts_team_select" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'user-contracts' AND (
    EXISTS (SELECT 1 FROM public.uploaded_contracts uc WHERE uc.storage_path = storage.objects.name
      AND uc.team_id IS NOT NULL AND public.is_team_member(auth.uid(), uc.team_id))
    OR EXISTS (SELECT 1 FROM public.saved_documents sd WHERE sd.team_id IS NOT NULL
      AND public.is_team_member(auth.uid(), sd.team_id) AND sd.payload ->> 'storage_path' = storage.objects.name)));
`;

async function fresh(opts: { patched: boolean; beforePatch?: (db: PGlite) => Promise<void> }) {
  const db = new PGlite();
  await db.exec(BASE);
  await db.exec(OLD);
  if (opts.beforePatch) await opts.beforePatch(db);
  if (opts.patched) await db.exec(MIGRATION);
  return db;
}

/** Изпълнява SQL като роля + потребител в отделна транзакция. */
async function as(db: PGlite, role: "authenticated" | "anon" | "service_role", uid: string | null, sql: string) {
  return db.transaction(async (tx) => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
    await tx.exec(`SET LOCAL ROLE ${role}`);
    return tx.query<Record<string, unknown>>(sql);
  });
}
async function denied(p: Promise<unknown>) {
  let err: unknown = null;
  try { await p; } catch (e) { err = e; }
  expect(err, "очакван отказ").not.toBeNull();
  return String((err as Error).message);
}
const seeFile = async (db: PGlite, uid: string, name: string) =>
  (await as(db, "authenticated", uid, `SELECT name FROM storage.objects WHERE name = '${name}'`)).rows.length;

describe("стари политики: атаката е реална", () => {
  it("член на T подправя ред към чужд файл (дори user_id на жертвата) и съотборник го чете", async () => {
    const db = await fresh({ patched: false });
    expect(await seeFile(db, N, `${A}/secret.pdf`)).toBe(0);
    await as(db, "authenticated", M,
      `INSERT INTO public.uploaded_contracts (user_id, team_id, storage_path) VALUES ('${A}','${T}','${A}/secret.pdf')`);
    expect(await seeFile(db, N, `${A}/secret.pdf`)).toBe(1);
    expect(await seeFile(db, M, `${A}/secret.pdf`)).toBe(1);
  });
  it("същото през saved_documents.payload", async () => {
    const db = await fresh({ patched: false });
    await as(db, "authenticated", M,
      `INSERT INTO public.saved_documents (user_id, team_id, payload) VALUES ('${M}','${T}','{"storage_path":"${A}/secret.pdf"}')`);
    expect(await seeFile(db, N, `${A}/secret.pdf`)).toBe(1);
  });
});

describe("след поправката", () => {
  it("подправен INSERT (user_id на друг / чужд път / payload път) е отказан", async () => {
    const db = await fresh({ patched: true });
    await denied(as(db, "authenticated", M,
      `INSERT INTO public.uploaded_contracts (user_id, team_id, storage_path) VALUES ('${A}','${T}','${A}/secret.pdf')`));
    await denied(as(db, "authenticated", M,
      `INSERT INTO public.uploaded_contracts (user_id, team_id, storage_path) VALUES ('${M}','${T}','${A}/secret.pdf')`));
    await denied(as(db, "authenticated", M,
      `INSERT INTO public.saved_documents (user_id, team_id, payload) VALUES ('${M}','${T}','{"storage_path":"${A}/secret.pdf"}')`));
    await denied(as(db, "authenticated", M,
      `INSERT INTO public.uploaded_contracts (user_id, team_id) VALUES ('${M}','${U}')`)); // чужд екип
    expect(await seeFile(db, N, `${A}/secret.pdf`)).toBe(0);
    expect(await seeFile(db, M, `${A}/secret.pdf`)).toBe(0);
  });

  it("законно споделяне: собственикът споделя, съотборник чете, чужд екип и anon — не", async () => {
    const db = await fresh({ patched: true });
    await as(db, "authenticated", O,
      `INSERT INTO public.uploaded_contracts (user_id, team_id, storage_path, team_shared_by) VALUES ('${O}','${T}','${O}/shared.pdf','${A}')`);
    const row = await as(db, "service_role", null, `SELECT team_shared_by FROM public.uploaded_contracts`);
    expect(row.rows[0].team_shared_by).toBe(O); // клиентската стойност е пренебрегната
    expect(await seeFile(db, O, `${O}/shared.pdf`)).toBe(1);
    expect(await seeFile(db, N, `${O}/shared.pdf`)).toBe(1);
    expect(await seeFile(db, F, `${O}/shared.pdf`)).toBe(0);
    await denied(as(db, "anon", null, `SELECT name FROM storage.objects`));
    await denied(as(db, "anon", null, `SELECT id FROM public.uploaded_contracts`));
  });

  it("UPDATE: user_id е неизменен, път и екип сменя само собственикът, съдържанието — и екипът", async () => {
    const db = await fresh({ patched: true });
    await as(db, "authenticated", O,
      `INSERT INTO public.uploaded_contracts (user_id, team_id, storage_path, title) VALUES ('${O}','${T}','${O}/shared.pdf','x')`);
    await denied(as(db, "authenticated", N, `UPDATE public.uploaded_contracts SET user_id = '${N}'`));
    await denied(as(db, "authenticated", O, `UPDATE public.uploaded_contracts SET user_id = '${A}'`));
    await denied(as(db, "authenticated", N, `UPDATE public.uploaded_contracts SET storage_path = '${A}/secret.pdf'`));
    await denied(as(db, "authenticated", O, `UPDATE public.uploaded_contracts SET storage_path = '${A}/secret.pdf'`));
    await denied(as(db, "authenticated", N, `UPDATE public.uploaded_contracts SET team_id = NULL`));
    await as(db, "authenticated", N, `UPDATE public.uploaded_contracts SET team_shared_by = '${N}'`);
    const prov = await as(db, "service_role", null, `SELECT team_shared_by FROM public.uploaded_contracts`);
    expect(prov.rows[0].team_shared_by).toBe(O); // клиентът не пише произхода
    const edit = await as(db, "authenticated", N, `UPDATE public.uploaded_contracts SET title = 'y' RETURNING title`);
    expect(edit.rows[0].title).toBe("y");
    await as(db, "authenticated", O, `UPDATE public.uploaded_contracts SET team_id = NULL`);
    expect(await seeFile(db, N, `${O}/shared.pdf`)).toBe(0);
  });

  it("saved_documents: генериран документ без път работи; пренасочване на payload пътя е отказано", async () => {
    const db = await fresh({ patched: true });
    await as(db, "authenticated", O,
      `INSERT INTO public.saved_documents (user_id, team_id, payload, title) VALUES ('${O}','${T}','{"answers":{"a":1}}','Генериран')`);
    expect((await as(db, "authenticated", N, `SELECT title FROM public.saved_documents`)).rows.length).toBe(1);
    await as(db, "authenticated", N, `UPDATE public.saved_documents SET payload = '{"answers":{"a":2}}'`);
    await denied(as(db, "authenticated", N,
      `UPDATE public.saved_documents SET payload = '{"storage_path":"${A}/secret.pdf"}'`));
    await denied(as(db, "authenticated", O,
      `UPDATE public.saved_documents SET payload = '{"storage_path":"${A}/secret.pdf"}'`));
    await as(db, "authenticated", O, `UPDATE public.saved_documents SET payload = '{"storage_path":"${O}/shared.pdf"}'`);
    expect(await seeFile(db, N, `${O}/shared.pdf`)).toBe(1);
    expect(await seeFile(db, N, `${A}/secret.pdf`)).toBe(0);
  });

  it("стари подправени редове не дават достъп; законните чакат повторно споделяне", async () => {
    const db = await fresh({
      patched: true,
      beforePatch: async (d) => {
        await as(d, "authenticated", M,
          `INSERT INTO public.uploaded_contracts (user_id, team_id, storage_path) VALUES ('${A}','${T}','${A}/secret.pdf')`);
        await as(d, "authenticated", O,
          `INSERT INTO public.uploaded_contracts (user_id, team_id, storage_path) VALUES ('${O}','${T}','${O}/shared.pdf')`);
      },
    });
    const pre = await db.query<Record<string, number>>(PREFLIGHT);
    const uc = pre.rows.find((r) => (r as unknown as { tbl: string }).tbl === "uploaded_contracts")!;
    expect(Number(uc.owner_not_in_team_forged)).toBe(1);
    expect(Number(uc.team_file_rows_need_reshare)).toBe(2);
    expect(await seeFile(db, N, `${A}/secret.pdf`)).toBe(0);
    expect(await seeFile(db, M, `${A}/secret.pdf`)).toBe(0);
    expect(await seeFile(db, N, `${O}/shared.pdf`)).toBe(0); // не е доверено мълчаливо
    // Процедура за повторно упълномощаване от собственика.
    await as(db, "authenticated", O, `UPDATE public.uploaded_contracts SET team_id = NULL WHERE user_id = '${O}'`);
    await as(db, "authenticated", O, `UPDATE public.uploaded_contracts SET team_id = '${T}' WHERE user_id = '${O}'`);
    expect(await seeFile(db, N, `${O}/shared.pdf`)).toBe(1);
    // Жертвата може да види и изтрие подправения ред, записан на нейно име.
    expect((await as(db, "authenticated", A, `SELECT id FROM public.uploaded_contracts WHERE user_id = '${A}'`)).rows.length).toBe(1);
  });

  it("service_role остава доверен сървърен път", async () => {
    const db = await fresh({ patched: true });
    await as(db, "service_role", null,
      `INSERT INTO public.uploaded_contracts (user_id, storage_path) VALUES ('${A}','${A}/secret.pdf')`);
    expect((await as(db, "service_role", null, `SELECT name FROM storage.objects`)).rows.length).toBe(2);
    expect(await seeFile(db, N, `${A}/secret.pdf`)).toBe(0);
  });

  it("предварителната проверка е само четене и е чиста при законни данни", async () => {
    const db = await fresh({ patched: false });
    const before = await db.query(`SELECT count(*)::int c FROM public.uploaded_contracts`);
    const pre = await db.query<Record<string, unknown>>(PREFLIGHT);
    for (const r of pre.rows) {
      expect(Number(r.path_owner_mismatch)).toBe(0);
      expect(Number(r.owner_not_in_team_forged)).toBe(0);
    }
    expect((await db.query(`SELECT count(*)::int c FROM public.uploaded_contracts`)).rows).toEqual(before.rows);
  });
});
