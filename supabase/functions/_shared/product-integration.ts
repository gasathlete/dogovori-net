/**
 * Конфигурационната граница на платените продукти: какво трябва да е налично,
 * за да е позволено плащане и обработка — и как се проваля затворено.
 *
 * Модулът е чист по отношение на средата: env се подава като функция, а базата
 * като минимален клиент. Затова същите решения се тестват без мрежа и без Deno.
 *
 * НИКОГА не изнася стойности на тайни, ценови идентификатори, идентификатори на
 * редове или вътрешни съобщения на доставчик.
 */
import { PRODUCT_GENERATION_POLICY_VERSION } from "./product-generation-policy.ts";
import { isLegalKnowledgeBaseReady, type LegalDbClient } from "./product-legal-basis.ts";
import type { VerifierDeps } from "./legal-verification.ts";
import { productTrustedSourceBlockers } from "./product-trusted-source.ts";

export type EnvReader = (key: string) => string | undefined;

/** Последната миграция, която ТРЯБВА да е приложена преди включване. */
export const PRODUCT_EXPECTED_MIGRATION =
  "0026_product_acl_hardening" as const;

export const PRODUCT_INTEGRATION_ENV = Object.freeze({
  gatewayKey: "LOVABLE_API_KEY",
  zeroRetention: "PRODUCT_AI_ZERO_RETENTION_VERIFIED",
  checkoutEnabled: "PRODUCT_CHECKOUT_ENABLED",
  fulfillmentEnabled: "PRODUCT_AI_FULFILLMENT_ENABLED",
  supabaseUrl: "SUPABASE_URL",
  serviceRoleKey: "SUPABASE_SERVICE_ROLE_KEY",
  sandboxStripeKey: "STRIPE_SANDBOX_API_KEY",
  liveStripeKey: "STRIPE_LIVE_API_KEY",
  sandboxWebhookSecret: "PAYMENTS_SANDBOX_WEBHOOK_SECRET",
  liveWebhookSecret: "PAYMENTS_LIVE_WEBHOOK_SECRET",
});

export type ProductIntegrationCode =
  | "checkout_disabled"
  | "fulfillment_disabled"
  | "gateway_key_missing"
  | "zero_retention_unverified"
  | "database_not_bound"
  | "stripe_not_configured"
  | "legal_kb_not_ready"
  | "residency_not_allowed"
  | "migration_not_verified"
  | "policy_version_mismatch"
  | "trusted_source_unavailable";

/** Кратки, човешки съобщения. Без доставчик, без тайни, без технически детайли. */
export const PRODUCT_INTEGRATION_MESSAGES: Readonly<Record<ProductIntegrationCode, string>> =
  Object.freeze({
    checkout_disabled: "Плащането за този продукт е временно спряно.",
    fulfillment_disabled: "Обработката е временно спряна. Плащане не се извършва.",
    gateway_key_missing: "Обработката още не е включена. Плащане не се извършва.",
    zero_retention_unverified: "Обработката още не е включена. Плащане не се извършва.",
    database_not_bound: "Услугата е временно недостъпна. Опитайте по-късно.",
    stripe_not_configured: "Плащането е временно недостъпно.",
    legal_kb_not_ready: "Обработката още не е включена. Плащане не се извършва.",
    migration_not_verified: "Обработката още не е включена. Плащане не се извършва.",
    residency_not_allowed:
      "По Ваша настройка обработката с изкуствен интелект е ограничена до ЕИП. Променете настройката, за да продължите.",
    trusted_source_unavailable:
      "Проверката на произхода на документа още не е налична. Плащане не се извършва и нищо не се обработва.",
    policy_version_mismatch:
      "Правилата за обработка са обновени. Започнете отначало, за да е ясно какво получавате.",
  });

export function productIntegrationMessage(code: ProductIntegrationCode): string {
  return PRODUCT_INTEGRATION_MESSAGES[code];
}

