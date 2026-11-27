// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("pageview RLS never grants direct client updates, including own rows; only the trusted tracker writes", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION public.is_staff(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;`);
    const migration = readFileSync("supabase/migrations/20260608122453_df72e813-adb1-491b-8bf0-2e0e7c0885d6.sql", "utf8");
    await db.exec(migration.split("CREATE INDEX")[0]);
    await db.exec(`INSERT INTO page_views(session_id,user_id,path,visitor_day_hash) VALUES
      ('cccccccc-0000-4000-8000-000000000003','aaaaaaaa-0000-4000-8000-000000000001','/plans','synthetic');`);
    for (const role of ["anon", "authenticated"]) {
      await expect(db.transaction(async tx => {
        await tx.exec(`SET LOCAL ROLE ${role}`);
        await tx.exec("UPDATE page_views SET duration_ms=999");
      })).rejects.toThrow(/permission denied/);
    }
    // Hosted ACLs also grant UPDATE; reproduce that broader ACL and prove
    // RLS still rejects both owner and stranger. Do not open client writes.
    await db.exec("GRANT UPDATE ON page_views TO authenticated,anon");
    for (const user of ["aaaaaaaa-0000-4000-8000-000000000001", "bbbbbbbb-0000-4000-8000-000000000002"]) {
      await db.transaction(async tx => {
        await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user]);
        await tx.exec("SET LOCAL ROLE authenticated; UPDATE page_views SET duration_ms=999");
      });
      expect((await db.query<{ duration_ms: number | null }>("SELECT duration_ms FROM page_views")).rows[0]?.duration_ms).toBeNull();
    }
    await db.transaction(async tx => { await tx.exec("SET LOCAL ROLE service_role; UPDATE page_views SET duration_ms=12000"); });
    expect((await db.query<{ duration_ms: number }>("SELECT duration_ms FROM page_views")).rows[0]?.duration_ms).toBe(12000);
  } finally { await db.close(); }
}, 30000);