// Single wrapper around Lovable AI Gateway. Enforces:
//  - redacted payload when classification requires it;
//  - controlled fallback (same payload, only to allowed models);
//  - content-free audit log entry per call.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Classification } from "./classify.ts";
import type { AIOperation, RouteDecision } from "./model-router.ts";
import { hasLeakedPII } from "./redact.ts";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export interface AICallInput {
  operation: AIOperation;
  classification: Classification;
  route: RouteDecision;
  userId: string | null;
  teamId?: string | null;
  // The (already redacted, if required) messages.
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  // Pass-through generation params.
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "json_object" | "text";
}

export interface AICallResult {
  ok: boolean;
  status: number;
  modelUsed: string;
  fallbackUsed: boolean;
  fallbackModel: string | null;
  // Raw provider response body when ok=true, else null. Caller is responsible
  // for parsing; never log this verbatim.
  data: unknown;
  errorCode?: string;
  errorMessage?: string;
  tokensIn?: number;
  tokensOut?: number;
}

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

async function logAudit(row: {
  user_id: string | null;
  team_id?: string | null;
  operation: AIOperation;
  model: string;
  fallback_used: boolean;
  fallback_model: string | null;
  classification: Classification;
  redaction_applied: boolean;
  tokens_in?: number;
  tokens_out?: number;
  status: "ok" | "blocked" | "error";
  error_code?: string;
}) {
  try {
    const sb = adminClient();
    await sb.from("ai_audit_log").insert({
      user_id: row.user_id,
      team_id: row.team_id ?? null,
      operation: row.operation,
      model: row.model,
      fallback_used: row.fallback_used,
      fallback_model: row.fallback_model,
      risk_level: row.classification.risk_level,
      redaction_applied: row.redaction_applied,
      contains_personal_data: row.classification.contains_personal_data,
      contains_special_category_data: row.classification.contains_special_category_data,
      tokens_in: row.tokens_in ?? null,
      tokens_out: row.tokens_out ?? null,
      status: row.status,
      error_code: row.error_code ?? null,
    });
  } catch (_e) {
    // Never fail the request because audit log failed.
  }
}

/**
 * Public helper for functions that don't use aiCall() (e.g. analyze-contract
 * which has its own fallback/verification pipeline) but still need to write
 * a metadata-only audit row.
 */
export async function logAiAudit(row: {
  user_id: string | null;
  team_id?: string | null;
  operation: AIOperation;
  model: string;
  fallback_used?: boolean;
  fallback_model?: string | null;
  classification: Classification;
  redaction_applied: boolean;
  tokens_in?: number;
  tokens_out?: number;
  status: "ok" | "blocked" | "error";
  error_code?: string;
}) {
  await logAudit({
    user_id: row.user_id,
    team_id: row.team_id,
    operation: row.operation,
    model: row.model,
    fallback_used: row.fallback_used ?? false,
    fallback_model: row.fallback_model ?? null,
    classification: row.classification,
    redaction_applied: row.redaction_applied,
    tokens_in: row.tokens_in,
    tokens_out: row.tokens_out,
    status: row.status,
    error_code: row.error_code,
  });
}

/**
 * Residency guard. Returns true when the caller's user/team requires
 * EU-only AI processing. The Lovable AI Gateway routes globally, so when
 * EU-only is enforced we refuse the call and surface a clear block code
 * instead of silently exfiltrating data outside the EEA.
 */
async function isEuOnlyRequired(userId: string | null, teamId?: string | null): Promise<boolean> {
  if (!userId && !teamId) return false;
  try {
    const sb = adminClient();
    if (teamId) {
      const { data } = await sb.from("teams").select("eu_only_ai").eq("id", teamId).maybeSingle();
      if ((data as { eu_only_ai?: boolean } | null)?.eu_only_ai) return true;
    }
    if (userId) {
      const { data } = await sb.from("profiles").select("allow_third_country_ai").eq("id", userId).maybeSingle();
      // allow_third_country_ai === false ⇒ EU-only required
      if (data && (data as { allow_third_country_ai?: boolean }).allow_third_country_ai === false) return true;
    }
  } catch (e) {
    console.error("isEuOnlyRequired check failed (non-fatal, defaulting to allow):", e);
  }
  return false;
}

