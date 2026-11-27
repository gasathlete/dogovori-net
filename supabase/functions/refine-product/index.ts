/**
 * Точно ЕДНО премиум уточнение на пълния пакет за преговори.
 *
 * Оригиналният платен резултат НИКОГА не се заменя: уточнението е отделен,
 * неизменен запис, обвързан с точния платен документ и точния оригинален
 * резултат. Провалът не изразходва включеното уточнение и не подава частичен
 * текст. Общите операции/квоти не се докосват.
 *
 * В изходния билд доставчикът остава ЗАТВОРЕН: без доказан zero-retention gate
 * и пълна интеграционна готовност функцията не докосва модел.
 */
import { bindTrustedProductSource, storageDownloader } from "../_shared/product-source-binding.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCors } from "../_shared/cors.ts";
import {
  findRestrictedIdentifierKindsDeep,
  restrictedIdentifierBlockedResponse,
  restrictedIdentifierLogFields,
} from "../_shared/text-identifier-gate.ts";
import { correlationHeaders, getCorrelationId } from "../_shared/correlation.ts";
import {
  loadReadyPaidProduct,
  type PaidAccessDbClient,
  paidAccessMessage,
} from "../_shared/product-paid-access.ts";
import {
  findSucceededRefinementReplay,
  type RefinementReplayDbClient,
} from "../_shared/product-refinement-replay.ts";
import {
  evaluateProductEligibility,
} from "../_shared/product-eligibility.ts";
import {
  productFulfillmentIntegrationBlockers,
  productIntegrationMessage,
  type ProductRpcProbeClient,
  readProductIntegrationConfig,
  type ResidencyDbClient,
} from "../_shared/product-integration.ts";
import type { LegalDbClient } from "../_shared/product-legal-basis.ts";
import { createProductModelPort } from "../_shared/product-model-gateway.ts";
import {
  redactProductBundle,
  rehydrateProductOutput,
} from "../_shared/product-secure-redaction.ts";
import {
  ProductRefinementError,
  REFINEMENT_LEASE_SECONDS,
  refinementMessage,
  validateRefinedNegotiation,
  validateRefinementIdempotencyKey,
  validateRefinementInstruction,
} from "../_shared/product-refinement.ts";
import type { NegotiationPackageResult } from "../_shared/product-result-contract.ts";
import {
  markProductRefinementReconciliation,
  PRODUCT_LEDGER_UNAVAILABLE_CODE,
  PRODUCT_LEDGER_UNAVAILABLE_MESSAGE,
  PRODUCT_RECONCILIATION_MESSAGE,
  type ProductReconciliationCode,
  readProductReconciliationState,
  type ReconciliationRpcClient,
} from "../_shared/product-reconciliation.ts";
import {
  decideRefinementOutcome,
  type StoredRefinementResponse,
  validateStoredRefinementResponse,
} from "../_shared/product-refinement-outcome.ts";
import { modelPrice } from "../_shared/product-generation-policy.ts";
import { mergeRefinementPatch } from "../_shared/product-refinement-patch.ts";

/** Точна цена в цели micro-USD по датираната таблица на политиката. */
function refinementCallCostMicroUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = modelPrice(model);
  const ceilDiv = (a: number, b: number) => Math.ceil(a / b);
  return (
    ceilDiv(inputTokens * price.inputMicroUsdPer1MTokens, 1_000_000) +
    ceilDiv(outputTokens * price.outputMicroUsdPer1MTokens, 1_000_000)
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_BODY_KEYS = Object.freeze([
  "entitlement_id",
  "instruction",
  "idempotency_key",
  "expected_result_digest",
  "expected_refinement_version",
]);
const DIGEST_RE = /^[0-9a-f]{64}$/;

const MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  unauthorized: "Влезте в профила си, за да видите резултата.",
  invalid_body: "Заявката е непълна.",
  safety_gate: "Уточнението не може да се изготви за този документ.",
  version_conflict:
    "Резултатът е променен в друг раздел. Презаредете страницата и опитайте отново.",
  refinement_failed:
    "Уточнението не беше изготвено. Включеното уточнение остава налично, а оригиналният резултат е непокътнат.",
  reconciliation_required: PRODUCT_RECONCILIATION_MESSAGE,
  internal: "Възникна неочакван проблем.",
});