/** Флаг е включен САМО при точен низ "true". Всичко друго е затворено. */
function flag(env: EnvReader, key: string): boolean {
  return env(key) === "true";
}

function present(env: EnvReader, key: string): boolean {
  const value = env(key);
  return typeof value === "string" && value.trim().length > 0;
}

export interface ProductStripeEnvironmentConfig {
  readonly apiKeyPresent: boolean;
  readonly webhookSecretPresent: boolean;
  readonly configured: boolean;
}

export interface ProductIntegrationConfig {
  readonly checkoutEnabled: boolean;
  readonly fulfillmentEnabled: boolean;
  readonly gatewayKeyPresent: boolean;
  readonly zeroRetentionVerified: boolean;
  readonly databaseBound: boolean;
  readonly stripe: Readonly<Record<"sandbox" | "live", ProductStripeEnvironmentConfig>>;
  readonly policyVersion: typeof PRODUCT_GENERATION_POLICY_VERSION;
  readonly expectedMigration: typeof PRODUCT_EXPECTED_MIGRATION;
}

export function readProductIntegrationConfig(env: EnvReader): ProductIntegrationConfig {
  const stripeFor = (
    apiKey: string,
    webhookSecret: string,
  ): ProductStripeEnvironmentConfig => {
    const apiKeyPresent = present(env, apiKey);
    const webhookSecretPresent = present(env, webhookSecret);
    return Object.freeze({
      apiKeyPresent,
      webhookSecretPresent,
      configured: apiKeyPresent && webhookSecretPresent,
    });
  };
  return Object.freeze({
    // Затворено по подразбиране: включването е ИЗРИЧНО действие на оператора.
    checkoutEnabled: flag(env, PRODUCT_INTEGRATION_ENV.checkoutEnabled),
    fulfillmentEnabled: flag(env, PRODUCT_INTEGRATION_ENV.fulfillmentEnabled),
    gatewayKeyPresent: present(env, PRODUCT_INTEGRATION_ENV.gatewayKey),
    zeroRetentionVerified: flag(env, PRODUCT_INTEGRATION_ENV.zeroRetention),
    databaseBound: present(env, PRODUCT_INTEGRATION_ENV.supabaseUrl) &&
      present(env, PRODUCT_INTEGRATION_ENV.serviceRoleKey),
    stripe: Object.freeze({
      sandbox: stripeFor(
        PRODUCT_INTEGRATION_ENV.sandboxStripeKey,
        PRODUCT_INTEGRATION_ENV.sandboxWebhookSecret,
      ),
      live: stripeFor(
        PRODUCT_INTEGRATION_ENV.liveStripeKey,
        PRODUCT_INTEGRATION_ENV.liveWebhookSecret,
      ),
    }),
    policyVersion: PRODUCT_GENERATION_POLICY_VERSION,
    expectedMigration: PRODUCT_EXPECTED_MIGRATION,
  });
}

/**
 * Готовност за ПЛАЩАНЕ на продукт в точно едно окръжение.
 *
 * Плащането е ПРЕСИЧАНЕ: продава се само това, което може да бъде изпълнено.
 * Затова тук влизат и условията на обработката. Изключването на обработката
 * спира НОВИ покупки веднага. Вече платените права остават непокътнати —
 * недостъпната обработка НИКОГА не променя истината за плащане.
 */
export function productCheckoutBlockers(
  config: ProductIntegrationConfig,
  environment: "sandbox" | "live",
): readonly ProductIntegrationCode[] {
  const codes: ProductIntegrationCode[] = [];
  if (!config.checkoutEnabled) codes.push("checkout_disabled");
  if (!config.databaseBound) codes.push("database_not_bound");
  if (!config.stripe[environment].configured) codes.push("stripe_not_configured");
  for (const code of productFulfillmentBlockers(config)) {
    if (!codes.includes(code)) codes.push(code);
  }
  return Object.freeze(codes);
}

