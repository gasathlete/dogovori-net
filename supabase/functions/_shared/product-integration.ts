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
import { PRODUCT_EXPECTED_MIGRATION, type ProductIntegrationConfig } from "./product-integration-config.ts";
export { PRODUCT_EXPECTED_MIGRATION, PRODUCT_INTEGRATION_ENV, readProductIntegrationConfig } from "./product-integration-config.ts";
export type { EnvReader, ProductIntegrationConfig, ProductStripeEnvironmentConfig } from "./product-integration-config.ts";
import { isLegalKnowledgeBaseReady, type LegalDbClient } from "./product-legal-basis.ts";
import type { VerifierDeps } from "./legal-verification.ts";

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
  return [...(await serviceGateBlockers(gates))];
}

/** Скъпите проверки (миграция, правна база, местопребиваване) — без произхода. */
async function serviceGateBlockers(
  gates: ProductServiceGates,
): Promise<ProductIntegrationCode[]> {
  const codes: ProductIntegrationCode[] = [];
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

/** Вътрешна тестова зависимост; продукцията винаги ползва изходно кодирания мост. */
export interface PrepaymentTestDeps {
  readonly trustedSourceBlockers?: () => readonly ProductIntegrationCode[];
}

/**
 * Пълната проверка ПРЕДИ плащане: нито едно Stripe извикване и нито един запис
 * не се прави, докато всяко условие не е изпълнено.
 *
 * Fail-fast: евтините фатални блокери (конфигурация → произход) връщат веднага,
 * без скъпите асинхронни проверки; само без тях се изпълняват всички останали.
 */
export async function productPrepaymentBlockers(
  config: ProductIntegrationConfig,
  environment: "sandbox" | "live",
  gates: ProductServiceGates,
  testDeps: PrepaymentTestDeps = {},
): Promise<readonly ProductIntegrationCode[]> {
  const cheap = productCheckoutBlockers(config, environment);
  if (cheap.length > 0) return Object.freeze([...cheap]);
  // Произходът се проверява per-source в bindTrustedProductSource (файлове
  // затворени; предоставен текст само със сървърна разписка).
  const trusted = testDeps.trustedSourceBlockers?.() ?? [];
  if (trusted.length > 0) return Object.freeze([...trusted]);
  return Object.freeze(await serviceGateBlockers(gates));
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
  const trustedSource: ProductIntegrationCode[] = [];
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