function json(body: Record<string, unknown>, status: number, headers: HeadersInit): Response {
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

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
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

    // Оптимистична съгласуваност: табът заявява ТОЧНО кой резултат и коя версия
    // на уточнението вижда. Стар таб не уточнява по-ново състояние.
    const expectedDigest = body.expected_result_digest;
    const expectedVersion = body.expected_refinement_version;
    if (
      typeof expectedDigest !== "string" ||
      !DIGEST_RE.test(expectedDigest) ||
      typeof expectedVersion !== "number" ||
      !Number.isSafeInteger(expectedVersion) ||
      expectedVersion < 0
    ) {
      return fail("invalid_body", 400, headers, cid);
    }

    let instruction: string;
    let idempotencyKey: string;
    try {
      instruction = validateRefinementInstruction(body.instruction);
      idempotencyKey = validateRefinementIdempotencyKey(body.idempotency_key);
    } catch (error) {
      if (error instanceof ProductRefinementError) {
        return fail(error.reason, 400, headers, cid, refinementMessage(error.reason));
      }
      throw error;
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Повторение на ВЕЧЕ успешно уточнение: само четене, ПРЕДИ текущата версия,
    // източника, крана на интеграцията и доставчика. Платеното право се проверява
    // изцяло (плащане, съгласия, политика, статус „ready“) — без текста на
    // документа. Нищо не се записва.
    {
      const paid = await loadReadyPaidProduct(admin as unknown as PaidAccessDbClient, userId, entitlementId, {
        withSourceText: false,
      });
      if (!paid.ok) return fail(paid.code, paid.status, headers, cid, paid.message);
      if (paid.spec.id !== "negotiation_package") {
        return fail("not_refinable", 409, headers, cid, refinementMessage("not_refinable"));
      }
      const paidBaseDigest = await sha256Hex(canonical(paid.resultRaw));
      const lookup = await findSucceededRefinementReplay(
        admin as unknown as RefinementReplayDbClient,
        {
          userId,
          entitlementId,
          idempotencyKey,
          baseDigest: paidBaseDigest,
          expectedDigest,
          instructionDigest: await sha256Hex(instruction),
          expectedVersion,
          base: paid.result as NegotiationPackageResult,
          binding: paid.binding,
        },
        { canonical, sha256Hex },
      );
      if (lookup.kind === "unavailable") return fail("internal", 500, headers, cid);
      if (lookup.kind === "invalid") {
        return fail("result_invalid", 409, headers, cid, paidAccessMessage("result_invalid"));
      }
      if (lookup.kind === "conflict") {
        return json(
          {
            error: "idempotency_conflict",
            message: MESSAGES.version_conflict,
            correlation_id: cid,
          },
          409,
          headers,
        );
      }
      if (lookup.kind === "replay") {
        return json(
          {
            status: "ready",
            replay: true,
            result: lookup.result,
            result_digest: lookup.resultDigest,
            base_result_digest: paidBaseDigest,
            correlation_id: cid,
          },
          200,
          headers,
        );
      }
    }

    const access = await loadReadyPaidProduct(admin as unknown as PaidAccessDbClient, userId, entitlementId, {
      withSourceText: true,
    });
    if (!access.ok) return fail(access.code, access.status, headers, cid, access.message);
    if (access.spec.id !== "negotiation_package" || access.sourceText === null) {
      return fail("not_refinable", 409, headers, cid, refinementMessage("not_refinable"));
    }

    // Повторна сървърна атестация: същият собственик, файл, ревизия, хеш и
    // среда като платеното право. Към модела отива само сървърно извлечен текст.
    let refineSourceText: string;
    {
      const { data: entEnv } = await admin
        .from("product_entitlements")
        .select("environment")
        .eq("id", entitlementId)
        .eq("user_id", userId)
        .maybeSingle();
      const environment = entEnv?.environment;
      if (environment !== "sandbox" && environment !== "live") {
        return fail("source_changed", 409, headers, cid);
      }
      const bound = await bindTrustedProductSource(
        { db: admin, download: storageDownloader(admin as never), sha256Hex },
        {
          userId,
          documentId: access.binding.document_id,
          environment,
          expected: {
            user_id: userId,
            source_document_id: access.binding.document_id,
            source_hash: access.binding.source_hash,
            source_updated_at: access.binding.source_updated_at,
            environment,
          },
        },
      );
      if (!bound.ok) return fail("source_changed", 409, headers, cid);
      if (bound.source.modelText !== null && bound.source.modelText !== access.sourceText) {
        return fail("source_changed", 409, headers, cid);
      }
      // При изключен мост кранът спира преди заемане/доставчик.
      refineSourceText = bound.source.modelText ?? access.sourceText;
    }

    // Преграда за ограничени идентификатори: ПРЕДИ заемането на уточнението и
    // ПРЕДИ доставчика. Включеното уточнение остава неизползвано.
    {
      const restricted = findRestrictedIdentifierKindsDeep(refineSourceText);
      if (restricted.length > 0) {
        console.warn("refine-product blocked", {
          cid,
          entitlement_id: entitlementId,
          ...restrictedIdentifierLogFields(restricted),
        });
        return restrictedIdentifierBlockedResponse(headers, restricted);
      }
    }
    const base = access.result as NegotiationPackageResult;

    // Неизяснен изход от предишно уточнение БЛОКИРА нов опит. Четенето стои
    // преди всяка променлива стъпка и преди доставчика.
    const pendingReconciliation = await readProductReconciliationState(
      admin as unknown as ReconciliationRpcClient,
      userId,
      entitlementId,
    );
    if (pendingReconciliation.refinementRequired || pendingReconciliation.jobRequired) {
      return fail("reconciliation_required", 409, headers, cid);
    }

    // Границата на интеграцията е ПРЕДИ заявяването: без пълна готовност не се
    // заема уточнението и не се докосва доставчик.
    const config = readProductIntegrationConfig((key) => Deno.env.get(key));
    const blockers = await productFulfillmentIntegrationBlockers(config, {
      legalDb: admin as unknown as LegalDbClient,
      rpc: admin as unknown as ProductRpcProbeClient,
      residencyDb: admin as unknown as ResidencyDbClient,
      userId,
    });
    if (blockers.length > 0) {
      const code = blockers[0];
      const status = code === "residency_not_allowed" ? 409 : 503;
      return fail(code, status, headers, cid, productIntegrationMessage(code));
    }

    // Същата допустимост, която е минала преди плащането — включително бюджета
    // и заделеното извикване за уточнение.
    const eligibility = evaluateProductEligibility({
      productId: access.spec.id,
      source: {
        text: refineSourceText,
        charCount: access.binding.char_count,
        charUnit: access.binding.char_unit,
        sourceKind: access.binding.source_kind,
        extractionStatus: "full",
      },
      context: access.intakeContext,
      expectedPolicyVersion: access.policyVersion,
    });
    if (!eligibility.ok) {
      return fail(eligibility.code, 409, headers, cid, eligibility.message);
    }
    const bound = eligibility.policy.bounds.calls.find(
      (call) => call.stage === "refinement" && call.reserved,
    );
    // Изискваното потвърждение е дадено преди плащането като отделно съгласие за
    // обработка с AI и е проверено при зареждането на платеното право.
    if (!bound || (bound.userConfirmationRequired && access.aiAckAccepted !== true)) {
      return fail("safety_gate", 409, headers, cid, MESSAGES.safety_gate);
    }

    const baseDigest = await sha256Hex(canonical(access.resultRaw));
    const instructionDigest = await sha256Hex(instruction);

    // Точната текуща версия се чете преди наема; RPC я проверява отново
    // атомарно. Отговорът при конфликт съдържа само безопасни метаданни.
    const { data: stateRow, error: stateErr } = await admin.rpc("load_product_result_state", {
      p_user_id: userId,
      p_entitlement_id: entitlementId,
      p_result_digest: baseDigest,
    });
    const state = (stateRow ?? {}) as Record<string, unknown>;
    if (stateErr || state.ok !== true) return fail("internal", 500, headers, cid);
    const history = Array.isArray(state.refinement_history) ? state.refinement_history : [];
    const currentVersion = history.filter(
      (item) => (item as Record<string, unknown>)?.status === "succeeded",
    ).length;
    const conflict = () =>
      json(
        {
          error: "version_conflict",
          message: MESSAGES.version_conflict,
          current_result_digest: baseDigest,
          current_refinement_version: currentVersion,
          correlation_id: cid,
        },
        409,
        headers,
      );
    if (expectedDigest !== baseDigest || expectedVersion !== currentVersion) return conflict();

    const { data: begun, error: beginErr } = await admin.rpc("begin_product_result_refinement", {
      p_user_id: userId,
      p_entitlement_id: entitlementId,
      p_base_result_digest: baseDigest,
      p_expected_refinement_version: expectedVersion,
      p_instruction_digest: instructionDigest,
      p_idempotency_key: idempotencyKey,
      p_lease_seconds: REFINEMENT_LEASE_SECONDS,
    });
    const claim = (begun ?? {}) as Record<string, unknown>;
    if (beginErr || claim.ok === undefined) return fail("internal", 500, headers, cid);
    if (claim.ok !== true) {
      const reason = String(claim.reason);
      if (reason === "version_conflict" || reason === "idempotency_conflict") return conflict();
      const message = reason === "refinement_used" || reason === "lease_active" || reason === "not_refinable"
        ? refinementMessage(reason as "refinement_used")
        : MESSAGES.internal;
      return fail(reason, 409, headers, cid, message);
    }
    if (claim.replay === true) {
      return json(
        { status: "ready", replay: true, result: claim.result, correlation_id: cid },
        200,
        headers,
      );
    }
    const refinementId = String(claim.refinement_id);
    const leaseToken = String(claim.lease_token);

    // Оттук нататък всяка грешка минава през записа: наемът не остава увиснал и
    // включеното уточнение не се изразходва при провал.
    // Трайно доказателство, че доставчикът е бил платен. Пази се отделно от
    // „тази заявка извика fetch“: приключено записано извикване е доказателство
    // и при повторение след загубен отговор.
    let providerEvidence = false;

    const failRefinement = async (code: string) => {
      // Защита на последната граница: при доказано извикване освобождаването е
      // забранено, независимо от пътя в кода.
      if (providerEvidence) return;
      await admin.rpc("fail_product_result_refinement", {
        p_refinement_id: refinementId,
        p_lease_token: leaseToken,
        p_error_code: code,
      });
    };

    // СЛЕД като доставчикът е могъл да бъде извикан, провалът НЕ освобождава
    // включеното уточнение: това би позволило второ платено извикване. Вписва се
    // неизяснено състояние, което замразява записа до ръчно изясняване.
    const reconcileRefinement = async (
      code: ProductReconciliationCode,
      callId: string | null,
    ): Promise<Response> => {
      console.error("refine-product provider outcome unknown", { cid, code });
      const marked = await markProductRefinementReconciliation(
        admin as unknown as ReconciliationRpcClient,
        refinementId,
        leaseToken,
        code,
        callId,
      );
      // Ако самото вписване не успее, отговорът НЕ твърди, че състоянието е
      // записано. Второ извикване остава невъзможно: базата пази висящото
      // извикване и не допуска ново уточнение по същото право.
      if (!marked) {
        return fail(
          PRODUCT_LEDGER_UNAVAILABLE_CODE,
          503,
          headers,
          cid,
          PRODUCT_LEDGER_UNAVAILABLE_MESSAGE,
        );
      }
      return fail("reconciliation_required", 409, headers, cid);
    };



    try {
      // Изходящият материал е редактиран детерминистично: към доставчика не
      // пътуват лични данни от документа.
      const redacted = redactProductBundle(refineSourceText, {
        instruction,
        base_result: { objectives: base.payload.objectives, red_lines: base.payload.red_lines, acceptable_concessions: base.payload.acceptable_concessions, fallbacks: base.payload.fallbacks, negotiation_questions: base.payload.negotiation_questions, actions: base.payload.actions, messages: base.payload.messages },
      });
      const callId = `${refinementId}:refinement`;
      const request = Object.freeze({
        callId,
        routeKey: "refinement" as const,
        model: bound.model,
        maxInputTokens: bound.maxInputTokens,
        maxOutputTokens: bound.maxOutputTokens,
        payload: Object.freeze({
          stage: "refinement",
          policy_version: access.policyVersion,
          source: redacted.text,
          context: redacted.context,
          output_contract: 'Return only a narrative patch object containing changed fields from objectives, red_lines, acceptable_concessions, fallbacks, negotiation_questions, actions, messages. Never return source, corrections, passport, legal evidence, or a full result. Messages, if changed, must be exactly two objects with tone neutral and firm, subject, body. Actions retain id, action, owner, due, priority. Preserve all placeholders. The server retains exact paid evidence and source.',
        }),
      });
      // Самоличността на извикването е обвързана с правото, уточнението,
      // очакваната версия, указанието, политиката и точния източник.
      const requestDigest = await sha256Hex(
        canonical({
          entitlement_id: entitlementId,
          refinement_id: refinementId,
          expected_refinement_version: expectedVersion,
          base_result_digest: baseDigest,
          instruction_digest: instructionDigest,
          policy_version: access.policyVersion,
          model: bound.model,
          source_hash: access.binding.source_hash,
          source_updated_at: access.binding.source_updated_at,
          max_input_tokens: bound.maxInputTokens,
          max_output_tokens: bound.maxOutputTokens,
        }),
      );

      // Заявката се записва ПРЕДИ доставчика: прекъсване не води до второ
      // платено извикване, а повторното изпълнение връща записания отговор.
      const { data: reservedRow, error: reserveErr } = await admin.rpc(
        "reserve_product_result_refinement_call",
        {
          p_refinement_id: refinementId,
          p_lease_token: leaseToken,
          p_call_id: callId,
          p_model: bound.model,
          p_request_digest: requestDigest,
        },
      );
      const reservation = (reservedRow ?? {}) as Record<string, unknown>;
      if (reserveErr || reservation.ok !== true) {
        // Негоден ЗАПИСАН отговор значи, че извикването е приключило: това е
        // неизяснено състояние, а не освобождаване на уточнението.
        if (String(reservation.reason ?? "") === "stored_call_invalid") {
          providerEvidence = true;
          return await reconcileRefinement("output_unusable", callId);
        }
        await failRefinement(String(reservation.reason ?? "call_reserve_failed"));
        return fail("refinement_failed", 409, headers, cid, MESSAGES.refinement_failed);
      }
      let response: StoredRefinementResponse;
      if (reservation.status === "complete") {
        // Трайно доказателство: извикването е приключило и е записано. Оттук
        // нататък включеното уточнение НЕ може да бъде освободено.
        providerEvidence = true;
        response = validateStoredRefinementResponse(reservation.response);
      } else if (reservation.status === "pending") {
        // Заявено, но неприключено извикване: не се прави второ И включеното
        // уточнение НЕ се освобождава — изходът е неизяснен.
        providerEvidence = true;
        return await reconcileRefinement("call_completion_unknown", callId);
      } else {
        const apiKey = Deno.env.get("LOVABLE_API_KEY") ?? "";
        const port = createProductModelPort({ apiKey, fetchImpl: fetch });
        providerEvidence = true;
        response = await port.invoke(request);
        const responseCanonical = canonical({ output: response.output });
        const { data: recordedRow, error: recordErr } = await admin.rpc(
          "complete_product_result_refinement_call",
          {
            p_refinement_id: refinementId,
            p_lease_token: leaseToken,
            p_call_id: callId,
            p_reservation_token: reservation.reservation_token,
            p_request_digest: requestDigest,
            p_response: JSON.parse(responseCanonical),
            p_response_canonical: responseCanonical,
            p_response_digest: await sha256Hex(responseCanonical),
            p_usage_input_tokens: response.inputTokens,
            p_usage_output_tokens: response.outputTokens,
            p_usage_cost_micro_usd: refinementCallCostMicroUsd(
              bound.model,
              response.inputTokens,
              response.outputTokens,
            ),
            p_max_input_tokens: bound.maxInputTokens,
            p_max_output_tokens: bound.maxOutputTokens,
            p_max_total_tokens: bound.maxInputTokens + bound.maxOutputTokens,
            p_max_cost_micro_usd: bound.maxCostMicroUsd,
          },
        );
        const recorded = (recordedRow ?? {}) as Record<string, unknown>;
        if (recordErr || recorded.ok !== true) {
          // Моделът вече е бил извикан, но отговорът не е записан: неизяснено.
          return await reconcileRefinement("call_record_unknown", callId);
        }
      }

      const hydrated = JSON.parse(
        rehydrateProductOutput(JSON.stringify(response.output), redacted.map, []),
      );
      const refined = validateRefinedNegotiation(
        mergeRefinementPatch(base, hydrated),
        base,
        access.binding,
        redacted.map.orderedTokens,
      );
      const refinedCanonical = canonical(refined);
      const refinedDigest = await sha256Hex(refinedCanonical);

      const { data: completed, error: completeErr } = await admin.rpc(
        "complete_product_result_refinement",
        {
          p_refinement_id: refinementId,
          p_lease_token: leaseToken,
          p_result: refined,
          p_result_canonical: refinedCanonical,
          p_result_digest: refinedDigest,
        },
      );
      const done = (completed ?? {}) as Record<string, unknown>;
      if (completeErr || done.ok !== true) {
        // Резултатът е изготвен от вече платено извикване, но записът е неясен.
        return await reconcileRefinement("persist_unknown", callId);
      }
      return json(
        {
          status: "ready",
          replay: done.replay === true,
          result: done.result,
          result_digest: done.result_digest,
          base_result_digest: baseDigest,
          correlation_id: cid,
        },
        200,
        headers,
      );
    } catch (error) {
      // При трайно доказателство за извикване включеното уточнение НЕ се
      // освобождава — дори при негоден изход. Освобождаване е допустимо САМО при
      // детерминиран провал БЕЗ доказано извикване (например редакция на данни).
      const outcome = decideRefinementOutcome({ providerEvidence, error });
      if (outcome.action === "reconcile") {
        return await reconcileRefinement(outcome.code, `${refinementId}:refinement`);
      }
      await failRefinement(outcome.code);
      const message = error instanceof ProductRefinementError
        ? refinementMessage(error.reason)
        : MESSAGES.refinement_failed;
      return fail("refinement_failed", 409, headers, cid, message);
    }
  } catch {
    return fail("internal", 500, headers, cid);
  }
});