/** Готовност за ОБРАБОТКА (без правната база, миграцията и residency). */
export function productFulfillmentBlockers(
  config: ProductIntegrationConfig,
): readonly ProductIntegrationCode[] {
  const codes: ProductIntegrationCode[] = [];
  if (!config.fulfillmentEnabled) codes.push("fulfillment_disabled");
  if (!config.gatewayKeyPresent) codes.push("gateway_key_missing");
  if (!config.zeroRetentionVerified) codes.push("zero_retention_unverified");
  if (!config.databaseBound) codes.push("database_not_bound");
  return Object.freeze(codes);
}

export interface ProductRpcProbeClient {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}

/**
 * Read-only способност, която ДОКАЗВА, че последната миграция (0026) е
 * приложена, включително затягането на правата.
 *
 * Пробата не приема аргументи, не пише, не заявява задача и не докосва
 * плащане. Изисква точно `ok = true` и точно съвпадение на името на
 * миграцията. Липсваща функция, грешка или различен отговор → ЗАТВОРЕНО.
 *
 * Функционалното приемане на 0025 (`load_product_result_state` →
 * `{ok:false, reason:"not_found"}`) остава отделна проверка при прилагането и
 * НЕ е тази способност.
 */
export const PRODUCT_MIGRATION_CAPABILITY_RPC = "product_rollout_capability" as const;

export async function isProductMigrationApplied(db: ProductRpcProbeClient): Promise<boolean> {
  try {
    const { data, error } = await db.rpc(PRODUCT_MIGRATION_CAPABILITY_RPC, {});
    return !error &&
      typeof data === "object" &&
      data !== null &&
      (data as { ok?: unknown }).ok === true &&
      (data as { migration?: unknown }).migration === PRODUCT_EXPECTED_MIGRATION;
  } catch {
    return false;
  }
}

/**
 * Асинхронните врати: правна база, доказана схема и разрешена обработка извън
 * ЕИП. Липсващ клиент означава ЗАТВОРЕНО, не „приемаме, че е наред“.
 */
export interface ProductServiceGates {
  readonly legalDb: LegalDbClient | null;
  readonly rpc: ProductRpcProbeClient | null;
  readonly residencyDb: ResidencyDbClient | null;
  readonly userId: string | null;
  /** Само за тестове: инжектиран регистър/часовник за строгата проверка. */
  readonly legalVerifier?: VerifierDeps;
}

async function asyncBlockers(
  gates: ProductServiceGates,
): Promise<ProductIntegrationCode[]> {
  // Произходът на източника е ПЪРВАТА асинхронна врата и не зависи от env.
  const codes: ProductIntegrationCode[] = [...productTrustedSourceBlockers()];
  if (!gates.rpc || !(await isProductMigrationApplied(gates.rpc))) {
    codes.push("migration_not_verified");
  }
  if (!gates.legalDb || !(await isLegalKnowledgeBaseReady(gates.legalDb, gates.legalVerifier))) {
    codes.push("legal_kb_not_ready");
  }
  if (
    !gates.residencyDb || !gates.userId ||
    !(await isProductAiResidencyAllowed(gates.residencyDb, gates.userId))
  ) {
    codes.push("residency_not_allowed");
  }
  return codes;
}

/**
 * Пълната проверка ПРЕДИ плащане: нито едно Stripe извикване и нито един запис
 * не се прави, докато всяко условие не е изпълнено.
 */
export async function productPrepaymentBlockers(
  config: ProductIntegrationConfig,
  environment: "sandbox" | "live",
  gates: ProductServiceGates,
): Promise<readonly ProductIntegrationCode[]> {
  const codes = [...productCheckoutBlockers(config, environment)];
  for (const code of await asyncBlockers(gates)) {
    if (!codes.includes(code)) codes.push(code);
  }
  return Object.freeze(codes);
}

/** Пълната проверка ПРЕДИ заявяване на задача и преди всяко извикване. */
export async function productFulfillmentIntegrationBlockers(
  config: ProductIntegrationConfig,
  gates: ProductServiceGates,
): Promise<readonly ProductIntegrationCode[]> {
  const codes = [...productFulfillmentBlockers(config)];
  for (const code of await asyncBlockers(gates)) {
    if (!codes.includes(code)) codes.push(code);
  }
  return Object.freeze(codes);
}

