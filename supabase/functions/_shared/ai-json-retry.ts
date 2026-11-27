// Shared: parse an LLM answer as JSON with automatic retries that never lose
// the user's original request.
//
// Escalation ladder:
//   1. tolerant local parse (extractJson)
//   2. "repair" call — model gets its own broken output and must fix syntax only
//   3. full re-generation with the SAME original messages (+ a strict-JSON
//      reminder), so the user's request is re-answered instead of dropped
//
// No client-side timeouts are applied: generation may legitimately take
// minutes and aborting would discard work that still completes.

import { extractJson } from "./json.ts";
import { logAiOutput, maskSensitive } from "./ai-log.ts";
import { logAiParseFailure } from "./jsonDiagnostics.ts";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type AiMessage = { role: "system" | "user" | "assistant"; content: string };

export interface AiJsonRetryOptions {
  /** Raw content of the first AI answer (may be broken JSON). */
  content: string;
  /** Original request messages — reused for full regeneration. */
  messages: AiMessage[];
  model: string;
  apiKey: string;
  /** Edge function name, for the admin AI-JSON diagnostics panel. */
  fn: string;
  /** Extra generation params to mirror on retries. */
  temperature?: number;
  maxTokens?: number;
  /** How many regeneration attempts after the repair call. Default 1. */
  regenerateAttempts?: number;
  /** Optional guard: reject a structurally valid but useless object. */
  validate?: (parsed: unknown) => boolean;
  /** Correlation ID of the originating request — appears in every log line. */
  correlationId?: string;
}

/** Error thrown when every escalation step failed; carries the correlation ID. */
export class AiJsonUnparsableError extends Error {
  readonly correlationId?: string;
  constructor(message: string, correlationId?: string) {
    super(message);
    this.name = "AiJsonUnparsableError";
    this.correlationId = correlationId;
  }
}

export interface AiJsonRetryResult<T = any> {
  parsed: T;
  /** "direct" | "repair" | "regenerate" */
  stage: "direct" | "repair" | "regenerate";
  attempts: number;
}

async function callGateway(
  apiKey: string,
  model: string,
  messages: AiMessage[],
  opts: { temperature?: number; maxTokens?: number },
): Promise<string | null> {
  const body: Record<string, unknown> = {
    model,
    messages,
    response_format: { type: "json_object" },
  };
  if (typeof opts.temperature === "number") body.temperature = opts.temperature;
  if (typeof opts.maxTokens === "number") body.max_tokens = opts.maxTokens;

  const resp = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    console.error("ai-json-retry gateway error:", resp.status, maskSensitive((await resp.text()).slice(0, 300)));
    return null;
  }
  const data = await resp.json().catch(() => null);
  const out: string = data?.choices?.[0]?.message?.content ?? "";
  return out && out.trim() ? out : null;
}

const REPAIR_SYSTEM =
  "Ти си JSON repair асистент. Върни СТРОГО валиден JSON обект без markdown, без коментари и без обяснения. " +
  "Запази цялото съдържание и структура от входа — поправи само синтактичните грешки (неескейпнати кавички, " +
  "control chars, липсващи скоби, trailing запетаи, отрязан край).";

const STRICT_JSON_REMINDER =
  "КРИТИЧНО: Върни изхода САМО като един валиден JSON обект. Без markdown ограждения, без текст преди или след JSON-а. " +
  "Всички кавички вътре в стрингове трябва да са ескейпнати (\\\"), без нови редове извън \\n ескейпи, без trailing запетаи. " +
  "Не съкращавай и не прекъсвай JSON-а — завърши всички скоби.";

/**
 * Parse `content` as JSON, retrying with the AI when needed.
 * Throws only after every escalation step failed.
 */
export async function parseAiJsonWithRetry<T = any>(
  o: AiJsonRetryOptions,
): Promise<AiJsonRetryResult<T>> {
  const cid = o.correlationId ? ` [cid=${o.correlationId}]` : "";
  const ok = (v: unknown) => v != null && (!o.validate || o.validate(v));
  const genOpts = { temperature: o.temperature, maxTokens: o.maxTokens };
  let attempts = 1;

  // 1) Local tolerant parse.
  try {
    const parsed = extractJson(o.content, { fn: o.fn, correlationId: o.correlationId });
    if (ok(parsed)) return { parsed, stage: "direct", attempts };
  } catch (err) {
    console.error(
      `${o.fn}${cid}: JSON parse failed (direct):`,
      maskSensitive(String(err instanceof Error ? err.message : err)),
    );
  }

  // 2) Repair call on the broken output.
  attempts++;
  try {
    const repaired = await callGateway(
      o.apiKey,
      o.model,
      [
        { role: "system", content: REPAIR_SYSTEM },
        { role: "user", content: `Поправи следния почти-JSON и върни валиден JSON обект:\n\n${o.content}` },
      ],
      genOpts,
    );
    if (repaired) {
      const parsed = extractJson(repaired, { fn: o.fn, model: o.model, stage: "repair", correlationId: o.correlationId });
      if (ok(parsed)) {
        logAiOutput({ fn: o.fn, correlationId: o.correlationId, model: o.model, stage: "repair", outcome: "repaired", raw: o.content, repaired });
        return { parsed, stage: "repair", attempts };
      }
    }
  } catch (err) {
    console.error(
      `${o.fn}${cid}: JSON repair retry failed:`,
      maskSensitive(String(err instanceof Error ? err.message : err)),
    );
  }

  // 3) Full regeneration with the user's original request preserved.
  const rounds = Math.max(0, o.regenerateAttempts ?? 1);
  for (let i = 0; i < rounds; i++) {
    attempts++;
    try {
      const messages: AiMessage[] = [...o.messages, { role: "system", content: STRICT_JSON_REMINDER }];
      const regenerated = await callGateway(o.apiKey, o.model, messages, genOpts);
      if (!regenerated) continue;
      const parsed = extractJson(regenerated, { fn: o.fn, model: o.model, stage: `regenerate-${i + 1}`, correlationId: o.correlationId });
      if (ok(parsed)) {
        logAiOutput({
          fn: o.fn,
          correlationId: o.correlationId,
          model: o.model,
          stage: `regenerate-${i + 1}`,
          outcome: "repaired",
          raw: o.content,
          repaired: regenerated,
        });
        return { parsed, stage: "regenerate", attempts };
      }
    } catch (err) {
      console.error(
        `${o.fn}${cid}: JSON regenerate attempt ${i + 1} failed:`,
        maskSensitive(String(err instanceof Error ? err.message : err)),
      );
    }
  }

  logAiOutput({
    fn: o.fn,
    correlationId: o.correlationId,
    model: o.model,
    stage: "exhausted",
    outcome: "failed",
    raw: o.content,
  });

  // Безопасен диагностичен артефакт: САМО маскирани фрагменти, вид и позиция на
  // грешката (без пълния изход, без PII). Fire-and-forget — не блокира отговора.
  logAiParseFailure({
    fn: o.fn,
    model: o.model,
    stage: "exhausted",
    raw: o.content,
    error: new Error("repair and regenerate exhausted"),
    repairAttempted: true,
    correlationId: o.correlationId,
    attempts,
  });

  throw new AiJsonUnparsableError(
    "AI отговорът не може да бъде анализиран като JSON. Моля опитайте отново.",
    o.correlationId,
  );
}
