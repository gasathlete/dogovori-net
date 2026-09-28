// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const PATCH = readFileSync("docs/migrations/security_privacy_kpis_authz_2026_09_28.sql", "utf8");
const ORIGINAL = "CREATE OR REPLACE FUNCTION public.admin_privacy_kpis(_from timestamp with time zone, _to timestamp with time zone)\n RETURNS TABLE(total_calls bigint, blocked_calls bigint, redacted_calls bigint, special_category_calls bigint, redaction_applied bigint, fallback_used bigint, distinct_users bigint, tokens_in_sum bigint, tokens_out_sum bigint, restricted_events bigint)\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\n  SELECT\n    COUNT(*) FILTER (WHERE a.created_at >= _from AND a.created_at < _to)::bigint,\n    COUNT(*) FILTER (WHERE a.status = 'blocked' AND a.created_at >= _from AND a.created_at < _to)::bigint,\n    COUNT(*) FILTER (WHERE a.redaction_applied AND a.created_at >= _from AND a.created_at < _to)::bigint,\n    COUNT(*) FILTER (WHERE a.contains_special_category_data AND a.created_at >= _from AND a.created_at < _to)::bigint,\n    COUNT(*) FILTER (WHERE a.redaction_applied AND a.created_at >= _from AND a.created_at < _to)::bigint,\n    COUNT(*) FILTER (WHERE a.fallback_used AND a.created_at >= _from AND a.created_at < _to)::bigint,\n    COUNT(DISTINCT a.user_id) FILTER (WHERE a.created_at >= _from AND a.created_at < _to)::bigint,\n    COALESCE(SUM(a.tokens_in) FILTER (WHERE a.created_at >= _from AND a.created_at < _to), 0)::bigint,\n    COALESCE(SUM(a.tokens_out) FILTER (WHERE a.created_at >= _from AND a.created_at < _to), 0)::bigint,\n    (SELECT COUNT(*) FROM public.restricted_processing_events ic\n       WHERE ic.created_at >= _from AND ic.created_at < _to)::bigint\n  FROM public.ai_audit_log a\n  WHERE public.is_staff(auth.uid());\n$function$\n";
const STAFF = "cccccccc-0000-4000-8000-000000000003";
const USER = "aaaaaaaa-0000-4000-8000-000000000001";
const QUERY = "SELECT * FROM public.admin_privacy_kpis('2026-01-01'::timestamptz, '2027-01-01'::timestamptz)";
const BASE = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION public.is_staff(uid uuid) RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT uid = '${STAFF}'::uuid $$;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
CREATE TABLE public.ai_audit_log (
  created_at timestamptz, status text, redaction_applied boolean,
  contains_special_category_data boolean, fallback_used boolean,
  user_id uuid, tokens_in integer, tokens_out integer
);
CREATE TABLE public.restricted_processing_events (created_at timestamptz);
INSERT INTO public.ai_audit_log VALUES
  ('2026-09-01','blocked',true,true,false,'${USER}',12,3);
INSERT INTO public.restricted_processing_events VALUES ('2026-09-01');
`;

describe("admin privacy KPI authorization", () => {
  it("reproduces the scalar aggregate leak, then denies nonstaff and retains staff metrics", async () => {
    const db = new PGlite();
    try {
      await db.exec(BASE + ORIGINAL);
      await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub = '${USER}';`);
      const before = await db.query<{ restricted_events: number; total_calls: number }>(QUERY);
      expect(Number(before.rows[0].total_calls)).toBe(0);
      expect(Number(before.rows[0].restricted_events)).toBe(1);

      await db.exec("RESET ROLE;");
      await db.exec(PATCH);
      await db.exec(PATCH); // replay keeps the authorization boundary
      await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub = '${USER}';`);
      await expect(db.query(QUERY)).rejects.toMatchObject({ code: "42501" });
      await db.exec("SET request.jwt.claim.sub = '';");
      await expect(db.query(QUERY)).rejects.toMatchObject({ code: "42501" });
      await db.exec("RESET ROLE; SET ROLE anon;");
      await expect(db.query(QUERY)).rejects.toMatchObject({ code: "42501" });

      await db.exec(`RESET ROLE; SET ROLE authenticated; SET request.jwt.claim.sub = '${STAFF}';`);
      const after = await db.query<{ restricted_events: number; total_calls: number; tokens_in_sum: number }>(QUERY);
      expect(Number(after.rows[0].restricted_events)).toBe(1);
      expect(Number(after.rows[0].total_calls)).toBe(1);
      expect(Number(after.rows[0].tokens_in_sum)).toBe(12);
    } finally {
      await db.close();
    }
  }, 30000);
});