export interface ProductIntegrationReadiness {
  readonly checkout_ready: Readonly<Record<"sandbox" | "live", boolean>>;
  readonly fulfillment_ready: boolean;
  readonly supabase_bound: boolean;
  readonly gateway_key_present: boolean;
  readonly zero_retention_verified: boolean;
  readonly legal_kb_ready: boolean;
  readonly migration_ready: boolean;
  readonly stripe_configured: Readonly<Record<"sandbox" | "live", boolean>>;
  readonly policy_version: string;
  readonly expected_migration: string;
  readonly blockers: readonly ProductIntegrationCode[];
}

/**
 * Само безопасни булеви стойности и затворени кодове. Ако се изнесе през
 * endpoint, той трябва да е САМО за собственик/администратор.
 */
export async function productIntegrationReadiness(
  config: ProductIntegrationConfig,
  db: LegalDbClient | null,
  rpc: ProductRpcProbeClient | null = null,
  legalVerifier?: VerifierDeps,
): Promise<ProductIntegrationReadiness> {
  const legalReady = db ? await isLegalKnowledgeBaseReady(db, legalVerifier) : false;
  const migrationReady = rpc ? await isProductMigrationApplied(rpc) : false;
  const fulfillmentBlockers = [...productFulfillmentBlockers(config)];
  if (!migrationReady) fulfillmentBlockers.push("migration_not_verified");
  if (!legalReady) fulfillmentBlockers.push("legal_kb_not_ready");
  const trustedSource = productTrustedSourceBlockers();
  fulfillmentBlockers.push(...trustedSource);
  const checkoutFor = (environment: "sandbox" | "live") =>
    productCheckoutBlockers(config, environment).length === 0 && legalReady && migrationReady &&
    trustedSource.length === 0;
  return Object.freeze({
    checkout_ready: Object.freeze({
      sandbox: checkoutFor("sandbox"),
      live: checkoutFor("live"),
    }),
    fulfillment_ready: fulfillmentBlockers.length === 0,
    supabase_bound: config.databaseBound,
    gateway_key_present: config.gatewayKeyPresent,
    zero_retention_verified: config.zeroRetentionVerified,
    legal_kb_ready: legalReady,
    migration_ready: migrationReady,
    stripe_configured: Object.freeze({
      sandbox: config.stripe.sandbox.configured,
      live: config.stripe.live.configured,
    }),
    policy_version: config.policyVersion,
    expected_migration: config.expectedMigration,
    blockers: Object.freeze(
      Array.from(new Set([...productCheckoutBlockers(config, "live"), ...fulfillmentBlockers])),
    ),
  });
}

export interface ResidencyDbClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): { maybeSingle(): Promise<LegalQueryLike> };
    };
  };
}

interface LegalQueryLike {
  readonly data: unknown;
  readonly error: unknown;
}

/**
 * Предпочитанието за трета държава се проверява ПРЕДИ всяко извикване към
 * доставчик и се проваля ЗАТВОРЕНО: грешка в базата или липсващ профил означава
 * ОТКАЗ. Легаси поведението „при грешка разрешавай“ не се пренася тук.
 *
 * `allow_third_country_ai === false` → изрично ограничение до ЕИП → отказ.
 * `null`/липсваща стойност при съществуващ профил → няма ограничение.
 */
export async function isProductAiResidencyAllowed(
  db: ResidencyDbClient,
  userId: string,
): Promise<boolean> {
  if (typeof userId !== "string" || userId.length === 0) return false;
  try {
    const { data, error } = await db
      .from("profiles")
      .select("id, allow_third_country_ai")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data || typeof data !== "object") return false;
    const row = data as { allow_third_country_ai?: unknown };
    return row.allow_third_country_ai !== false;
  } catch {
    return false;
  }
}
