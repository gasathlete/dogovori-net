// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const owner = "aaaaaaaa-0000-4000-8000-000000000001";
const member = "bbbbbbbb-0000-4000-8000-000000000002";
const foreign = "cccccccc-0000-4000-8000-000000000003";
const patch = readFileSync("docs/migrations/security_document_identity_2026_09_28.sql", "utf8");

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated,anon,service_role;
    CREATE TABLE saved_documents(id int PRIMARY KEY,user_id uuid,team_id int,payload jsonb);
    CREATE TABLE uploaded_contracts(id int PRIMARY KEY,user_id uuid,team_id int,storage_path text);
    ALTER TABLE saved_documents ENABLE ROW LEVEL SECURITY;
    ALTER TABLE uploaded_contracts ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_or_team ON saved_documents FOR ALL USING (user_id=auth.uid() OR team_id=1) WITH CHECK (user_id=auth.uid() OR team_id=1);
    CREATE POLICY own_or_team ON uploaded_contracts FOR ALL USING (user_id=auth.uid() OR team_id=1) WITH CHECK (user_id=auth.uid() OR team_id=1);
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated,service_role;
    INSERT INTO saved_documents VALUES(1,'${owner}',1,'{}');
    INSERT INTO uploaded_contracts VALUES(1,'${owner}',1,'${owner}/own.pdf');
  `);
  return db;
}
async function as(db:PGlite,uid:string,sql:string,role="authenticated") {
  return db.transaction(async tx=>{
    await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[uid]);
    await tx.exec(`SET LOCAL ROLE ${role}`);
    return tx.query(sql);
  });
}
describe("document identity and team storage isolation",{timeout:120000},()=>{
  it("reproduces forged owner INSERT and UPDATE, then denies both while retaining team edits",async()=>{
    const db=await fixture();
    try {
      await as(db,member,`INSERT INTO uploaded_contracts VALUES(2,'${foreign}',1,'${foreign}/secret.pdf')`);
      await as(db,member,`UPDATE saved_documents SET user_id='${foreign}',payload='{"storage_path":"${foreign}/secret.pdf"}' WHERE id=1`);
      await db.exec(`DELETE FROM uploaded_contracts WHERE id=2; UPDATE saved_documents SET user_id='${owner}',payload='{}' WHERE id=1;`);
      await db.exec(patch);
      for(const table of ["saved_documents","uploaded_contracts"]) {
        const value=table==="saved_documents"?`'{"storage_path":"${foreign}/secret.pdf"}'`:`'${foreign}/secret.pdf'`;
        await expect(as(db,member,`INSERT INTO ${table} VALUES(2,'${foreign}',1,${value})`)).rejects.toThrow("document_owner_required");
        await expect(as(db,member,`UPDATE ${table} SET user_id='${foreign}' WHERE id=1`)).rejects.toThrow("document_owner_immutable");
      }
      await as(db,member,`INSERT INTO saved_documents VALUES(2,'${member}',1,'{}')`);
      await as(db,member,`INSERT INTO uploaded_contracts VALUES(2,'${member}',1,'${member}/new.pdf')`);
      await as(db,member,`UPDATE saved_documents SET payload='{"title":"team edit"}' WHERE id=1`);
      await as(db,member,`UPDATE uploaded_contracts SET storage_path='${owner}/revised.pdf' WHERE id=1`);
      await expect(as(db,member,`UPDATE saved_documents SET payload='{"storage_path":"${foreign}/secret.pdf"}' WHERE id=1`)).rejects.toThrow("document_storage_owner_required");
      await expect(as(db,member,`UPDATE uploaded_contracts SET storage_path='${foreign}/secret.pdf' WHERE id=1`)).rejects.toThrow("document_storage_owner_required");
      for(const bad of [`${owner}/../secret.pdf`,`${owner}/%2e%2e/secret.pdf`,`${owner}//secret.pdf`]) {
        await expect(as(db,member,`UPDATE saved_documents SET payload=jsonb_build_object('storage_path','${bad}') WHERE id=1`)).rejects.toThrow("document_storage_owner_required");
      }
      await as(db,"",`INSERT INTO saved_documents VALUES(3,'${foreign}',1,'{}')`,"service_role");
      await db.exec(patch);
    } finally { await db.close(); }
  });
});
