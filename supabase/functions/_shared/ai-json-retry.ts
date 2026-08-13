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
    console.error("ai-json-retry gateway error:", resp.status, (await resp.text()).slice(0, 300));
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
  const ok = (v: unknown) => v != null && (!o.validate || o.validate(v));
  const genOpts = { temperature: o.temperature, maxTokens: o.maxTokens };
  let attempts = 1;

  // 1) Local tolerant parse.
  try {
    const parsed = extractJson(o.content, { fn: o.fn });
    if (ok(parsed)) return { parsed, stage: "direct", attempts };
  } catch (err) {
    console.error(`${o.fn}: JSON parse failed (direct):`, err instanceof Error ? err.message : err);
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
      const parsed = extractJson(repaired, { fn: o.fn, stage: "repair" });
      if (ok(parsed)) return { parsed, stage: "repair", attempts };
    }
  } catch (err) {
    console.error(`${o.fn}: JSON repair retry failed:`, err instanceof Error ? err.message : err);
  }

  // 3) Full regeneration with the user's original request preserved.
  const rounds = Math.max(0, o.regenerateAttempts ?? 1);
  for (let i = 0; i < rounds; i++) {
    attempts++;
    try {
      const messages: AiMessage[] = [...o.messages, { role: "system", content: STRICT_JSON_REMINDER }];
      const regenerated = await callGateway(o.apiKey, o.model, messages, genOpts);
      if (!regenerated) continue;
      const parsed = extractJson(regenerated, { fn: o.fn, stage: `regenerate-${i + 1}` });
      if (ok(parsed)) return { parsed, stage: "regenerate", attempts };
    } catch (err) {
      console.error(`${o.fn}: JSON regenerate attempt ${i + 1} failed:`, err instanceof Error ? err.message : err);
    }
  }

  throw new Error("AI отговорът не може да бъде анализиран като JSON. Моля опитайте отново.");
}
