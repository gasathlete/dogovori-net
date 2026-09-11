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
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCors } from "../_shared/cors.ts";
import { correlationHeaders, getCorrelationId } from "../_shared/correlation.ts";
import {
  loadReadyPaidProduct,
  type PaidAccessDbClient,
} from "../_shared/product-paid-access.ts";
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
import {
  createProductModelPort,
  ProductModelGatewayError,
} from "../_shared/product-model-gateway.ts";
import {
  ProductRedactionError,
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_BODY_KEYS = Object.freeze(["entitlement_id", "instruction", "idempotency_key"]);

const MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  unauthorized: "Влезте в профила си, за да видите резултата.",
  invalid_body: "Заявката е непълна.",
  safety_gate: "Уточнението не може да се изготви за този документ.",
  refinement_failed:
    "Уточнението не беше изготвено. Включеното уточнение остава налично, а оригиналният резултат е непокътнат.",
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

    const access = await loadReadyPaidProduct(admin as unknown as PaidAccessDbClient, userId, entitlementId, {
      withSourceText: true,
    });
    if (!access.ok) return fail(access.code, access.status, headers, cid, access.message);
    if (access.spec.id !== "negotiation_package" || access.sourceText === null) {
      return fail("not_refinable", 409, headers, cid, refinementMessage("not_refinable"));
    }
    const base = access.result as NegotiationPackageResult;

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
        text: access.sourceText,
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
    if (!bound || !bound.modelCallAllowed || bound.userConfirmationRequired) {
      return fail("safety_gate", 409, headers, cid, MESSAGES.safety_gate);
    }

    const baseDigest = await sha256Hex(canonical(access.resultRaw));
    const instructionDigest = await sha256Hex(instruction);

    const { data: begun, error: beginErr } = await admin.rpc("begin_product_result_refinement", {
      p_user_id: userId,
      p_entitlement_id: entitlementId,
      p_base_result_digest: baseDigest,
      p_instruction_digest: instructionDigest,
      p_idempotency_key: idempotencyKey,
      p_lease_seconds: REFINEMENT_LEASE_SECONDS,
    });
    const claim = (begun ?? {}) as Record<string, unknown>;
    if (beginErr || claim.ok === undefined) return fail("internal", 500, headers, cid);
    if (claim.ok !== true) {
      const reason = String(claim.reason);
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
    const failRefinement = async (code: string) => {
      await admin.rpc("fail_product_result_refinement", {
        p_refinement_id: refinementId,
        p_lease_token: leaseToken,
        p_error_code: code,
      });
    };

    try {
      // Изходящият материал е редактиран детерминистично: към доставчика не
      // пътуват лични данни от документа.
      const redacted = redactProductBundle(access.sourceText, {
        instruction,
        base_result: JSON.parse(canonical(access.resultRaw)),
      });
      const apiKey = Deno.env.get("LOVABLE_API_KEY") ?? "";
      const port = createProductModelPort({ apiKey, fetchImpl: fetch });
      const response = await port.invoke({
        callId: `${refinementId}:refinement`,
        routeKey: "refinement",
        model: bound.model,
        maxInputTokens: bound.maxInputTokens,
        maxOutputTokens: bound.maxOutputTokens,
        payload: Object.freeze({
          stage: "refinement",
          policy_version: access.policyVersion,
          source: redacted.text,
          context: redacted.context,
        }),
      });

      const hydrated = JSON.parse(
        rehydrateProductOutput(JSON.stringify(response.output), redacted.map, []),
      );
      const refined = validateRefinedNegotiation(
        hydrated,
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
        await failRefinement("persist_failed");
        return fail("refinement_failed", 409, headers, cid, MESSAGES.refinement_failed);
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
      const code = error instanceof ProductRefinementError
        ? error.reason
        : error instanceof ProductRedactionError
          ? "redaction_failed"
          : error instanceof ProductModelGatewayError
            ? error.reason
            : "refinement_failed";
      await failRefinement(code);
      const message = error instanceof ProductRefinementError
        ? refinementMessage(error.reason)
        : MESSAGES.refinement_failed;
      return fail("refinement_failed", 409, headers, cid, message);
    }
  } catch {
    return fail("internal", 500, headers, cid);
  }
});
