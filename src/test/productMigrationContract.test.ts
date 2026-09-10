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
    expect(sql).toContain("REVOKE ALL ON FUNCTION %s FROM PUBLIC");
    expect(sql).toContain("REVOKE ALL ON FUNCTION %s FROM anon");
    expect(sql).toContain("REVOKE ALL ON FUNCTION %s FROM authenticated");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION %s TO service_role");
    for (const fn of [
      "record_product_purchase",
      "begin_product_fulfillment",
      "complete_product_fulfillment",
      "fail_product_fulfillment",
      "claim_product_refinement",
      "complete_product_refinement",
      "fail_product_refinement",
    ]) {
      expect(sql).toContain(`CREATE OR REPLACE FUNCTION public.${fn}(`);
    }
  });

  it("всяка SECURITY DEFINER функция ползва празен search_path", () => {
    const definers = sql.match(/SECURITY DEFINER SET search_path = '[^']*'/g) ?? [];
    expect(definers.length).toBeGreaterThanOrEqual(7);
    // Нито един ред не разчита на public в search_path.
    expect(sql).not.toMatch(/SECURITY DEFINER SET search_path = public/);
    for (const d of definers) expect(d).toBe("SECURITY DEFINER SET search_path = ''");
  });

  it("покупката и доказателството за поръчка се записват в една транзакция", () => {
    // Едно извикване прави и правото, и order snapshot-а — няма половин покупка.
    const fn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.record_product_purchase("));
    const body = fn.slice(0, fn.indexOf("END $$"));
    expect(body).toContain("FROM public.product_checkout_intakes");
    expect(body).toContain("FOR UPDATE");
    expect(body).toContain("INSERT INTO public.product_entitlements");
    expect(body).toContain("INSERT INTO public.order_snapshots");
    expect(body).toContain("product_entitlement_conflict");
    expect(body).toContain("product_snapshot_conflict");
    expect(body).toContain("product_source_changed");
    // Никакви кредити/операции от продуктова покупка.
    expect(body).not.toMatch(/credit_topup_ops|download_quota/);
  });

  it("изисква ЦЯЛ източник за платено право", () => {
    expect(sql).toContain("CHECK (source_extraction_status = 'full')");
    expect(sql).toContain("source_extraction_status = 'full'");
  });

  it("включва точно едно уточнение само за пълния пакет", () => {
    expect(sql).toContain(
      "AND stripe_price_lookup_key = 'negotiation_package_799' AND refinements_included = 1",
    );
    expect(sql).toContain(
      "AND stripe_price_lookup_key = 'contract_check_299' AND refinements_included = 0",
    );
    expect(sql).toContain(
      "AND stripe_price_lookup_key = 'contract_improve_399' AND refinements_included = 0",
    );
  });

  it("уточнението се отчита само след успешно завършване", () => {
    const claim = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.claim_product_refinement("));
    const claimBody = claim.slice(0, claim.indexOf("END $$"));
    // Заявяването НЕ увеличава използваните уточнения.
    expect(claimBody).not.toMatch(/refinements_used\s*=\s*refinements_used\s*\+\s*1/);
    const complete = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.complete_product_refinement("),
    );
    expect(complete.slice(0, complete.indexOf("END $$"))).toMatch(
      /refinements_used\s*=\s*refinements_used\s*\+\s*1/,
    );
    const failed = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.fail_product_refinement("));
    const failedBody = failed.slice(0, failed.indexOf("END $$"));
    // Неуспехът не изразходва уточнение и запазва готовия резултат.
    expect(failedBody).not.toMatch(/refinements_used\s*=\s*refinements_used\s*\+\s*1/);
    expect(failedBody).not.toMatch(/status\s*=\s*'failed'/);
  });

  it("не съдържа разрушителни операции", () => {
    expect(sql).not.toMatch(/DROP TABLE|TRUNCATE|DROP COLUMN|DELETE FROM/i);
  });
});

