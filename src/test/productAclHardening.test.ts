import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRODUCT_ACL_MIGRATION,
  PRODUCT_ACL_REVIEW,
  PRODUCT_OWNER_READ_TABLES,
  PRODUCT_TABLES,
  validateAclHardening,
  validateProductRollout,
  type RolloutSource,
} from "../../scripts/product-rollout-preflight";

const disk: RolloutSource = { read: (path) => readFileSync(resolve(process.cwd(), path), "utf8") };
const override = (path: string, transform: (source: string) => string): RolloutSource => ({
  read: (candidate) => (candidate === path ? transform(disk.read(candidate)) : disk.read(candidate)),
});

const SQL = disk.read(PRODUCT_ACL_MIGRATION);
const MANIFEST = JSON.parse(disk.read("docs/migrations/product-rollout-manifest.json")) as {
  status: string;
  appliedRecord: Record<string, string>;
  migrations: { id: string; file: string; review: string; sha256: string; dependsOn: string }[];
};

describe("0026 — затягане на правата върху продуктовата схема", () => {
  it("минава семантичната проверка и е byte-identical с файла за преглед", () => {
    expect(validateAclHardening(disk)).toEqual([]);
    expect(SQL).toBe(disk.read(PRODUCT_ACL_REVIEW));
  });

  it("е последната миграция в точния ред с нов SHA-256", () => {
    const applied = MANIFEST.migrations.filter((m) => (m as { applied?: unknown }).applied !== false);
    const last = applied[applied.length - 1];
    expect(applied.length).toBe(9);
    expect(last.id).toBe("0026_product_acl_hardening");
    expect(last.dependsOn).toBe("0025_product_result_selections");
    expect(last.sha256).toBe("a21afdd9bacd642601f215040b973a7fc9c2e58db2826214ffaad4a5cd00bfcf");
    expect(last.file).toBe(PRODUCT_ACL_MIGRATION);
    expect(last.review).toBe(PRODUCT_ACL_REVIEW);
  });

  it("прилага се атомарно и не пипа данни или default privileges", () => {
    expect(SQL).toContain("BEGIN;");
    expect(SQL.trimEnd().endsWith("COMMIT;")).toBe(true);
    const code = SQL.split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n");
    expect(code).not.toMatch(/ALTER\s+DEFAULT\s+PRIVILEGES/i);
    expect(code).not.toMatch(/DROP\s+(TABLE|COLUMN|POLICY|FUNCTION|TRIGGER)|TRUNCATE/i);
    expect(code).not.toMatch(/INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+public\./i);
  });

  it("отнема всичко от PUBLIC, anon и authenticated върху всичките 10 таблици", () => {
    expect(PRODUCT_TABLES.length).toBe(10);
    for (const table of PRODUCT_TABLES) {
      expect(SQL, table).toContain(
        `REVOKE ALL PRIVILEGES ON TABLE public.${table} FROM PUBLIC, anon, authenticated;`,
      );
      expect(SQL, table).toContain(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${table} TO service_role;`,
      );
    }
  });

  it("дава SELECT на authenticated само върху петте таблици за собственика", () => {
    expect(PRODUCT_OWNER_READ_TABLES.length).toBe(5);
    for (const table of PRODUCT_TABLES) {
      const granted = SQL.includes(`GRANT SELECT ON TABLE public.${table} TO authenticated;`);
      expect(granted, table).toBe((PRODUCT_OWNER_READ_TABLES as readonly string[]).includes(table));
    }
    expect(SQL).not.toMatch(/GRANT[^;]*TO\s+anon/i);
  });

  it("отнема EXECUTE по точен overload и връща само product_job_status(uuid)", () => {
    expect(SQL).toContain("pg_get_function_identity_arguments(p.oid)");
    for (const role of ["PUBLIC", "anon", "authenticated"]) {
      expect(SQL).toContain(`REVOKE ALL PRIVILEGES ON FUNCTION %s FROM ${role}`);
    }
    expect(SQL).toContain("GRANT EXECUTE ON FUNCTION %s TO service_role");
    expect(SQL).toContain("GRANT EXECUTE ON FUNCTION public.product_job_status(uuid) TO authenticated;");
    expect(SQL).not.toMatch(/GRANT EXECUTE ON FUNCTION[^;]*TO\s+anon/i);
    for (const fn of [
      "record_product_purchase",
      "claim_product_job",
      "load_product_result_state",
      "save_product_result_selection",
      "complete_product_result_refinement_call",
      "bind_product_entitlement_policy",
      "enforce_product_refinement_immutable",
    ]) {
      expect(SQL, fn).toContain(`'${fn}'`);
    }
  });

  it("способността за готовност е service-only и връща точния отговор", () => {
    expect(SQL).toContain("CREATE OR REPLACE FUNCTION public.product_rollout_capability()");
    expect(SQL).toContain("STABLE");
    expect(SQL).toContain("SECURITY DEFINER SET search_path = ''");
    expect(SQL).toContain(
      "SELECT jsonb_build_object('ok', true, 'migration', '0026_product_acl_hardening');",
    );
    expect(SQL).toContain(
      "REVOKE ALL PRIVILEGES ON FUNCTION public.product_rollout_capability() FROM PUBLIC, anon, authenticated;",
    );
    expect(SQL).toContain(
      "GRANT EXECUTE ON FUNCTION public.product_rollout_capability() TO service_role;",
    );
    // ACL редовете стоят преди способността, в същата транзакция.
    expect(SQL.indexOf("REVOKE ALL PRIVILEGES ON TABLE")).toBeLessThan(
      SQL.indexOf("CREATE OR REPLACE FUNCTION public.product_rollout_capability()"),
    );
  });

  it("не влиза в дневника на миграциите", () => {
    expect(readFileSync("drizzle/migrations/meta/_journal.json", "utf8")).not.toContain(
      "0026_product_acl_hardening",
    );
  });

  it.each([
    ["липсващ table revoke", (s: string) => s.replace("REVOKE ALL PRIVILEGES ON TABLE public.product_generation_calls FROM PUBLIC, anon, authenticated;\n", ""), "missing table revoke"],
    ["излишен owner-read grant", (s: string) => `${s}\nGRANT SELECT ON TABLE public.product_generation_calls TO authenticated;`, "owner-read grant mismatch"],
    ["право за anon", (s: string) => `${s}\nGRANT SELECT ON TABLE public.product_entitlements TO anon;`, "grants a privilege to anon"],
    ["промяна на default privileges", (s: string) => `${s}\nALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO authenticated;`, "mutates default privileges"],
    ["изтриване на обект", (s: string) => `${s}\nDROP FUNCTION public.product_job_status(uuid);`, "destructive or data-mutating"],
    ["липсваща способност", (s: string) => s.replace("CREATE OR REPLACE FUNCTION public.product_rollout_capability()", "CREATE OR REPLACE FUNCTION public.other_capability()"), "missing function ACL clause"],
  ])("отказва %s", (_name, mutate, expected) => {
    expect(validateAclHardening(override(PRODUCT_ACL_MIGRATION, mutate)).join("\n")).toContain(expected);
    expect(validateProductRollout(override(PRODUCT_ACL_MIGRATION, mutate)).join("\n")).toContain(expected);
  });
});

describe("manifest-ът и документите описват истината след прилагането", () => {
  const CHECKLIST = disk.read("docs/migrations/PRODUCT_INTEGRATION_ROLLOUT.md");
  const ORDER = disk.read("docs/migrations/STAGE2A_ROLLOUT_ORDER.md");

  it("записва двете транзакции, ACL проверката и че 0026 е приложена", () => {
    expect(MANIFEST.status).toContain("applied-and-verified-2026-09-12");
    expect(MANIFEST.status).not.toMatch(/pending exact application|source-only/);
    // Приложената верига остава 0018–0026; всяка следваща миграция е изрично
    // отбелязана като НЕприложена и се вижда в състоянието.
    expect(MANIFEST.migrations.filter((m) => (m as { applied?: unknown }).applied === false)
      .map((m) => m.id)).toEqual([
      "0041_gate3_paid_fulfillment_exact_once",
      "0044_privacy_client_write_gate",
      "0045_team_file_binding",
    ]);
    expect(MANIFEST.status).toContain("PENDING (not applied)");
    const record = JSON.stringify(MANIFEST.appliedRecord);
    expect(record).toContain("2026-09-12");
    expect(record).toContain("0A000");
    expect(record).toContain("no Drizzle journal entries");
    expect(record).toContain("uploaded_contracts=13 preserved");
    expect(record).toContain("__codex_product_migration_stage_20260912");
    expect(record).toContain("product_job_status(uuid)");
    expect(MANIFEST.appliedRecord.notEnabled).toMatch(/flags/);
  });

  it("описва точната история от две транзакции, а не по една на файл", () => {
    const t1 = MANIFEST.appliedRecord.transaction1;
    const t2 = MANIFEST.appliedRecord.transaction2;
    expect(t1).toContain("252");
    expect(t1).toContain("ONE atomic transaction");
    expect(t1).toContain("not one transaction per file");
    expect(t1).toContain("forced-rollback dry run");
    expect(t2).toContain("second atomic transaction");
    expect(t2).toContain("PostgREST schema reload");
    expect(MANIFEST.appliedRecord.mode).toContain("two atomic transactions");
    expect(MANIFEST.appliedRecord.aclVerification).toContain("zero anon/authenticated/service violations");
    expect(MANIFEST.appliedRecord.capability).toContain(
      "product_rollout_capability() returns exactly {ok:true, migration:'0026_product_acl_hardening'}",
    );
  });

  it("0026 е отбелязана като приложена в точния ред", () => {
    const appliedChain = MANIFEST.migrations.filter((m) => (m as { applied?: unknown }).applied !== false);
    const last = appliedChain[appliedChain.length - 1] as unknown as { applied?: string };
    expect(last.applied).toContain("2026-09-12");
    expect(last.applied).toContain("own second atomic transaction");
    expect(last.applied).toContain("no Drizzle journal entry");
  });

  it("операторските документи не твърдят, че 0026 предстои", () => {
    for (const doc of [CHECKLIST, ORDER]) {
      expect(doc).toContain("0026_product_acl_hardening");
      expect(doc).toContain("252");
      expect(doc).not.toMatch(/0026[^\n]*само източник|Още не е приложена/);
      expect(doc).toMatch(/приложена и проверена|приложено и проверено/);
      expect(doc).not.toMatch(/Edge функции[^.]*включени(?! )/);
    }
    expect(CHECKLIST).toContain("PostgREST schema reload");
    expect(CHECKLIST).toContain("Няма чакаща миграция");
    expect(ORDER).toContain("Няма чакаща миграция");
    // Flags/Edge/frontend/Stripe/AI остават невключени.
    expect(ORDER).toContain("Не са включени flags, Edge функции, frontend publish");
  });
});
