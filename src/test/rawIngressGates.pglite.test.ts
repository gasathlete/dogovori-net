// @vitest-environment node
/**
 * Изпълними SQL регресии върху ИСТИНСКИ PostgreSQL (PGlite, в паметта), само
 * синтетични данни, без връзка към свързана база:
 *  - 0046: директно качване/обновяване в user-contracts е възможно при старите
 *    политики и е отказано след поправката; друга кофа не е засегната;
 *    четене/сваляне/изтриване и екипното четене от 0045 работят; anon е отказан;
 *    service_role действа.
 *  - 0047: нов/променен payload в saved_documents от клиент е отказан;
 *    метаданни, екипно пресподеляне (0045), възстановяване на версия и
 *    service_role работят.
 * Ред на прилагане в теста: 0045 → 0046 → 0047 (както в runbook).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const M0045 = readFileSync("docs/migrations/0045_team_file_binding.sql", "utf8");
const M0046 = readFileSync("docs/migrations/0046_storage_raw_ingress_gate.sql", "utf8");
const M0047 = readFileSync("docs/migrations/0047_saved_documents_client_payload_gate.sql", "utf8");

const O = "aaaaaaaa-0000-4000-8000-000000000001"; // собственик, член на T
const N = "aaaaaaaa-0000-4000-8000-000000000002"; // съотборник в T
const X = "aaaaaaaa-0000-4000-8000-000000000003"; // външен
const T = "bbbbbbbb-0000-4000-8000-000000000001";

const BASE = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA storage;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
GRANT USAGE ON SCHEMA auth, storage, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO anon, authenticated, service_role;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
  $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
GRANT EXECUTE ON FUNCTION storage.foldername(text) TO anon, authenticated, service_role;
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL, name text NOT NULL, owner_id text, version int NOT NULL DEFAULT 1);
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated, service_role;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
-- Живите собствени политики на user-contracts (20260509215814 + 20260707141339).
CREATE POLICY user_contracts_select_own ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'user-contracts' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY user_contracts_insert_own ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'user-contracts' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY user_contracts_update_own ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'user-contracts' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY user_contracts_delete_own ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'user-contracts' AND auth.uid()::text = (storage.foldername(name))[1]);
-- Друга кофа със собствено качване (синтетична, по модела на съществуващите).
CREATE POLICY other_bucket_own ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'team-assets' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'team-assets' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE TABLE public.team_members (team_id uuid NOT NULL, user_id uuid NOT NULL);
CREATE FUNCTION public.is_team_member(_user_id uuid, _team_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT EXISTS (SELECT 1 FROM public.team_members WHERE user_id = _user_id AND team_id = _team_id) $$;
REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) TO authenticated, service_role;
CREATE TABLE public.uploaded_contracts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  team_id uuid, storage_path text, title text);
CREATE TABLE public.saved_documents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  team_id uuid, payload jsonb NOT NULL DEFAULT '{}'::jsonb, title text, folder_id uuid, tags text[]);
CREATE TABLE public.document_versions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_document_id uuid NOT NULL, user_id uuid NOT NULL, title text NOT NULL, payload jsonb NOT NULL, version_no int NOT NULL);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.uploaded_contracts, public.saved_documents TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.document_versions TO authenticated;
GRANT ALL ON public.uploaded_contracts, public.saved_documents, public.document_versions TO service_role;
ALTER TABLE public.uploaded_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY document_versions_select_own ON public.document_versions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY saved_documents_all_own ON public.saved_documents FOR ALL TO authenticated
  USING (auth.uid() = user_id OR (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id)))
  WITH CHECK (auth.uid() = user_id OR (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id)));
CREATE POLICY uploaded_contracts_all_own ON public.uploaded_contracts FOR ALL TO authenticated
  USING (auth.uid() = user_id OR (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id)))
  WITH CHECK (auth.uid() = user_id OR (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id)));
CREATE POLICY "user_contracts_team_select" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'user-contracts' AND EXISTS (SELECT 1 FROM public.uploaded_contracts uc WHERE uc.storage_path = storage.objects.name
    AND uc.team_id IS NOT NULL AND public.is_team_member(auth.uid(), uc.team_id)));
INSERT INTO public.team_members VALUES ('${T}','${O}'),('${T}','${N}');
INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('user-contracts','${O}/existing.pdf','${O}');
`;

async function fresh(patched: boolean) {
  const db = new PGlite();
  await db.exec(BASE);
  if (patched) {
    await db.exec(M0045);
    await db.exec(M0046);
    await db.exec(M0047);
  }
  return db;
}
type Role = "authenticated" | "anon" | "service_role";
async function as(db: PGlite, role: Role, uid: string | null, sql: string) {
  return db.transaction(async (tx) => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
    await tx.query(`SELECT set_config('request.jwt.claim.role', $1, true)`, [role]);
    await tx.exec(`SET LOCAL ROLE ${role}`);
    return tx.query<Record<string, unknown>>(sql);
  });
}
async function denied(p: Promise<unknown>) {
  let err: unknown = null;
  try { await p; } catch (e) { err = e; }
  expect(err, "очакван отказ").not.toBeNull();
}
const count = async (db: PGlite, where: string) =>
  Number((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM storage.objects WHERE ${where}`)).rows[0].n);

describe("0046 user-contracts: директен суров вход", () => {
  it("СТАРИ политики: собственикът качва и презаписва директно в собствената папка", async () => {
    const db = await fresh(false);
    await as(db, "authenticated", O, `INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('user-contracts','${O}/raw.pdf','${O}')`);
    const upd = await as(db, "authenticated", O, `UPDATE storage.objects SET version = 2 WHERE name = '${O}/existing.pdf' RETURNING id`);
    expect(await count(db, `name = '${O}/raw.pdf'`)).toBe(1);
    expect(upd.rows.length).toBe(1);
  });

  it("СЛЕД поправката: директно INSERT/UPDATE (и upsert) в user-contracts е отказано", async () => {
    const db = await fresh(true);
    await denied(as(db, "authenticated", O, `INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('user-contracts','${O}/raw.pdf','${O}')`));
    const upd = await as(db, "authenticated", O, `UPDATE storage.objects SET version = 2 WHERE name = '${O}/existing.pdf' RETURNING id`);
    expect(upd.rows.length).toBe(0); // restrictive USING скрива реда за UPDATE
    await denied(as(db, "authenticated", O, `UPDATE storage.objects SET bucket_id = 'user-contracts' WHERE false OR bucket_id = 'team-assets'`)
      .then(async () => {
        // преместване от друга кофа в user-contracts: WITH CHECK отказва
        await as(db, "authenticated", O, `INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('team-assets','${O}/a.png','${O}')`);
        await as(db, "authenticated", O, `UPDATE storage.objects SET bucket_id = 'user-contracts' WHERE name = '${O}/a.png'`);
      }));
    expect(await count(db, `bucket_id = 'user-contracts' AND name <> '${O}/existing.pdf'`)).toBe(0);
    expect(Number((await db.query<{ v: number }>(`SELECT version AS v FROM storage.objects WHERE name = '${O}/existing.pdf'`)).rows[0].v)).toBe(1);
  });

  it("друга кофа не е засегната", async () => {
    const db = await fresh(true);
    await as(db, "authenticated", O, `INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('team-assets','${O}/logo.png','${O}')`);
    const upd = await as(db, "authenticated", O, `UPDATE storage.objects SET version = 2 WHERE name = '${O}/logo.png' RETURNING id`);
    expect(upd.rows.length).toBe(1);
  });

  it("собственикът чете и изтрива; екипното четене (0045) работи; външен не вижда", async () => {
    const db = await fresh(true);
    await as(db, "authenticated", O,
      `INSERT INTO public.uploaded_contracts (user_id, team_id, storage_path) VALUES ('${O}','${T}','${O}/existing.pdf')`);
    const see = async (uid: string) =>
      (await as(db, "authenticated", uid, `SELECT name FROM storage.objects WHERE name = '${O}/existing.pdf'`)).rows.length;
    expect(await see(O)).toBe(1);
    expect(await see(N)).toBe(1);
    expect(await see(X)).toBe(0);
    const del = await as(db, "authenticated", O, `DELETE FROM storage.objects WHERE name = '${O}/existing.pdf' RETURNING id`);
    expect(del.rows.length).toBe(1);
  });

  it("anon е отказан; service_role качва и обновява", async () => {
    const db = await fresh(true);
    await denied(as(db, "anon", null, `INSERT INTO storage.objects (bucket_id, name) VALUES ('user-contracts','x/raw.pdf')`));
    await as(db, "service_role", null, `INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('user-contracts','${O}/server.pdf','${O}')`);
    const upd = await as(db, "service_role", null, `UPDATE storage.objects SET version = 3 WHERE name = '${O}/server.pdf' RETURNING id`);
    expect(upd.rows.length).toBe(1);
  });
});

describe("0047 saved_documents: ново съдържание от клиент", () => {
  const seed = async (db: PGlite) => {
    const r = await as(db, "service_role", null,
      `INSERT INTO public.saved_documents (user_id, title, payload) VALUES ('${O}','Документ','{"text":"стар"}') RETURNING id`);
    const id = String(r.rows[0].id);
    await as(db, "service_role", null,
      `INSERT INTO public.document_versions (saved_document_id, user_id, title, payload, version_no) VALUES ('${id}','${O}','Документ','{"text":"версия 1"}',1)`);
    return id;
  };

  it("СТАРИ политики: клиентът записва ново съдържание", async () => {
    const db = await fresh(false);
    await as(db, "authenticated", O, `INSERT INTO public.saved_documents (user_id, payload) VALUES ('${O}','{"text":"нов"}')`);
  });

  it("СЛЕД: INSERT с payload и промяна на payload са отказани", async () => {
    const db = await fresh(true);
    const id = await seed(db);
    await denied(as(db, "authenticated", O, `INSERT INTO public.saved_documents (user_id, payload) VALUES ('${O}','{"text":"нов"}')`));
    await denied(as(db, "authenticated", O, `UPDATE public.saved_documents SET payload = '{"text":"нов"}' WHERE id = '${id}'`));
  });

  it("СЛЕД: метаданни, пресподеляне към екип и възстановяване на своя версия работят", async () => {
    const db = await fresh(true);
    const id = await seed(db);
    await as(db, "authenticated", O, `UPDATE public.saved_documents SET title = 'Ново име', tags = ARRAY['a'] WHERE id = '${id}'`);
    await as(db, "authenticated", O, `UPDATE public.saved_documents SET team_id = '${T}' WHERE id = '${id}'`);
    await as(db, "authenticated", O, `UPDATE public.saved_documents SET payload = '{"text":"версия 1"}' WHERE id = '${id}'`);
    const row = await db.query<{ payload: unknown; team_shared_by: string }>(`SELECT payload, team_shared_by FROM public.saved_documents WHERE id = '${id}'`);
    expect(row.rows[0].payload).toEqual({ text: "версия 1" });
    expect(row.rows[0].team_shared_by).toBe(O);
    await as(db, "authenticated", O, `INSERT INTO public.saved_documents (user_id, title) VALUES ('${O}','Празен')`);
    const del = await as(db, "authenticated", O, `DELETE FROM public.saved_documents WHERE id = '${id}' RETURNING id`);
    expect(del.rows.length).toBe(1);
  });

  it("СЛЕД: service_role записва съдържание", async () => {
    const db = await fresh(true);
    const id = await seed(db);
    await as(db, "service_role", null, `UPDATE public.saved_documents SET payload = '{"text":"сървър"}' WHERE id = '${id}'`);
  });
});
