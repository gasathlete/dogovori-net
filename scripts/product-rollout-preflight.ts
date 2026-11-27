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

/**
 * Returns the names of CHECK constraints whose own parenthesised body contains a
 * subquery. Only the balanced CHECK body is scanned, so unrelated SELECT
 * statements elsewhere in the surrounding DO blocks are never flagged.
 */
export function checkConstraintsWithSubquery(sql: string): string[] {
  const offenders: string[] = [];
  const header = /ADD\s+CONSTRAINT\s+([A-Za-z0-9_."]+)\s+CHECK\s*\(/gi;
  for (let match = header.exec(sql); match; match = header.exec(sql)) {
    let depth = 1;
    let index = match.index + match[0].length;
    const start = index;
    while (index < sql.length && depth > 0) {
      const char = sql[index];
      if (char === "(") depth += 1;
      else if (char === ")") depth -= 1;
      index += 1;
    }
    const body = sql.slice(start, Math.max(start, index - 1));
    if (/\bSELECT\b/i.test(body)) offenders.push(match[1]);
  }
  return offenders;
}

/** Всички продуктови таблици, въведени от базовата миграция и 0018–0025. */
export const PRODUCT_TABLES = [
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
] as const;

/** Таблиците, които собственикът законно чете (само SELECT). */
export const PRODUCT_OWNER_READ_TABLES = [
  "product_checkout_intakes",
  "product_entitlements",
  "product_result_selections",
  "product_result_selection_revisions",
  "product_result_refinements",
] as const;

export const PRODUCT_ACL_MIGRATION = "drizzle/migrations/0026_product_acl_hardening.sql";
export const PRODUCT_ACL_REVIEW = "docs/migrations/stage2b1d_product_acl_hardening.sql";

/** Само изпълнимият SQL: обяснителните коментари нарочно назовават забраненото. */
export function stripSqlComments(sql: string): string {
  return sql.split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n");
}

/** Семантична проверка на 0026: отнемане първо, минимални права след това. */
export function validateAclHardening(source: RolloutSource): string[] {
  const failures: string[] = [];
  let sql: string;
  try {
    sql = stripSqlComments(source.read(PRODUCT_ACL_MIGRATION));
    if (source.read(PRODUCT_ACL_MIGRATION) !== source.read(PRODUCT_ACL_REVIEW)) {
      failures.push("0026 mirror drift");
    }
  } catch {
    return ["0026 ACL migration or review file missing"];
  }
  for (const table of PRODUCT_TABLES) {
    if (!sql.includes(`REVOKE ALL PRIVILEGES ON TABLE public.${table} FROM PUBLIC, anon, authenticated;`)) {
      failures.push(`0026 missing table revoke: ${table}`);
    }
    if (!sql.includes(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${table} TO service_role;`)) {
      failures.push(`0026 missing service_role table grant: ${table}`);
    }
    const ownerRead = (PRODUCT_OWNER_READ_TABLES as readonly string[]).includes(table);
    const grant = sql.includes(`GRANT SELECT ON TABLE public.${table} TO authenticated;`);
    if (ownerRead !== grant) failures.push(`0026 owner-read grant mismatch: ${table}`);
  }
  if (/GRANT[^;]*TO\s+anon/i.test(sql)) failures.push("0026 grants a privilege to anon");
  if (/ALTER\s+DEFAULT\s+PRIVILEGES/i.test(sql)) failures.push("0026 mutates default privileges");
  if (/DROP\s+(TABLE|COLUMN|POLICY|FUNCTION|TRIGGER)|TRUNCATE|DELETE\s+FROM|INSERT\s+INTO|UPDATE\s+public\./i.test(sql)) {
    failures.push("0026 contains a destructive or data-mutating statement");
  }
  for (const clause of [
    "REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC",
    "REVOKE ALL PRIVILEGES ON FUNCTION %s FROM anon",
    "REVOKE ALL PRIVILEGES ON FUNCTION %s FROM authenticated",
    "GRANT EXECUTE ON FUNCTION %s TO service_role",
    "pg_get_function_identity_arguments(p.oid)",
    "GRANT EXECUTE ON FUNCTION public.product_job_status(uuid) TO authenticated;",
    "CREATE OR REPLACE FUNCTION public.product_rollout_capability()",
    "SECURITY DEFINER SET search_path = ''",
    "'0026_product_acl_hardening'",
    "REVOKE ALL PRIVILEGES ON FUNCTION public.product_rollout_capability() FROM PUBLIC, anon, authenticated;",
    "GRANT EXECUTE ON FUNCTION public.product_rollout_capability() TO service_role;",
  ]) {
    if (!sql.includes(clause)) failures.push(`0026 missing function ACL clause: ${clause}`);
  }
  for (const name of [
    "record_product_purchase",
    "claim_product_job",
    "product_job_status",
    "load_product_result_state",
    "complete_product_result_refinement_call",
    "bind_product_entitlement_policy",
  ]) {
    if (!sql.includes(`'${name}'`)) failures.push(`0026 function allowlist missing: ${name}`);
  }
  return failures;
}


export function validateProductRollout(source: RolloutSource): string[] {
  const failures: string[] = [];
  const fail = (message: string) => failures.push(message);
  let manifest: { base: Migration; migrations: Migration[]; journalPolicy: string };
  let contract: JsonRecord & {
    expectedMigration: string;
    schemaCapability: { rpc: string; args: JsonRecord; expected: JsonRecord; readOnly: boolean };
    functionalAcceptance: { migration: string; rpc: string; expected: JsonRecord; readOnly: boolean };
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
    for (const constraint of checkConstraintsWithSubquery(base)) {
      fail(`CHECK constraint contains a forbidden subquery: ${constraint}`);
    }
    const allowedKeysExpression = "(context - ARRAY['role', 'objective', 'counterparty_context', 'preferred_position']::text[]) = '{}'::jsonb";
    if (!base.includes(allowedKeysExpression)) fail("base context constraint must use the immutable JSONB subtraction expression");
  } catch {
    fail("base migration or review file missing");
  }

  // Приложената верига и източниковите (още неприложени) миграции се проверяват
  // поотделно: неприложена миграция НИКОГА не се брои като част от веригата.
  const appliedChain = manifest.migrations.filter((m) => (m as { applied?: unknown }).applied !== false);
  const pending = manifest.migrations.filter((m) => (m as { applied?: unknown }).applied === false);
  if (appliedChain.length !== 9) fail("migration manifest must contain exactly 0018–0026");
  for (const migration of pending) {
    const paired = (migration as unknown as { pairedFile?: string }).pairedFile;
    if (!paired) fail(`pending migration lacks its paired copy: ${migration.id}`);
    try {
      const executable = source.read(migration.file);
      if (executable !== source.read(paired!)) fail(`pending migration pair drift: ${migration.id}`);
      if (sha256(executable) !== migration.sha256) fail(`pending migration checksum drift: ${migration.id}`);
    } catch { fail(`pending migration file missing: ${migration.id}`); }
  }
  let dependency = "20260910090000_product_checkout_entitlements";
  for (let index = 0; index < appliedChain.length; index++) {
    const migration = appliedChain[index];
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

  if (contract.expectedMigration !== "0026_product_acl_hardening") fail("expected migration is not 0026");
  if (
    contract.schemaCapability?.rpc !== "product_rollout_capability" ||
    contract.schemaCapability?.readOnly !== true ||
    contract.schemaCapability?.expected?.ok !== true ||
    contract.schemaCapability?.expected?.migration !== "0026_product_acl_hardening" ||
    JSON.stringify(contract.schemaCapability?.args) !== "{}"
  ) {
    fail("0026 read-only schema capability declaration mismatch");
  }
  if (
    contract.functionalAcceptance?.migration !== "0025_product_result_selections" ||
    contract.functionalAcceptance?.rpc !== "load_product_result_state" ||
    contract.functionalAcceptance?.readOnly !== true ||
    contract.functionalAcceptance?.expected?.ok !== false ||
    contract.functionalAcceptance?.expected?.reason !== "not_found"
  ) {
    fail("0025 functional acceptance declaration mismatch");
  }
  for (const failure of validateAclHardening(source)) fail(failure);
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
  const integrationConfig = source.read("supabase/functions/_shared/product-integration-config.ts");
  if (!includesAll(integration, [contract.schemaCapability.rpc, 'from "./product-integration-config.ts"']) ||
      !includesAll(integrationConfig, [contract.expectedMigration, 'env(key) === "true"'])) fail("runtime fail-closed integration contract mismatch");
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
  console.log("[product-rollout-preflight] PASS: 9 migrations, 3 products, fail-closed gates; no network used.");
  return 0;
}
if (process.argv[1]?.endsWith("product-rollout-preflight.ts")) {
  process.exitCode = runProductRolloutPreflight();
}