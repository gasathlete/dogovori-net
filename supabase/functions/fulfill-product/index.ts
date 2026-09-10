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
  resolveProductGenerationAdapter,
} from "../_shared/product-jobs.ts";
import { requireProductSpec } from "../_shared/product-purchase.ts";
import {
  PRODUCT_SOURCE_CHAR_UNIT,
  ProductSourceError,
  verifyStoredProductSource,
} from "../_shared/product-source.ts";
import { readyProductResult } from "../_shared/product-result-contract.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_BODY_KEYS = Object.freeze(["entitlement_id"]);

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
      snapshot.price_amount !== spec.amountCents ||
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
        "id, user_id, product_id, uploaded_contract_id, source_hash, source_updated_at, source_char_count, source_char_unit, source_kind, source_page_count, source_extraction_status, context, status, environment, generation_policy_version, amount_cents, currency, stripe_price_id, stripe_price_lookup_key, terms_version, privacy_version, refund_version, ai_notice_version, withdrawal_version, terms_accepted, ai_ack_accepted, immediate_performance_consent, withdrawal_loss_acknowledged",
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
      intake.amount_cents !== spec.amountCents ||
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

    // 8) В този етап адаптерът НАРОЧНО липсва: задачата стига до
    //    `awaiting_generation` ТОЧНО веднъж и връща „обработва се“. Никакъв
    //    фалшив резултат.
    const adapter = resolveProductGenerationAdapter();
    if (!adapter) {
      // Повторна заявка на вече изчакваща задача: НЕ записваме втора контролна
      // точка и НЕ задържаме наема за десет минути — освобождаваме го веднага.
      if (claimedStage !== "queued") {
        await admin.rpc("release_product_job_lease", {
          p_job_id: jobId,
          p_lease_token: leaseToken,
        });
        return json(
          { status: "processing", stage: claimedStage, message: MESSAGES.processing, correlation_id: cid },
          202,
          headers,
        );
      }
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
        await admin.rpc("fail_product_job", {
          p_job_id: jobId,
          p_lease_token: leaseToken,
          p_error_class: "retryable",
          p_error_code: "checkpoint_failed",
        });
        return fail("failed_retryable", 503, headers, cid);
      }
      return json(
        { status: "processing", stage: AWAITING_GENERATION_CURSOR.stage, message: MESSAGES.processing, correlation_id: cid },
        202,
        headers,
      );
    }


    // Недостижимо в този етап: адаптерът се появява в Stage 2B1B2.
    await admin.rpc("fail_product_job", {
      p_job_id: jobId,
      p_lease_token: leaseToken,
      p_error_class: "retryable",
      p_error_code: "adapter_unavailable",
    });
    return fail("failed_retryable", 503, headers, cid);
  } catch (e) {
    if (e instanceof ProductSourceError) return fail("source_changed", 409, headers, cid);
    // Никога не логваме текст, откъс, име на файл, контекст или лични данни.
    console.error("fulfill-product error", { cid, name: e instanceof Error ? e.name : "unknown" });
    return fail("internal", 500, headers, cid);
  }
});
