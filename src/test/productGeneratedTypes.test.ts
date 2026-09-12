import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Генерираните типове трябва да отразяват ТОЧНО живата схема след прилагането на
 * коригираната база и 0018–0025: всички продуктови таблици и RPC подписи, и нито
 * едно име на помощна (drop-ната) таблица от прозореца по поддръжка.
 */
const TYPES = readFileSync("src/integrations/supabase/types.ts", "utf8");

const PRODUCT_TABLES = [
  "product_checkout_intakes",
  "product_entitlements",
  "product_fulfillment_jobs",
  "product_fulfillment_checkpoints",
  "product_generation_calls",
  "product_generation_artifacts",
  "product_result_selections",
  "product_result_selection_revisions",
  "product_result_refinements",
  "product_result_refinement_calls",
];

const PRODUCT_RPCS = [
  "record_product_purchase",
  "begin_product_fulfillment",
  "complete_product_fulfillment",
  "claim_product_job",
  "product_job_status",
  "load_product_result_state",
  "save_product_result_selection",
  "begin_product_result_refinement",
];

describe("генерираните типове са сверени с живата схема", () => {
  it("не съдържа помощната таблица от прозореца по поддръжка", () => {
    expect(TYPES).not.toContain("__codex_product_migration_stage_20260912");
    expect(TYPES).not.toMatch(/__codex|_migration_stage_/);
  });

  it("съдържа всяка продуктова таблица с колони и връзки", () => {
    for (const table of PRODUCT_TABLES) {
      expect(TYPES, table).toContain(`      ${table}: {`);
    }
    const entitlements = TYPES.slice(TYPES.indexOf("      product_entitlements: {"));
    for (const column of ["source_hash", "refinements_included", "stripe_price_lookup_key"]) {
      expect(entitlements.slice(0, 6000), column).toContain(column);
    }
    expect(TYPES).toContain("Relationships:");
  });

  it("съдържа продуктовите RPC подписи", () => {
    for (const rpc of PRODUCT_RPCS) {
      expect(TYPES, rpc).toContain(`      ${rpc}: {`);
    }
  });
});
