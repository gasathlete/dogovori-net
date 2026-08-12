/**
 * Диагностика и логване на неуспешни AI JSON отговори.
 *
 * Целта: когато толерантният парсер (`extractJson`) все пак се провали, да
 * запишем ТОЧКАТА НА ПРЕКЪСВАНЕ и ПРЕДЛОЖЕНАТА КОРЕКЦИЯ, за да се вижда
 * причината в админ панела (/admin/ai-json), вместо потребителят да получи 500.
 */

export interface JsonBreak {
  /** Отместване в символи, където JSON.parse спира. */
  breakOffset: number | null;
  /** Кратък контекст около прекъсването (±120 символа). */
  breakContext: string;
  /** Класификация на причината. */
  breakKind:
    | "truncated_string"
    | "unclosed_container"
    | "trailing_comma"
    | "dangling_key"
    | "control_char"
    | "no_json_found"
    | "unknown";
  /** Човешко описание + предложената корекция на JSON. */
  suggestion: string;
  /** Липсващи затварящи скоби в правилен ред, ако има такива. */
  missingClosers: string;
}

/** Достъп до Deno env, без да чупи typecheck-а на фронтенда. */
function envGet(name: string): string | undefined {
  const g = globalThis as unknown as { Deno?: { env?: { get(n: string): string | undefined } } };
  try {
    return g.Deno?.env?.get(name);
  } catch {
    return undefined;
  }
}

function offsetFromError(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/position (\d+)/i);
  return m ? Number(m[1]) : null;
}

/** Сканира за отворени контейнери / незатворен стринг. */
function scan(src: string): { inStr: boolean; closers: string } {
  let inStr = false;
  let esc = false;
  const stack: string[] = [];
  for (const c of src) {
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if (c === "}" || c === "]") stack.pop();
  }
  return { inStr, closers: stack.reverse().join("") };
}

export function diagnoseJson(raw: string, err?: unknown): JsonBreak {
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = cleaned.search(/[\{\[]/);

  if (start === -1) {
    return {
      breakOffset: null,
      breakContext: cleaned.slice(0, 240),
      breakKind: "no_json_found",
      suggestion:
        "Отговорът не съдържа JSON обект/масив. Затегни системния промпт („върни само валиден JSON, без обяснения\") и/или включи structured output схема.",
      missingClosers: "",
    };
  }

  const body = cleaned.slice(start);
  const { inStr, closers } = scan(body);
  const offset = offsetFromError(err) ?? (inStr || closers ? body.length : null);
  const from = Math.max(0, (offset ?? body.length) - 120);
  const breakContext = body.slice(from, (offset ?? body.length) + 120);

  let breakKind: JsonBreak["breakKind"] = "unknown";
  let suggestion = "";

  if (inStr) {
    breakKind = "truncated_string";
    suggestion =
      `Отговорът е отрязан вътре в стринг (най-често лимит на токените). Корекция: премахни незавършена escape-последователност, добави затварящ \" и след това затвори контейнерите с „${closers}\". Увеличи max_tokens или намали обема на искания документ.`;
  } else if (closers) {
    breakKind = "unclosed_container";
    suggestion = `Липсват затварящи скоби. Корекция: добави „${closers}\" в този ред. Причина: отрязан отговор — увеличи max_tokens.`;
  } else if (/,\s*[}\]]/.test(body)) {
    breakKind = "trailing_comma";
    suggestion = "Има запетая преди затваряща скоба. Корекция: премахни trailing запетаите преди } или ].";
  } else if (/"(?:[^"\\]|\\.)*"\s*:\s*$/.test(body.trimEnd())) {
    breakKind = "dangling_key";
    suggestion = "Ключ без стойност в края. Корекция: премахни висящия ключ и затвори обекта.";
  } else if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(body)) {
    breakKind = "control_char";
    suggestion = "Неескейпнати контролни символи вътре в стринг. Корекция: замени ги с \\n / \\r / \\t / \\uXXXX.";
  } else {
    suggestion =
      "Структурата е синтактично невалидна на посочената позиция. Провери контекста и наложи structured output схема на модела.";
  }

  return { breakOffset: offset, breakContext, breakKind, suggestion, missingClosers: closers };
}

/**
 * Записва провала в public.ai_parse_failures (service role, fire-and-forget).
 * Никога не хвърля — логването не трябва да чупи основния поток.
 */
export function logAiParseFailure(ctx: {
  fn?: string;
  model?: string | null;
  stage?: string;
  raw: string;
  error: unknown;
  repairAttempted?: boolean;
}): void {
  try {
    const url = envGet("SUPABASE_URL");
    const key = envGet("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;

    const d = diagnoseJson(ctx.raw ?? "", ctx.error);
    const body = {
      fn: ctx.fn ?? envGet("SB_FUNCTION_NAME") ?? "unknown",
      model: ctx.model ?? null,
      stage: ctx.stage ?? "parse",
      error_message: String(ctx.error instanceof Error ? ctx.error.message : ctx.error).slice(0, 500),
      raw_length: (ctx.raw ?? "").length,
      break_offset: d.breakOffset,
      break_kind: d.breakKind,
      break_context: d.breakContext.slice(0, 2000),
      suggestion: d.suggestion,
      missing_closers: d.missingClosers,
      repair_attempted: ctx.repairAttempted ?? false,
      raw_tail: (ctx.raw ?? "").slice(-1500),
    };

    void fetch(`${url}/rest/v1/ai_parse_failures`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
