import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase/migrations");
const REVIEW_ARTIFACT = join(
  process.cwd(),
  "docs/migrations/stage2a_product_checkout_entitlements.sql",
);

function migrationFile(): string {
  const name = readdirSync(MIGRATIONS_DIR).find((f) =>
    f.includes("product_checkout_entitlements")
  );
  expect(name, "Stage 2A миграцията липсва в supabase/migrations").toBeTruthy();
  return readFileSync(join(MIGRATIONS_DIR, name as string), "utf8");
}

describe("Stage 2A миграция — платежна истина", () => {
  const sql = migrationFile();

  it("е идентична с файла за преглед", () => {
    expect(sql).toBe(readFileSync(REVIEW_ARTIFACT, "utf8"));
  });

  it("премахва опасната клиентска INSERT политика върху order_snapshots", () => {
    expect(sql).toContain(
      "DROP POLICY IF EXISTS order_snapshots_user_insert ON public.order_snapshots",
    );
  });

  it("не дава на браузъра запис върху новите таблици", () => {
    for (const table of ["product_checkout_intakes", "product_entitlements"]) {
      expect(sql).toContain(`GRANT SELECT ON public.${table} TO authenticated;`);
      expect(sql).toContain(`GRANT ALL ON public.${table} TO service_role;`);
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
      expect(sql).not.toMatch(
        new RegExp(`CREATE POLICY[^;]*ON public\\.${table} FOR (INSERT|UPDATE|DELETE)`),
      );
    }
  });

  it("ограничава продуктите до трите канонични", () => {
    const canonical = "'contract_check', 'contract_improve', 'negotiation_package'";
    expect(sql).toContain(`CHECK (product_id IN (${canonical}))`);
  });

  it("разширява purchase_kind с product без да губи старите видове", () => {
    for (const kind of ["'product'", "'subscription'", "'topup'", "'strict_unlock'", "'branding'"]) {
      expect(sql).toContain(kind);
    }
  });

  it("дава EXECUTE само на service_role за платежните функции", () => {
    expect(sql).toContain("REVOKE ALL ON FUNCTION %s FROM anon");
    expect(sql).toContain("REVOKE ALL ON FUNCTION %s FROM authenticated");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION %s TO service_role");
    for (const fn of [
      "record_product_entitlement",
      "begin_product_fulfillment",
      "complete_product_fulfillment",
      "fail_product_fulfillment",
      "claim_product_refinement",
    ]) {
      expect(sql).toContain(`CREATE OR REPLACE FUNCTION public.${fn}(`);
    }
    const definers = sql.match(/SECURITY DEFINER SET search_path = public/g) ?? [];
    expect(definers.length).toBe(5);
  });

  it("включва точно едно уточнение само за пълния пакет", () => {
    expect(sql).toContain("product_id = 'negotiation_package' AND refinements_included = 1");
    expect(sql).toContain(
      "product_id IN ('contract_check', 'contract_improve') AND refinements_included = 0",
    );
  });

  it("не съдържа разрушителни операции", () => {
    expect(sql).not.toMatch(/DROP TABLE|TRUNCATE|DROP COLUMN|DELETE FROM/i);
  });
});