export async function aiCall(input: AICallInput): Promise<AICallResult> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) {
    await logAudit({
      user_id: input.userId,
      team_id: input.teamId,
      operation: input.operation,
      model: input.route.model,
      fallback_used: false,
      fallback_model: null,
      classification: input.classification,
      redaction_applied: input.route.redactionRequired,
      status: "error",
      error_code: "missing_api_key",
    });
    return {
      ok: false,
      status: 500,
      modelUsed: input.route.model,
      fallbackUsed: false,
      fallbackModel: null,
      data: null,
      errorCode: "missing_api_key",
      errorMessage: "AI gateway misconfigured",
    };
  }

  // EU-only data residency hard guard. Blocks the call when the user
  // (or their team) has opted out of third-country AI processing.
  if (await isEuOnlyRequired(input.userId, input.teamId)) {
    await logAudit({
      user_id: input.userId,
      team_id: input.teamId,
      operation: input.operation,
      model: input.route.model,
      fallback_used: false,
      fallback_model: null,
      classification: input.classification,
      redaction_applied: input.route.redactionRequired,
      status: "blocked",
      error_code: "eu_only_ai_residency_block",
    });
    return {
      ok: false,
      status: 451,
      modelUsed: input.route.model,
      fallbackUsed: false,
      fallbackModel: null,
      data: null,
      errorCode: "eu_only_ai_residency_block",
      errorMessage: "AI обработката е ограничена до ЕИП по Ваше желание. Изключете „Само EU AI обработка" в Настройки, за да продължите.",
    };
  }


  // Belt-and-suspenders: if redaction was required, refuse to send raw PII.
  if (input.route.redactionRequired) {
    const userContent = input.messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n");
    if (hasLeakedPII(userContent)) {
      await logAudit({
        user_id: input.userId,
        team_id: input.teamId,
        operation: input.operation,
        model: input.route.model,
        fallback_used: false,
        fallback_model: null,
        classification: input.classification,
        redaction_applied: false,
        status: "blocked",
        error_code: "pii_leaked_in_payload",
      });
      return {
        ok: false,
        status: 422,
        modelUsed: input.route.model,
        fallbackUsed: false,
        fallbackModel: null,
        data: null,
        errorCode: "pii_leaked_in_payload",
        errorMessage: "Refusing to send unredacted PII to AI",
      };
    }
  }

  const callOnce = async (modelName: string) => {
    const body: Record<string, unknown> = {
      model: modelName,
      messages: input.messages,
    };
    if (typeof input.temperature === "number") body.temperature = input.temperature;
    if (typeof input.maxTokens === "number") body.max_tokens = input.maxTokens;
    if (input.responseFormat === "json_object") {
      body.response_format = { type: "json_object" };
    }
    return await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "edge-function",
      },
      body: JSON.stringify(body),
    });
  };

  const chain = [input.route.model, ...(input.route.allowFallback ? input.route.fallbackChain : [])];
  let lastResp: Response | null = null;
  let lastErrorBody: string | null = null;
  let modelUsed = input.route.model;
  let fallbackUsed = false;
  let fallbackModel: string | null = null;

  for (let i = 0; i < chain.length; i++) {
    const m = chain[i];
    const resp = await callOnce(m);
    lastResp = resp;
    if (resp.ok) {
      modelUsed = m;
      fallbackUsed = i > 0;
      fallbackModel = i > 0 ? m : null;
      let data: unknown = null;
      let tokensIn: number | undefined;
      let tokensOut: number | undefined;
      try {
        data = await resp.json();
        const usage = (data as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
        tokensIn = usage?.prompt_tokens;
        tokensOut = usage?.completion_tokens;
      } catch {
        // Body not JSON — treat as error.
        await logAudit({
          user_id: input.userId,
          team_id: input.teamId,
          operation: input.operation,
          model: m,
          fallback_used: fallbackUsed,
          fallback_model: fallbackModel,
          classification: input.classification,
          redaction_applied: input.route.redactionRequired,
          status: "error",
          error_code: "invalid_json_response",
        });
        return {
          ok: false,
          status: resp.status,
          modelUsed,
          fallbackUsed,
          fallbackModel,
          data: null,
          errorCode: "invalid_json_response",
        };
      }
      await logAudit({
        user_id: input.userId,
        team_id: input.teamId,
        operation: input.operation,
        model: modelUsed,
        fallback_used: fallbackUsed,
        fallback_model: fallbackModel,
        classification: input.classification,
        redaction_applied: input.route.redactionRequired,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        status: "ok",
      });
      return {
        ok: true,
        status: resp.status,
        modelUsed,
        fallbackUsed,
        fallbackModel,
        data,
        tokensIn,
        tokensOut,
      };
    }
    // Capture error body without logging full content.
    try {
      lastErrorBody = (await resp.text()).slice(0, 500);
    } catch {
      lastErrorBody = null;
    }
    // Only retry on 5xx (and 429). Stop on 4xx other than 429.
    if (resp.status < 500 && resp.status !== 429) break;
    // Stop if fallback chain exhausted.
  }

  await logAudit({
    user_id: input.userId,
    team_id: input.teamId,
    operation: input.operation,
    model: modelUsed,
    fallback_used: fallbackUsed,
    fallback_model: fallbackModel,
    classification: input.classification,
    redaction_applied: input.route.redactionRequired,
    status: "error",
    error_code: lastResp ? `http_${lastResp.status}` : "no_response",
  });

  return {
    ok: false,
    status: lastResp?.status ?? 500,
    modelUsed,
    fallbackUsed,
    fallbackModel,
    data: null,
    errorCode: lastResp ? `http_${lastResp.status}` : "no_response",
    errorMessage: lastErrorBody ?? undefined,
  };
}
