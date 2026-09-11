/**
 * Състояние на избора по поправка за ТОЧНО едно платено право.
 *
 * Две действия:
 *  - `status` — връща записания избор, версията му и състоянието на уточнението;
 *  - `save`   — записва изричните решения с оптимистична съгласуваност и връща
 *               детерминистично поправения текст.
 *
 * Изборът НИКОГА не се записва от браузъра: сървърът сам изчислява поправката
 * върху точния платен източник и сравнява обвързването. Общите операции и
 * квоти не се докосват — платеният продукт не харчи операции.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCors } from "../_shared/cors.ts";
import { correlationHeaders, getCorrelationId } from "../_shared/correlation.ts";
import { loadReadyPaidProduct } from "../_shared/product-paid-access.ts";
import {
  isSelectionProduct,
  ProductSelectionError,
  selectionMessage,
  validateExpectedVersion,
  validateIdempotencyKey,
  validateSelectionDecisions,
} from "../_shared/product-selections.ts";
import {
  buildProductPatch,
  patchMessage,
  ProductPatchError,
} from "../_shared/product-patch.ts";
import { MAX_REFINEMENTS } from "../_shared/product-result-contract.ts";
import type { CorrectionPayload } from "../_shared/product-result-contract.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_BODY_KEYS = Object.freeze([
  "entitlement_id",
  "action",
  "decisions",
  "expected_version",
  "idempotency_key",
]);

const MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  unauthorized: "Влезте в профила си, за да видите резултата.",
  invalid_body: "Заявката е непълна.",
  version_conflict: "Изборът е променен в друг раздел. Презаредете и опитайте отново.",
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

/** Каноничен, подреден по ключ JSON — един и същ резултат дава един и същ хеш. */
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
    const action = body.action;
    if (
      typeof entitlementId !== "string" ||
      !UUID_RE.test(entitlementId) ||
      (action !== "status" && action !== "save")
    ) {
      return fail("invalid_body", 400, headers, cid);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const access = await loadReadyPaidProduct(admin, userId, entitlementId, {
      withSourceText: action === "save",
    });
    if (!access.ok) return fail(access.code, access.status, headers, cid, access.message);
    if (!isSelectionProduct(access.spec.id)) {
      return fail("product_not_selectable", 409, headers, cid, selectionMessage("product_not_selectable"));
    }
    const payload = access.result.payload as CorrectionPayload;
    const resultDigest = await sha256Hex(canonical(access.resultRaw));

    if (action === "status") {
      const { data: state, error } = await admin.rpc("load_product_result_state", {
        p_user_id: userId,
        p_entitlement_id: entitlementId,
        p_result_digest: resultDigest,
      });
      const row = (state ?? {}) as Record<string, unknown>;
      if (error || row.ok !== true) return fail("internal", 500, headers, cid);
      const history = Array.isArray(row.refinement_history) ? row.refinement_history : [];
      const succeeded = history.filter(
        (item) => (item as Record<string, unknown>)?.status === "succeeded",
      ).length;
      return json(
        {
          status: "ready",
          product_id: access.spec.id,
          result_digest: resultDigest,
          selection_version: row.selection_version ?? 0,
          decisions: row.decisions ?? [],
          patch_output_hash: row.patch_output_hash ?? null,
          corrections_count: payload.corrections.length,
          refinement:
            access.spec.id === "negotiation_package"
              ? {
                included: MAX_REFINEMENTS,
                used: succeeded,
                current: row.refinement ?? null,
              }
              : null,
          correlation_id: cid,
        },
        200,
        headers,
      );
    }

    // Записване: решенията са изрични за ВСЯКА поправка, а поправеният текст се
    // изчислява от сървъра върху точния платен източник.
    let decisions;
    let expectedVersion: number;
    let idempotencyKey: string;
    try {
      decisions = validateSelectionDecisions(payload.corrections, body.decisions);
      expectedVersion = validateExpectedVersion(body.expected_version);
      idempotencyKey = validateIdempotencyKey(body.idempotency_key);
    } catch (error) {
      if (error instanceof ProductSelectionError) {
        return fail(error.reason, 400, headers, cid, selectionMessage(error.reason));
      }
      throw error;
    }
    if (access.sourceText === null) return fail("internal", 500, headers, cid);

    let manifest;
    try {
      manifest = await buildProductPatch(
        {
          sourceText: access.sourceText,
          sourceBinding: access.binding,
          resultBinding: access.result.source,
          corrections: payload.corrections,
          decisions,
        },
        sha256Hex,
      );
    } catch (error) {
      if (error instanceof ProductPatchError) {
        return fail(error.reason, 409, headers, cid, patchMessage(error.reason));
      }
      throw error;
    }

    const { data: saved, error: saveErr } = await admin.rpc("save_product_result_selection", {
      p_user_id: userId,
      p_entitlement_id: entitlementId,
      p_result_digest: resultDigest,
      p_expected_version: expectedVersion,
      p_decisions: decisions,
      p_patch_output_hash: manifest.output_hash,
      p_idempotency_key: idempotencyKey,
    });
    const row = (saved ?? {}) as Record<string, unknown>;
    if (saveErr || (row.ok !== true && row.reason === undefined)) {
      return fail("internal", 500, headers, cid);
    }
    if (row.ok !== true) {
      const reason = String(row.reason);
      const status = reason === "version_conflict" ? 409 : reason === "not_found" ? 404 : 409;
      return json(
        {
          error: reason,
          message: MESSAGES[reason] ?? MESSAGES.internal,
          selection_version: row.selection_version ?? null,
          decisions: row.decisions ?? null,
          correlation_id: cid,
        },
        status,
        headers,
      );
    }

    return json(
      {
        status: "saved",
        replay: row.replay === true,
        selection_version: row.selection_version,
        result_digest: resultDigest,
        applied_count: manifest.applied_count,
        rejected_count: manifest.rejected_count,
        output_hash: manifest.output_hash,
        output_char_count: manifest.output_char_count,
        corrected_text: manifest.corrected_text,
        applied: manifest.applied,
        correlation_id: cid,
      },
      200,
      headers,
    );
  } catch {
    return fail("internal", 500, headers, cid);
  }
});
