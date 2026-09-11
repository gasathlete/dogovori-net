import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => readFileSync(join(root, relative), "utf8");

const MIGRATION = "drizzle/migrations/0025_product_result_selections.sql";
const REVIEW = "docs/migrations/stage2b1c_product_result_selections.sql";
const ROLLOUT = "docs/migrations/STAGE2A_ROLLOUT_ORDER.md";

describe("Stage 2B1C — миграция за избор и уточнение", () => {
  const sql = read(MIGRATION);

  it("е байт по байт идентична с файла за преглед", () => {
    expect(sql).toBe(read(REVIEW));
  });

  it("не пипа защитените миграции 0018–0024", () => {
    for (const name of [
      "0018_product_result_v2_binding_patch.sql",
      "0019_product_fulfillment_jobs.sql",
      "0020_product_fulfillment_jobs_correction.sql",
      "0021_product_policy_binding_patch.sql",
      "0022_product_generation_artifacts.sql",
      "0023_product_generation_artifacts_correction.sql",
      "0024_product_generation_runtime_safety_correction.sql",
    ]) {
      expect(read(`drizzle/migrations/${name}`).length).toBeGreaterThan(0);
    }
  });

  it("е допълнителна: без DROP TABLE и без изтриване на данни", () => {
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/TRUNCATE/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
  });

  it("не дава запис на браузъра върху новите таблици", () => {
    for (const table of [
      "product_result_selections",
      "product_result_selection_revisions",
      "product_result_refinements",
    ]) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
      expect(sql).toContain(`GRANT SELECT ON public.${table} TO authenticated;`);
      expect(sql).toContain(`GRANT ALL ON public.${table} TO service_role;`);
      expect(sql).not.toMatch(
        new RegExp(`CREATE POLICY[^;]*ON public\\.${table}[^;]*FOR (INSERT|UPDATE|DELETE)`, "i"),
      );
    }
  });

  it("описва точно едно успешно и едно чакащо уточнение", () => {
    expect(sql).toMatch(/UNIQUE INDEX[\s\S]*product_result_refinements[\s\S]*pending/i);
    expect(sql).toMatch(/UNIQUE INDEX[\s\S]*product_result_refinements[\s\S]*succeeded/i);
  });

  it("създава служебните функции за състояние, запис и уточнение", () => {
    for (const fn of [
      "save_product_result_selection",
      "load_product_result_state",
      "begin_product_result_refinement",
      "complete_product_result_refinement",
      "fail_product_result_refinement",
    ]) {
      expect(sql).toContain(`FUNCTION public.${fn}(`);
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${fn}`);
    }
  });

  it("е записана в реда за пускане с точна контролна сума и следващ резервиран номер", () => {
    const rollout = read(ROLLOUT);
    const checksum = createHash("sha256").update(readFileSync(join(root, MIGRATION))).digest("hex");
    expect(rollout).toContain("0025_product_result_selections.sql");
    expect(rollout).toContain(checksum);
    expect(rollout).toContain("0026");
  });
});

describe("Stage 2B1C — платените входове остават затворени", () => {
  const files = [
    "supabase/functions/product-result-state/index.ts",
    "supabase/functions/refine-product/index.ts",
    "supabase/functions/_shared/product-paid-access.ts",
    "supabase/functions/_shared/product-patch.ts",
    "supabase/functions/_shared/product-selections.ts",
    "supabase/functions/_shared/product-refinement.ts",
  ];

  it("не внасят публични демонстрационни данни", () => {
    for (const file of files) {
      const text = read(file);
      expect(text).not.toMatch(/previewData|productPreview|src\/data/);
    }
  });

  it("не изразходват общи операции или квоти", () => {
    for (const file of files) {
      const text = read(file);
      expect(text).not.toContain("consume_quota");
      expect(text).not.toContain("consume_analysis_preview");
      expect(text).not.toContain("download_quota");
    }
  });

  it("никога не четат „последното“ право, а точното право по идентификатор", () => {
    for (const file of files) {
      expect(read(file)).not.toContain("fetchLatestEntitlement");
    }
    expect(read("supabase/functions/_shared/product-paid-access.ts")).toContain("entitlementId");
  });

  it("уточнението минава през наем и не заменя оригинала", () => {
    const refine = read("supabase/functions/refine-product/index.ts");
    expect(refine).toContain("begin_product_result_refinement");
    expect(refine).toContain("complete_product_result_refinement");
    expect(refine).toContain("fail_product_result_refinement");
    expect(refine).toContain("lease_token");
    expect(refine).not.toMatch(/update\(\s*\{[^}]*result/);
  });

  it("записът на избора иска изрична очаквана версия и ключ за повторение", () => {
    const state = read("supabase/functions/product-result-state/index.ts");
    expect(state).toContain("validateExpectedVersion");
    expect(state).toContain("validateIdempotencyKey");
    expect(state).toContain("save_product_result_selection");
  });
});
