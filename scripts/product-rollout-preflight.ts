/** Network-silent source preflight for the one-time product rollout. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type JsonRecord = Record<string, unknown>;
type Migration = {
  id: string; file: string; review: string; sha256: string; dependsOn: string;
  purpose: string; objects: string[]; preapply: string[]; verify: string[]; recovery: string;
};
export interface RolloutSource { read(path: string): string }
const diskSource = (root: string): RolloutSource => ({ read: (path) => readFileSync(resolve(root, path), "utf8") });
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const parse = <T>(source: RolloutSource, path: string): T => JSON.parse(source.read(path)) as T;

const EXPECTED_PRODUCTS = [
  { id: "contract_check", lookupKey: "contract_check_299", amountCents: 299, refinementsIncluded: 0 },
  { id: "contract_improve", lookupKey: "contract_improve_399", amountCents: 399, refinementsIncluded: 0 },
  { id: "negotiation_package", lookupKey: "negotiation_package_799", amountCents: 799, refinementsIncluded: 1 },
] as const;
const EXPECTED_ENV = [
  "APP_BASE_URL", "LOVABLE_API_KEY", "PAYMENTS_LIVE_WEBHOOK_SECRET", "PAYMENTS_SANDBOX_WEBHOOK_SECRET",
  "PRODUCT_AI_FULFILLMENT_ENABLED", "PRODUCT_AI_ZERO_RETENTION_VERIFIED", "PRODUCT_CHECKOUT_ENABLED",
  "STRIPE_LIVE_API_KEY", "STRIPE_SANDBOX_API_KEY", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_URL",
] as const;
const includesAll = (text: string, values: readonly string[]) => values.every((value) => text.includes(value));

export function validateProductRollout(source: RolloutSource): string[] {
  const failures: string[] = [];
  const fail = (message: string) => failures.push(message);
  let manifest: { base: Migration; migrations: Migration[]; journalPolicy: string };
  let contract: JsonRecord & {
    expectedMigration: string;
    schemaCapability: { rpc: string; expected: JsonRecord; readOnly: boolean };
    products: typeof EXPECTED_PRODUCTS; envNameAllowlist: string[];
    flags: { name: string; enabledValue: string; default: boolean }[];
    environmentNames: string[]; prepaymentGates: string[]; paidPathFiles: string[];
  };
  try {
    manifest = parse(source, "docs/migrations/product-rollout-manifest.json");
    contract = parse(source, "config/product-rollout-contract.json");
  } catch (error) {
    return [`configuration declaration missing or invalid: ${(error as Error).message}`];
  }

  try {
    const base = source.read(manifest.base.file);
    if (base !== source.read(manifest.base.review)) fail("base migration mirror drift");
    if (sha256(base) !== manifest.base.sha256) fail("base migration checksum drift");
  } catch {
    fail("base migration or review file missing");
  }

  if (manifest.migrations.length !== 8) fail("migration manifest must contain exactly 0018–0025");
  let dependency = "20260910090000_product_checkout_entitlements";
  for (let index = 0; index < manifest.migrations.length; index++) {
    const migration = manifest.migrations[index];
    const prefix = String(index + 18).padStart(4, "0") + "_";
    if (!migration.id.startsWith(prefix)) fail(`migration order mismatch at ${migration.id}`);
    if (migration.dependsOn !== dependency) fail(`dependency mismatch at ${migration.id}`);
    dependency = migration.id;
    if (!migration.purpose || !migration.objects?.length || !migration.preapply?.length || !migration.verify?.length || !migration.recovery) {
      fail(`missing dependency/check/recovery declaration at ${migration.id}`);
    }
    try {
      const executable = source.read(migration.file);
      if (executable !== source.read(migration.review)) fail(`migration mirror drift: ${migration.id}`);
      if (sha256(executable) !== migration.sha256) fail(`migration checksum drift: ${migration.id}`);
      if (!executable.includes("BEGIN;") || !executable.trimEnd().endsWith("COMMIT;")) fail(`migration transaction boundary missing: ${migration.id}`);
    } catch { fail(`migration or review file missing: ${migration.id}`); }
  }
  if (!manifest.journalPolicy?.includes("not-recorded")) fail("manual journal policy is undeclared");

  if (contract.expectedMigration !== "0025_product_result_selections") fail("expected migration is not 0025");
  if (contract.schemaCapability?.rpc !== "load_product_result_state" || contract.schemaCapability?.readOnly !== true || contract.schemaCapability?.expected?.reason !== "not_found") {
    fail("0025 read-only schema capability declaration mismatch");
  }
  if (JSON.stringify(contract.products) !== JSON.stringify(EXPECTED_PRODUCTS)) fail("product ID/price/currency contract mismatch");
  if (contract.currency !== "eur" || contract.taxBehavior !== "inclusive" || contract.priceType !== "one_time") fail("currency/tax/price type mismatch");
  if (JSON.stringify(contract.environmentNames) !== JSON.stringify(["sandbox", "live"])) fail("environment separation mismatch");
  if (JSON.stringify([...contract.envNameAllowlist].sort()) !== JSON.stringify([...EXPECTED_ENV].sort())) fail("environment name allowlist mismatch");
  if (contract.flags.length !== 3 || contract.flags.some((flag) => flag.enabledValue !== "true" || flag.default !== false)) fail("unsafe feature flag default");
  const gates = ["database", "exact_stripe_mapping", "webhook", "fulfillment", "gateway", "zero_retention", "legal_sources", "privacy_residency", "schema_capability"];
  if (!gates.every((gate) => contract.prepaymentGates.includes(gate))) fail("prepayment gate declaration incomplete");

  const frontend = source.read("src/lib/products.ts");
  const backend = source.read("supabase/functions/_shared/product-purchase.ts");
  const sql = source.read("supabase/migrations/20260910090000_product_checkout_entitlements.sql");
  for (const product of EXPECTED_PRODUCTS) {
    if (!includesAll(frontend, [`id: "${product.id}"`, `priceEur: ${product.amountCents / 100}`])) fail(`frontend product parity mismatch: ${product.id}`);
    if (!includesAll(backend, [product.id, product.lookupKey, `amountCents: ${product.amountCents}`, "currency: PRODUCT_CURRENCY", 'priceType: "one_time"'])) fail(`backend product parity mismatch: ${product.id}`);
    if (!includesAll(sql, [`product_id = '${product.id}'`, `expected_amount_cents = ${product.amountCents}`, `stripe_price_lookup_key = '${product.lookupKey}'`])) fail(`SQL product parity mismatch: ${product.id}`);
  }
  const integration = source.read("supabase/functions/_shared/product-integration.ts");
  if (!includesAll(integration, [contract.expectedMigration, contract.schemaCapability.rpc, 'env(key) === "true"'])) fail("runtime fail-closed integration contract mismatch");
  const checkout = source.read("supabase/functions/create-product-checkout/index.ts");
  const stripeCreateAt = checkout.indexOf("stripe.checkout.sessions.create");
  for (const marker of ["productPrepaymentBlockers", "requireProductPrice", "assertEnvironmentAllowed"]) {
    const markerAt = checkout.indexOf(marker);
    if (markerAt < 0 || stripeCreateAt < 0 || markerAt > stripeCreateAt) fail(`checkout gate must precede Stripe session creation: ${marker}`);
  }
  for (const path of contract.paidPathFiles) {
    if (/from\s+["'][^"']*(fixture|previewData|ProductDemo)/i.test(source.read(path))) fail(`public demo/fixture import in paid path: ${path}`);
  }
  if (/PRODUCT_AI_FULFILLMENT_ENABLED|productFulfillmentBlockers/.test(source.read("supabase/functions/_shared/product-paid-access.ts"))) fail("fulfillment-off invalidates existing paid access");
  const webhook = source.read("supabase/functions/payments-webhook/handlers.ts");
  if (!includesAll(webhook, ["record_product_purchase", "stripe_event_id", "stripe_session_id"])) fail("webhook entitlement idempotency proof missing");
  return failures;
}

export function runProductRolloutPreflight(root = process.cwd()): number {
  const failures = validateProductRollout(diskSource(root));
  if (failures.length) {
    console.error(`[product-rollout-preflight] FAILED (${failures.length})`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    return 1;
  }
  console.log("[product-rollout-preflight] PASS: 8 migrations, 3 products, fail-closed gates; no network used.");
  return 0;
}
if (process.argv[1]?.endsWith("product-rollout-preflight.ts")) {
  process.exitCode = runProductRolloutPreflight();
}