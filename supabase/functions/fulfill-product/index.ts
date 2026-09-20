/**
 * Изпълнение на точно едно платено право за точно един продукт.
 *
 * В този етап (Stage 2B1B1) функцията е ОБВИВКА: тя доказва плащането,
 * неизменния източник и допустимостта, заявява задачата и записва контролна
 * точка `awaiting_generation`. НЯМА извикване на модел и НЯМА подставен или
 * частичен резултат. Генерацията се включва в Stage 2B1B2 през типизираната
 * граница `ProductGenerationAdapter`.
 *
 * Заявката приема САМО `entitlement_id`. Всичко останало — продукт, източник,
 * контекст, класификация, маршрут, бюджет — се извежда от сървърни редове.
 * Общите операции/квоти НЕ се пипат: платеният продукт не харчи операции.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCors } from "../_shared/cors.ts";
import { correlationHeaders, getCorrelationId } from "../_shared/correlation.ts";
import {
  evaluateProductEligibility,
  eligibilityMessage,
  type EligibilityCode,
} from "../_shared/product-eligibility.ts";
import { PRODUCT_GENERATION_POLICY_VERSION } from "../_shared/product-generation-policy.ts";
import {
  AWAITING_GENERATION_CURSOR,
  PRODUCT_JOB_LEASE_SECONDS,
  parseJobCursor,
  resolveProductGenerationDependencies,
} from "../_shared/product-jobs.ts";
import {
  canonicalProductJson,
  createProductGenerationAdapter,
  parseGenerationArtifacts,
  productCanonicalDigest,
  ProductGenerationError,
  type ProductCallStore,
  type ProductLegalBasisPort,
  type ProductModelPort,
  type ProductModelRequest,
  type ProductModelResponse,
} from "../_shared/product-generation-runtime.ts";
import { requireProductSpec, snapshotAmountToCents } from "../_shared/product-purchase.ts";
import {
  PRODUCT_SOURCE_CHAR_UNIT,
  ProductSourceError,
  verifyStoredProductSource,
} from "../_shared/product-source.ts";
import { readyProductResult } from "../_shared/product-result-contract.ts";
import {
  createProductModelPort,
  ProductModelGatewayError,
} from "../_shared/product-model-gateway.ts";
import {
  createProductLegalBasisPort,
  type LegalDbClient,
} from "../_shared/product-legal-basis.ts";
import {
  productFulfillmentIntegrationBlockers,
  productIntegrationMessage,
  type ProductRpcProbeClient,
  readProductIntegrationConfig,
  type ResidencyDbClient,
} from "../_shared/product-integration.ts";
import {
  markProductJobReconciliation,
  PRODUCT_LEDGER_UNAVAILABLE_CODE,
  PRODUCT_LEDGER_UNAVAILABLE_MESSAGE,
  PRODUCT_RECONCILIATION_MESSAGE,
  ProductUncertainCallError,
  readProductReconciliationState,
  type ReconciliationRpcClient,
} from "../_shared/product-reconciliation.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_BODY_KEYS = Object.freeze(["entitlement_id"]);

/**
 * Immutable production composition. Source builds deliberately have no live
 * provider; deployment must inject a reviewed adapter and verified retention.
 */
export {
  createProductCallStore,
  type StoredCallRequest,
} from "../_shared/product-call-store.ts";
import {
  createProductCallStore as buildProductCallStore,
  type CallStoreRpcClient,
  type StoredCallRequest,
} from "../_shared/product-call-store.ts";

type AdapterFactory = (model: ProductModelPort, legal: ProductLegalBasisPort, calls: ProductCallStore) => ReturnType<typeof createProductGenerationAdapter>;
interface ProductProviderPorts {
  readonly model: ProductModelPort;
  readonly legal: ProductLegalBasisPort;
}
/**
 * Портовете съществуват ПО КОНСТРУКЦИЯ: тази функция се извиква само след като
 * конфигурационната граница е минала. Няма път „без адаптер“, който да заявява
 * задача и да отговаря общо „обработваме“.
 */
