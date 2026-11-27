import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkConstraintsWithSubquery, validateProductRollout, type RolloutSource } from "../../scripts/product-rollout-preflight";

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
    ["unsafe runtime flag", "supabase/functions/_shared/product-integration-config.ts", (s: string) => s.replace('env(key) === "true"', 'env(key) !== "false"'), "runtime fail-closed"],
    ["disconnected runtime config", "supabase/functions/_shared/product-integration.ts", (s: string) => s.split('from "./product-integration-config.ts"').join('from "./wrong-config.ts"'), "runtime fail-closed"],
    ["missing env declaration", "config/product-rollout-contract.json", (s: string) => s.replace('    "APP_BASE_URL",\n', ""), "allowlist"],
    ["wrong environment", "config/product-rollout-contract.json", (s: string) => s.replace('"sandbox", "live"', '"preview", "live"'), "environment separation"],
    ["wrong product ID", "config/product-rollout-contract.json", (s: string) => s.replace('"id": "contract_check"', '"id": "contract_scan"'), "product ID/price"],
    ["wrong product price", "config/product-rollout-contract.json", (s: string) => s.replace('"amountCents": 299', '"amountCents": 300'), "product ID/price"],
    ["wrong currency", "config/product-rollout-contract.json", (s: string) => s.replace('"currency": "eur"', '"currency": "usd"'), "currency/tax"],
    ["unsafe flag default", "config/product-rollout-contract.json", (s: string) => s.replace('"default": false', '"default": true'), "unsafe feature flag"],
    ["partial schema", "config/product-rollout-contract.json", (s: string) => s.replace(', "schema_capability"', ""), "prepayment gate"],
    ["stale expected migration", "config/product-rollout-contract.json", (s: string) => s.replace('"0026_product_acl_hardening",\n  "schemaCapability"', '"0025_product_result_selections",\n  "schemaCapability"'), "expected migration is not 0026"],
    ["wrong capability rpc", "config/product-rollout-contract.json", (s: string) => s.replace('"rpc": "product_rollout_capability"', '"rpc": "load_product_result_state"'), "0026 read-only schema capability"],
    ["capability with arguments", "config/product-rollout-contract.json", (s: string) => s.replace('"args": {}', '"args": { "p_user_id": "x" }'), "0026 read-only schema capability"],
    ["missing 0025 functional acceptance", "config/product-rollout-contract.json", (s: string) => s.replace('"rpc": "load_product_result_state"', '"rpc": "product_rollout_capability"'), "0025 functional acceptance"],
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
      s.replace(/stripe_event_id/g, "event_proof").replace(/stripe_session_id/g, "session_proof"));
    expect(validateProductRollout(source).join("\n")).toContain("webhook entitlement idempotency");
  });

  it("keeps base executable and review byte-identical with the manifest SHA", () => {
    const base = disk.read("supabase/migrations/20260910090000_product_checkout_entitlements.sql");
    expect(base).toEqual(disk.read("docs/migrations/stage2a_product_checkout_entitlements.sql"));
    const manifest = JSON.parse(disk.read("docs/migrations/product-rollout-manifest.json")) as { base: { sha256: string } };
    expect(manifest.base.sha256).toBe("9b27341a7dcd5a0988663a4b8479417235935bea1f0526f5e340a08a627f26b2");
  });

  it("uses the immutable JSONB subtraction instead of a subquery for unknown context keys", () => {
    const expression = "(context - ARRAY['role', 'objective', 'counterparty_context', 'preferred_position']::text[]) = '{}'::jsonb";
    for (const path of [
      "supabase/migrations/20260910090000_product_checkout_entitlements.sql",
      "docs/migrations/stage2a_product_checkout_entitlements.sql",
    ]) {
      const sql = disk.read(path);
      expect(sql).toContain(expression);
      expect(checkConstraintsWithSubquery(sql)).toEqual([]);
    }
  });

  it("rejects the exact SQLSTATE 0A000 regression in product_checkout_intakes_context_ck", () => {
    const invalid = `
DO $$ BEGIN
  ALTER TABLE public.product_checkout_intakes
    ADD CONSTRAINT product_checkout_intakes_context_ck CHECK (
      jsonb_typeof(context) = 'object'
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_object_keys(context) AS k
        WHERE k NOT IN ('role')
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;`;
    expect(checkConstraintsWithSubquery(invalid)).toEqual(["product_checkout_intakes_context_ck"]);
    const source = override("supabase/migrations/20260910090000_product_checkout_entitlements.sql", (s) =>
      s.replace(
        "(context - ARRAY['role', 'objective', 'counterparty_context', 'preferred_position']::text[]) = '{}'::jsonb",
        "NOT EXISTS (SELECT 1 FROM jsonb_object_keys(context) AS k WHERE k NOT IN ('role'))",
      ));
    expect(validateProductRollout(source).join("\n")).toContain("forbidden subquery: product_checkout_intakes_context_ck");
  });

  it("does not flag SELECT statements outside a CHECK body", () => {
    const benign = `
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.product_checkout_intakes;
  ALTER TABLE public.product_checkout_intakes
    ADD CONSTRAINT ok_ck CHECK (jsonb_typeof(context) = 'object' AND (context - ARRAY['role']::text[]) = '{}'::jsonb);
  PERFORM (SELECT 1);
END $$;`;
    expect(checkConstraintsWithSubquery(benign)).toEqual([]);
  });
});