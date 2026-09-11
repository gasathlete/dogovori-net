import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateProductRollout, type RolloutSource } from "../../scripts/product-rollout-preflight";

const root = process.cwd();
const disk: RolloutSource = { read: (path) => readFileSync(resolve(root, path), "utf8") };
const override = (path: string, transform: (source: string) => string): RolloutSource => ({
  read: (candidate) => candidate === path ? transform(disk.read(candidate)) : disk.read(candidate),
});

describe("network-silent product rollout preflight", () => {
  it("accepts the canonical source package", () => {
    expect(validateProductRollout(disk)).toEqual([]);
  });

  it.each([
    ["missing env declaration", "config/product-rollout-contract.json", (s: string) => s.replace('    "APP_BASE_URL",\n', ""), "allowlist"],
    ["wrong environment", "config/product-rollout-contract.json", (s: string) => s.replace('"sandbox", "live"', '"preview", "live"'), "environment separation"],
    ["wrong product price", "config/product-rollout-contract.json", (s: string) => s.replace('"amountCents": 299', '"amountCents": 300'), "product ID/price"],
    ["unsafe flag default", "config/product-rollout-contract.json", (s: string) => s.replace('"default": false', '"default": true'), "unsafe feature flag"],
    ["partial schema", "config/product-rollout-contract.json", (s: string) => s.replace(', "schema_capability"', ""), "prepayment gate"],
    ["migration order", "docs/migrations/product-rollout-manifest.json", (s: string) => s.replace('"dependsOn": "0023_product_generation_artifacts_correction"', '"dependsOn": "0022_product_generation_artifacts"'), "dependency mismatch"],
    ["migration drift", "drizzle/migrations/0025_product_result_selections.sql", (s: string) => `${s}\n-- drift`, "migration mirror drift"],
    ["fixture leakage", "supabase/functions/refine-product/index.ts", (s: string) => `import x from "../../src/data/previewData";\n${s}`, "public demo/fixture"],
    ["fulfilment disables entitlement", "supabase/functions/_shared/product-paid-access.ts", (s: string) => `${s}\nconst PRODUCT_AI_FULFILLMENT_ENABLED = false;`, "invalidates existing paid access"],
  ])("rejects %s", (_name, path, mutate, expected) => {
    expect(validateProductRollout(override(path, mutate)).join("\n")).toContain(expected);
  });

  it("rejects a missing declaration without reading secret values", () => {
    const missing: RolloutSource = {
      read(path) {
        if (path === "config/product-rollout-contract.json") throw new Error("missing");
        return disk.read(path);
      },
    };
    expect(validateProductRollout(missing)[0]).toContain("configuration declaration missing");
  });

  it("requires webhook and entitlement idempotency evidence", () => {
    const source = override("supabase/functions/payments-webhook/handlers.ts", (s) =>
      s.replaceAll("stripe_event_id", "event_proof").replaceAll("stripe_session_id", "session_proof"));
    expect(validateProductRollout(source).join("\n")).toContain("webhook entitlement idempotency");
  });
});