export const generationDependencies = (
  calls: ProductCallStore,
  ports: ProductProviderPorts,
  factory: AdapterFactory = createProductGenerationAdapter,
) => ({
  adapter: factory(ports.model, ports.legal, calls),
  zeroRetentionVerified: Deno.env.get("PRODUCT_AI_ZERO_RETENTION_VERIFIED") === "true",
} as const);


/** Кратки, безопасни съобщения на български. Без технически подробности. */
const MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  unauthorized: "Влезте в профила си, за да видите резултата.",
  invalid_body: "Заявката е непълна.",
  not_found: "Не намираме тази поръчка.",
  payment_unverified: "Плащането още не е потвърдено. Опитайте отново след минута.",
  source_changed:
    "Документът е променен след плащането. Резултатът е обвързан с точния платен документ.",
  processing: "Обработваме документа. Ще видите резултата тук.",
  failed_retryable: "Обработката прекъсна. Опитайте отново.",
  failed_permanent: "Обработката не може да продължи. Свържете се с нас за решение.",
  reconciliation_required: PRODUCT_RECONCILIATION_MESSAGE,
  internal: "Възникна неочакван проблем.",
});

function json(
  body: Record<string, unknown>,
  status: number,
  headers: HeadersInit,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function fail(code: string, status: number, headers: HeadersInit, cid: string, message?: string) {
  return json(
    { error: code, message: message ?? MESSAGES[code] ?? MESSAGES.internal, correlation_id: cid },
    status,
    headers,
  );
}

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }
  const cid = getCorrelationId(req);
  const headers = { ...corsHeaders, ...correlationHeaders(cid) };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return fail("unauthorized", 401, headers, cid);
    const token = authHeader.slice("Bearer ".length);

    const asUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await asUser.auth.getUser(token);
    if (userErr || !userData?.user) return fail("unauthorized", 401, headers, cid);
    const userId = userData.user.id;

    const parsed = await req.json().catch(() => null);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return fail("invalid_body", 400, headers, cid);
    }
    const body = parsed as Record<string, unknown>;
    for (const key of Object.keys(body)) {
      if (!ALLOWED_BODY_KEYS.includes(key)) return fail("invalid_body", 400, headers, cid);
    }
    const entitlementId = body.entitlement_id;
    if (typeof entitlementId !== "string" || !UUID_RE.test(entitlementId)) {
      return fail("invalid_body", 400, headers, cid);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Платеното право. Без „последно право на потребителя“ — точно това.
    const { data: ent } = await admin
      .from("product_entitlements")
      .select(
        "id, user_id, product_id, status, result, result_schema_version, intake_id, stripe_session_id, stripe_price_id, stripe_price_lookup_key, stripe_event_id, paid_at, amount_cents, currency, environment, source_document_id, source_hash, source_updated_at, source_char_count, source_char_unit, source_kind, source_page_count, source_extraction_status, generation_policy_version",
      )
      .eq("id", entitlementId)
      .maybeSingle();
    if (!ent || ent.user_id !== userId) return fail("not_found", 404, headers, cid);

    const spec = requireProductSpec(ent.product_id);
    if (
      ent.amount_cents !== spec.amountCents ||
      String(ent.currency).toLowerCase() !== spec.currency ||
      ent.stripe_price_lookup_key !== spec.lookupKey ||
      !ent.stripe_price_id ||
      !ent.stripe_session_id ||
      !ent.stripe_event_id ||
      !ent.paid_at ||
      !ent.intake_id ||
      (ent.environment !== "live" && ent.environment !== "sandbox")
    ) {
      return fail("payment_unverified", 409, headers, cid);
    }
    if (!["paid", "processing", "ready", "failed"].includes(String(ent.status))) {
      return fail("payment_unverified", 409, headers, cid);
    }

    // 2) Доказателството идва по ДВОЙКИ: право И продуктов order snapshot.
    //    Проверяват се и точната цена, и точният ценови запис в Stripe.
    const { data: snapshot } = await admin
      .from("order_snapshots")
      .select(
        "id, purchase_kind, product_id, payment_status, stripe_session_id, stripe_event_id, stripe_price_id, stripe_price_lookup_key, paid_at, product_intake_id, product_source_document_id, product_source_hash, product_source_updated_at, product_source_char_count, product_source_char_unit, product_source_kind, product_source_pages, product_source_extraction_status, environment, price_amount, currency, ai_notice_version, terms_accepted, immediate_performance_consent, withdrawal_loss_acknowledged, consent_recorded_at, tax_behavior, tax_amount_cents",
      )
      .eq("purchase_kind", "product")
      .eq("product_intake_id", ent.intake_id)
      .eq("stripe_session_id", ent.stripe_session_id)
      .maybeSingle();
    if (
      !snapshot ||
      snapshot.payment_status !== "paid" ||
      snapshot.product_id !== ent.product_id ||
      snapshot.stripe_event_id !== ent.stripe_event_id ||
      snapshot.stripe_price_id !== ent.stripe_price_id ||
      snapshot.stripe_price_lookup_key !== spec.lookupKey ||
      snapshotAmountToCents(snapshot.price_amount) !== spec.amountCents ||
      String(snapshot.currency).toLowerCase() !== spec.currency ||
      !snapshot.paid_at ||
      snapshot.environment !== ent.environment ||
      snapshot.product_source_document_id !== ent.source_document_id ||
      String(snapshot.product_source_hash).toLowerCase() !==
        String(ent.source_hash).toLowerCase() ||
      String(snapshot.product_source_updated_at) !== String(ent.source_updated_at) ||
      snapshot.product_source_char_count !== ent.source_char_count ||
      snapshot.product_source_char_unit !== ent.source_char_unit ||
      snapshot.product_source_kind !== ent.source_kind ||
      (snapshot.product_source_pages ?? null) !== (ent.source_page_count ?? null) ||
      snapshot.product_source_extraction_status !== "full" ||
      // Съгласията са записани точно както са дадени — никога предположени.
      snapshot.terms_accepted !== true ||
      snapshot.immediate_performance_consent !== true ||
      snapshot.withdrawal_loss_acknowledged !== true ||
      !snapshot.consent_recorded_at ||
      // Данъчното доказателство: ако Stripe е върнал поведение, то трябва да е
      // включен ДДС, а видимата сума НИКОГА да не надхвърля каноничната.
      (snapshot.tax_behavior !== null &&
        snapshot.tax_behavior !== undefined &&
        snapshot.tax_behavior !== "inclusive") ||
      (typeof snapshot.tax_amount_cents === "number" &&
        snapshot.tax_amount_cents > spec.amountCents)
    ) {
      return fail("payment_unverified", 409, headers, cid);
    }

    // 3) Неизменната заявка: контекст, съгласия, правни версии, търговски факти
    //    и версия на политиката. Чете се ПРЕДИ готовия резултат, защото готовият
    //    резултат също трябва да е обвързан с точно този платен източник.
    const { data: intake } = await admin
      .from("product_checkout_intakes")
      .select(
        "id, user_id, product_id, uploaded_contract_id, source_hash, source_updated_at, source_char_count, source_char_unit, source_kind, source_page_count, source_extraction_status, context, status, environment, generation_policy_version, expected_amount_cents, currency, stripe_price_id, stripe_price_lookup_key, terms_version, privacy_version, refund_version, ai_notice_version, withdrawal_version, terms_accepted, ai_ack_accepted, immediate_performance_consent, withdrawal_loss_acknowledged",
      )
      .eq("id", ent.intake_id)
      .maybeSingle();
    const nonEmpty = (value: unknown) => typeof value === "string" && value.trim().length > 0;
    if (
      !intake ||
      intake.user_id !== userId ||
      intake.product_id !== ent.product_id ||
      intake.status !== "paid" ||
      intake.environment !== ent.environment ||
      intake.uploaded_contract_id !== ent.source_document_id ||
      String(intake.source_hash).toLowerCase() !== String(ent.source_hash).toLowerCase() ||
      String(intake.source_updated_at) !== String(ent.source_updated_at) ||
      intake.source_char_count !== ent.source_char_count ||
      intake.source_char_unit !== ent.source_char_unit ||
      intake.source_kind !== ent.source_kind ||
      (intake.source_page_count ?? null) !== (ent.source_page_count ?? null) ||
      intake.source_extraction_status !== "full" ||
      intake.expected_amount_cents !== spec.amountCents ||
      String(intake.currency).toLowerCase() !== spec.currency ||
      intake.stripe_price_lookup_key !== spec.lookupKey ||
      intake.stripe_price_id !== ent.stripe_price_id ||
      !nonEmpty(intake.terms_version) ||
      !nonEmpty(intake.privacy_version) ||
      !nonEmpty(intake.refund_version) ||
      !nonEmpty(intake.ai_notice_version) ||
      !nonEmpty(intake.withdrawal_version) ||
      intake.ai_notice_version !== snapshot.ai_notice_version ||
      intake.terms_accepted !== true ||
      intake.ai_ack_accepted !== true ||
      intake.immediate_performance_consent !== true ||
      intake.withdrawal_loss_acknowledged !== true
    ) {
      return fail("payment_unverified", 409, headers, cid);
    }
    // Версията на политиката съществува в ДВА независими записа. И двата трябва
    // да я имат и да са ТОЧНО равни на текущата. Няма „едно от двете“.
    const intakePolicy = intake.generation_policy_version;
    const entitlementPolicy = ent.generation_policy_version;
    if (
      typeof intakePolicy !== "string" ||
      typeof entitlementPolicy !== "string" ||
      intakePolicy !== entitlementPolicy ||
      intakePolicy !== PRODUCT_GENERATION_POLICY_VERSION
    ) {
      const code: EligibilityCode = "policy_changed";
      return fail(code, 409, headers, cid, eligibilityMessage(code));
    }
    const storedPolicy = intakePolicy;

    // 4) Готовият резултат се връща точно както е записан — но само след като
    //    схемата, точният продукт И цялото обвързване с източника съвпаднат.
    if (ent.status === "ready") {
      const ready = readyProductResult(
        ent.result,
        {
          document_id: ent.source_document_id,
          source_hash: String(ent.source_hash).toLowerCase(),
          source_kind: ent.source_kind,
          char_count: ent.source_char_count,
          char_unit: ent.source_char_unit,
          source_updated_at: String(ent.source_updated_at),
          page_count: ent.source_page_count ?? null,
        },
        spec.id,
      );
      if (ent.result_schema_version !== 2 || !ready.ok) {
        return fail("failed_permanent", 409, headers, cid);
      }
      return json({ status: "ready", result: ent.result, correlation_id: cid }, 200, headers);
    }

    // 5) Източникът: същият документ, същата ревизия, ЦЯЛ текст, същият хеш.
    const { data: doc } = await admin
      .from("uploaded_contracts")
      .select(
        "id, user_id, extracted_text, text_hash, updated_at, product_extraction_status, product_extracted_chars, product_source_pages, product_source_kind",
      )
      .eq("id", ent.source_document_id)
      .maybeSingle();
    if (!doc || doc.user_id !== userId) return fail("source_changed", 409, headers, cid);
    const verified = await verifyStoredProductSource(doc, async (value) => {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    });
    if (
      verified.sourceHash !== String(ent.source_hash).toLowerCase() ||
      String(verified.sourceUpdatedAt) !== String(ent.source_updated_at) ||
      verified.sourceKind !== ent.source_kind ||
      verified.charCount !== ent.source_char_count ||
      verified.charUnit !== ent.source_char_unit ||
      ent.source_char_unit !== PRODUCT_SOURCE_CHAR_UNIT ||
      verified.pageCount !== (ent.source_page_count ?? null)
    ) {
      return fail("source_changed", 409, headers, cid);
    }

    // 6) СЪЩАТА проверка за допустимост, която е минала преди плащането.
    const eligibility = evaluateProductEligibility({
      productId: spec.id,
      source: {
        text: verified.text,
        charCount: verified.charCount,
        charUnit: verified.charUnit,
        sourceKind: verified.sourceKind,
        extractionStatus: "full",
      },
      context: intake.context,
      expectedPolicyVersion: storedPolicy,
    });
    if (!eligibility.ok) {
      return fail(eligibility.code, 409, headers, cid, eligibility.message);
    }
    const bounds = eligibility.policy.bounds;

    // 6а) Конфигурационната граница е ПРЕДИ заявяването на задача. Ако нещо от
    // интеграцията липсва, не се заявява задача, не се записва контролна точка,
    // не се резервира извикване и не се докосва доставчик. Отговорът е стабилен
    // и затворен; платеното право остава непокътнато.
    const integration = readProductIntegrationConfig((key) => Deno.env.get(key));
    const legalDb = admin as unknown as LegalDbClient;
    const integrationBlockers = await productFulfillmentIntegrationBlockers(integration, {
      legalDb,
      rpc: admin as unknown as ProductRpcProbeClient,
      residencyDb: admin as unknown as ResidencyDbClient,
      userId,
    });
    if (integrationBlockers.length > 0) {
      const code = integrationBlockers[0];
      const status = code === "residency_not_allowed" ? 409 : 503;
      return fail(code, status, headers, cid, productIntegrationMessage(code));
    }
    const ports: ProductProviderPorts = Object.freeze({
      model: createProductModelPort({
        apiKey: Deno.env.get("LOVABLE_API_KEY")!,
        fetchImpl: fetch,
      }),
      legal: createProductLegalBasisPort(legalDb),
    });


    // 6б) Неизяснен изход от предишно извикване БЛОКИРА нова задача. Четенето е
    // само четене и стои ПРЕДИ заявяването, доставчика и всяка промяна.
    const reconciliation = await readProductReconciliationState(
      admin as unknown as ReconciliationRpcClient,
      userId,
      entitlementId,
    );
    if (reconciliation.jobRequired) {
      return fail("reconciliation_required", 409, headers, cid);
    }

    // 7) Атомарно заявяване на НАЙ-МНОГО една ограничена стъпка.
    // Ключът за идемпотентност се изчислява ВЪТРЕ в атомарното заявяване, от
    // правото, политиката и действително записания курсор — не от извикващия.
    const { data: claim, error: claimErr } = await admin.rpc("claim_product_job", {
      p_entitlement_id: entitlementId,
      p_user_id: userId,
      p_policy_version: PRODUCT_GENERATION_POLICY_VERSION,
      p_budget_max_calls: bounds.maxModelCalls,
      p_budget_max_input_tokens: bounds.maxInputTokens,
      p_budget_max_output_tokens: bounds.maxOutputTokens,
      p_budget_max_tokens: bounds.maxTotalTokens,
      p_budget_hard_cost_micro_usd: bounds.hardCostMicroUsd,
      p_lease_seconds: PRODUCT_JOB_LEASE_SECONDS,
    });
    if (claimErr) {
      console.error("claim_product_job failed", { cid });
      return fail("failed_retryable", 503, headers, cid);
    }
    const claimResult = (claim ?? {}) as Record<string, unknown>;
    if (claimResult.ok !== true) {
      const reason = String(claimResult.reason ?? "not_claimable");
      if (reason === "lease_active") {
        return json({ status: "processing", message: MESSAGES.processing, correlation_id: cid }, 202, headers);
      }
      if (reason === "half_state" || reason === "not_found" || reason === "not_claimable") {
        return fail("payment_unverified", 409, headers, cid);
      }
      if (reason === "source_changed") return fail("source_changed", 409, headers, cid);
      if (reason === "policy_changed") {
        return fail("policy_changed", 409, headers, cid, eligibilityMessage("policy_changed"));
      }
      if (reason === "already_completed") {
        return json({ status: "processing", message: MESSAGES.processing, correlation_id: cid }, 202, headers);
      }
      return fail("failed_permanent", 409, headers, cid);
    }

    const jobId = String(claimResult.job_id);
    const leaseToken = String(claimResult.lease_token);
    const claimedStage = String(claimResult.stage ?? "queued");

    // Всеки провал СЛЕД заявяването на задачата минава оттук: или наемът се
    // освобождава веднага (повторим), или задачата се маркира като окончателно
    // пропаднала. Границата започва НЕПОСРЕДСТВЕНО след заявяването, така че
    // четенето на трайното състояние, разчитането на артефактите и проверката
    // на изразходването също са защитени. Никога не остава мъртъв наем.
    const releaseRetryable = async (): Promise<Response> => {
      await admin.rpc("release_product_job_lease", { p_job_id: jobId, p_lease_token: leaseToken });
      return fail("failed_retryable", 503, headers, cid);
    };
    const handlePostClaimFailure = async (error: unknown): Promise<Response> => {
      // Неизяснен изход на доставчик: НЕ се освобождава наем (иначе втора
      // заявка би извикала модела пак), НЕ се обявява провал и НИКОГА не се
      // възстановява платено право. Състоянието се замразява до ръчно изясняване.
      if (error instanceof ProductUncertainCallError) {
        console.error("fulfill-product provider outcome unknown", { cid, code: error.code });
        await markProductJobReconciliation(
          admin as unknown as ReconciliationRpcClient,
          jobId,
          leaseToken,
          error.code,
          error.callId,
        );
        return fail("reconciliation_required", 409, headers, cid);
      }
      // Провалът на доставчика НИКОГА не изтича навън: нито тяло, нито подсказка,
      // нито изход на модела. Остава само затворен код.
      const gateway = error instanceof ProductModelGatewayError;
      const generation = error instanceof ProductGenerationError;
      const retryable = gateway || generation
        ? (error as { retryable?: boolean }).retryable === true
        : true;
      if (retryable) {
        // Повторимият провал НЕ мести курсора и НЕ изразходва контролна точка:
        // само наемът се освобождава, за да няма десетминутна мъртва задача.
        await admin.rpc("release_product_job_lease", {
          p_job_id: jobId,
          p_lease_token: leaseToken,
        });
        if (!gateway && !generation) {
          console.error("fulfill-product step error", {
            cid,
            name: error instanceof Error ? error.name : "unknown",
          });
          return fail("internal", 500, headers, cid);
        }
        // Само затворен код — за диагностика на повторимите прекъсвания.
        console.error("fulfill-product retryable failure", {
          cid,
          code: String((error as { code?: unknown }).code ?? "unknown"),
        });
        return fail("failed_retryable", 503, headers, cid);

      }
      // Само затворен код/причина на грешката — без текст, откъс или изход на модела.
      console.error("fulfill-product permanent failure", {
        cid,
        code: gateway || generation ? String((error as { code?: unknown }).code ?? "unknown") : "unknown",
        reason: gateway ? String((error as { reason?: unknown }).reason ?? "unknown") : "n/a",
      });

      await admin.rpc("fail_product_job", {
        p_job_id: jobId,
        p_lease_token: leaseToken,
        p_error_class: "permanent",
        p_error_code: gateway ? "provider_contract" : "generation_invalid",
      });
      return fail("failed_permanent", 409, headers, cid);
    };

    try {
      // 8) Изпълнява се най-много една ограничена стъпка.
      const callStore = buildProductCallStore(admin as unknown as CallStoreRpcClient, jobId, leaseToken);
      const dependencies = resolveProductGenerationDependencies(() =>
        generationDependencies(callStore, ports)
      );
      const adapter = dependencies.adapter!;

      // 8а) Първата стъпка на нова задача е само преход queued → awaiting_generation.
      if (claimedStage === "queued") {
        const { data: cp, error: cpErr } = await admin.rpc("record_product_job_checkpoint", {
          p_job_id: jobId,
          p_lease_token: leaseToken,
          p_next_cursor: AWAITING_GENERATION_CURSOR,
          p_usage_calls: 0,
          p_usage_input_tokens: 0,
          p_usage_output_tokens: 0,
          p_usage_cost_micro_usd: 0,
          p_payload_digest: null,
          p_release_lease: true,
        });
        const cpResult = (cp ?? {}) as Record<string, unknown>;
        if (cpErr || cpResult.ok !== true) {
          // Повторим провал при запис на контролната точка: наемът се освобождава,
          // курсорът не се мести и задачата НЕ се маркира окончателно.
          return await releaseRetryable();
        }
        return json(
          { status: "processing", stage: AWAITING_GENERATION_CURSOR.stage, message: MESSAGES.processing, correlation_id: cid },
          202,
          headers,
        );
      }

      // 8б) Четенето и проверката на трайното състояние стоят ВЪТРЕ в границата.
      const { data: durable, error: durableErr } = await admin.rpc("load_product_generation_state", {
        p_job_id: jobId,
        p_lease_token: leaseToken,
      });
      const durableState = (durable ?? {}) as Record<string, unknown>;
      const cursor = parseJobCursor(durableState.cursor);
      if (durableErr || durableState.ok !== true || !cursor || typeof durableState.generation_timestamp !== "string") {
        // Проблем при ЧЕТЕНЕ на състоянието е повторим: не маркираме окончателен
        // провал само за да освободим наема.
        return await releaseRetryable();
      }
      // Разчитането на артефактите може да хвърли — затова е вътре в границата.
      const serialized = await parseGenerationArtifacts({
        version: 1,
        artifacts: durableState.artifacts,
        completedCallIds: durableState.completedCallIds,
      });
      const usageRaw = (durableState.usage ?? {}) as Record<string, unknown>;
      const usage = {
        calls: Number(usageRaw.calls),
        input_tokens: Number(usageRaw.input_tokens),
        output_tokens: Number(usageRaw.output_tokens),
        cost_micro_usd: Number(usageRaw.cost_micro_usd),
      };
      // Невалидно записано изразходване е локално установена НЕВАЛИДНА трайна
      // стойност: окончателен провал, а не тих сбор.
      for (const value of Object.values(usage)) {
        if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
          throw new ProductGenerationError("invalid_model_output");
        }
      }
      const step = await adapter.runStep({
        entitlementId,
        productId: spec.id,
        sourceText: verified.text,
        binding: {
          document_id: ent.source_document_id,
          source_hash: String(ent.source_hash).toLowerCase(),
          source_kind: ent.source_kind,
          char_count: ent.source_char_count,
          char_unit: ent.source_char_unit,
          source_updated_at: String(ent.source_updated_at),
          page_count: ent.source_page_count ?? null,
        },
        context: eligibility.context,
        cursor,
        bounds,
        usage,
        zeroRetentionVerified: dependencies.zeroRetentionVerified,
        generationTimestamp: durableState.generation_timestamp,
        artifacts: serialized.artifacts,
        completedCallIds: new Set(serialized.completedCallIds),
        dataSafety: {
          redactionRequired: eligibility.policy.redactionRequired,
          redactionCompleted: !eligibility.policy.redactionRequired,
          postRedactionReclassificationRequired: eligibility.policy.postRedactionReclassificationRequired,
          postRedactionReclassificationCompleted: !eligibility.policy.postRedactionReclassificationRequired,
          userConfirmationRequired: eligibility.policy.userConfirmationRequired,
          // Изричното потвърждение е дадено ПРЕДИ плащането като отделно,
          // непредварително отметнато съгласие за обработка с AI и е проверено
          // по-горе в тази функция (`intake.ai_ack_accepted === true`), заедно с
          // точната версия на съобщението. Никога не се предполага.
          userConfirmationCompleted: intake.ai_ack_accepted === true,
          modelCallAllowed: intake.ai_ack_accepted === true,
        },
      });
      // 9) Проверката на артефакта и курсора стои В СЪЩИЯ блок: постоянният
      // провал тук маркира задачата, а не оставя наем.
      const artifact = step.artifact as { cursorKey?: unknown; stage?: unknown; digest?: unknown; payload?: unknown } | undefined;
      if (!artifact || typeof artifact.digest !== "string") throw new ProductGenerationError("invalid_model_output");
      const callIds = [...(step.callIds ?? [])];
      const currentCursorKey = `${cursor.stage}:${cursor.batch_index}:${cursor.chunk_index}`;
      if (artifact.cursorKey !== currentCursorKey || artifact.stage !== cursor.stage && !(cursor.stage === "awaiting_generation" && artifact.stage === "passport")) {
        throw new ProductGenerationError("invalid_cursor");
      }
      const canonical = canonicalProductJson(artifact.payload);
      if (step.result) {
        const { data: finished, error: finishErr } = await admin.rpc("commit_product_generation_result", {
          p_job_id: jobId, p_lease_token: leaseToken, p_current_cursor_key: currentCursorKey,
          p_artifact_stage: "synthesis", p_call_ids: callIds, p_result: step.result,
          p_result_canonical: canonical, p_result_digest: artifact.digest,
          p_generation_timestamp: durableState.generation_timestamp,
        });
        // Провалът на записа е повторим: наемът се освобождава изрично, курсорът
        // не се мести и контролна точка не се изразходва.
        if (finishErr || (finished as Record<string, unknown> | null)?.ok !== true) return await releaseRetryable();
        const storedResult = (finished as Record<string, unknown>).result ?? step.result;
        return json({ status: "ready", result: storedResult, correlation_id: cid }, 200, headers);
      }
      const { data: stored, error: storedErr } = await admin.rpc("record_product_generation_artifact", {
        p_job_id: jobId, p_lease_token: leaseToken, p_current_cursor_key: currentCursorKey,
        p_artifact_stage: artifact.stage, p_next_cursor: step.nextCursor, p_call_ids: callIds,
        p_payload: artifact.payload, p_payload_canonical: canonical, p_payload_digest: artifact.digest,
        p_generation_timestamp: durableState.generation_timestamp, p_coverage: null, p_release_lease: true,
      });
      if (storedErr || (stored as Record<string, unknown> | null)?.ok !== true) {
        // Само затворена причина/код от базата — без съдържание на артефакта.
        console.error("fulfill-product artifact not recorded", {
          cid,
          reason: String((stored as Record<string, unknown> | null)?.reason ?? "rpc_error"),
          db_code: String((storedErr as { code?: unknown } | null)?.code ?? "none"),
        });

        return await releaseRetryable();
      }

      return json({ status: "processing", stage: step.nextCursor.stage, message: MESSAGES.processing, correlation_id: cid }, 202, headers);
    } catch (error) {
      return await handlePostClaimFailure(error);
    }
  } catch (e) {
    if (e instanceof ProductSourceError) return fail("source_changed", 409, headers, cid);
    if (e instanceof ProductGenerationError) {
      return fail(e.retryable ? "failed_retryable" : "failed_permanent", e.retryable ? 503 : 409, headers, cid);
    }
    // Никога не логваме текст, откъс, име на файл, контекст или лични данни.
    console.error("fulfill-product error", { cid, name: e instanceof Error ? e.name : "unknown" });
    return fail("internal", 500, headers, cid);
  }
});
