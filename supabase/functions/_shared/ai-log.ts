/**
 * Безопасно логване на суров AI изход и на извършената поправка.
 *
 * Цел: да можем да диагностицираме повторяеми дефекти (счупен JSON, отрязан
 * отговор, неескейпнати кавички) БЕЗ да блокираме потребителя и БЕЗ да изнасяме
 * чувствителни данни в логовете. Всичко минава през `maskSensitive`.
 *
 * Логването е винаги "fire and forget" — никога не хвърля.
 */

/** Максимална дължина на един запис в лога. */
const SNIPPET = 700;

const MASKS: Array<[RegExp, string]> = [
  // e-mail
  [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gi, "«email»"],
  // IBAN (BG и общо)
  [/\b[A-Z]{2}\d{2}[A-Z0-9]{10,26}\b/g, "«iban»"],
  // карти
  [/\b(?:\d[ -]?){13,19}\b/g, "«card»"],
  // ЕГН / ЕИК / БУЛСТАТ
  [/\b\d{9,10}\b/g, "«id»"],
  // телефони
  [/(?:\+?359|00359|0)\s*(?:\d[\s-]?){8,12}/g, "«phone»"],
  // лична карта
  [/(?:лична\s*карта|л\.?\s?к\.?|ид\.?\s*№)\s*[:№]?\s*\d{5,12}/gi, "«idcard»"],
  // адреси
  [/(?:гр\.|град|с\.|село|ул\.|улица|бул\.|булевард|ж\.к\.|кв\.)\s+[А-ЯA-Z][^\n,.;]{2,60}/g, "«address»"],
  // токени / ключове
  [/\b(?:sk|pk|rk)_[A-Za-z0-9_-]{8,}\b/g, "«secret»"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, "«jwt»"],
];

/** Заменя чувствителните данни с неутрални маркери. Идемпотентно и безопасно. */
export function maskSensitive(input: string): string {
  if (!input) return "";
  let out = input;
  for (const [re, token] of MASKS) out = out.replace(re, token);
  // Три последователни главни-малки думи = вероятно три имена.
  out = out.replace(
    /(?<![A-Za-zА-Яа-я])[А-ЯA-Z][а-яa-z]{1,20}\s+[А-ЯA-Z][а-яa-z]{1,20}\s+[А-ЯA-Z][а-яa-z]{1,20}(?![A-Za-zА-Яа-я])/g,
    "«name»",
  );
  return out;
}

/** Маскиран и скъсен фрагмент (начало + край), удобен за лог. */
export function maskedSnippet(raw: string, limit = SNIPPET): string {
  const masked = maskSensitive(raw ?? "");
  if (masked.length <= limit) return masked;
  const half = Math.floor(limit / 2);
  return `${masked.slice(0, half)} …[-${masked.length - limit} симв.]… ${masked.slice(-half)}`;
}

export interface RepairSummary {
  /** Какви трансформации бяха приложени. */
  steps: string[];
  beforeLength: number;
  afterLength: number;
  charDelta: number;
}

/** Описва разликата между суровия и поправения текст, без да разкрива съдържание. */
export function describeRepair(before: string, after: string): RepairSummary {
  const b = before ?? "";
  const a = after ?? "";
  const steps: string[] = [];
  const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

  if (/```/.test(b) && !/```/.test(a)) steps.push("stripped_markdown_fence");
  if (count(a, /\\"/g) > count(b, /\\"/g)) steps.push("escaped_quotes");
  if (count(a, /\\n|\\t|\\r|\\u00/g) > count(b, /\\n|\\t|\\r|\\u00/g)) steps.push("escaped_control_chars");
  if (count(b, /,\s*[}\]]/g) > count(a, /,\s*[}\]]/g)) steps.push("removed_trailing_commas");
  const closers = (s: string) => count(s, /[}\]]/g);
  if (closers(a) > closers(b)) steps.push("closed_containers");
  if (a.length < b.length && !steps.includes("stripped_markdown_fence")) steps.push("truncated_to_valid_prefix");
  if (steps.length === 0) steps.push("none");

  return { steps, beforeLength: b.length, afterLength: a.length, charDelta: a.length - b.length };
}

export interface AiOutputLogCtx {
  fn?: string;
  stage?: string;
  model?: string | null;
  outcome: "parsed" | "repaired" | "failed";
  raw: string;
  /** Поправеният текст, ако е имало ремонт. */
  repaired?: string;
  error?: unknown;
}

/**
 * Логва (маскиран) суров AI изход и извършената поправка.
 * Само console — попада в Server Logs, без да се персистира PII.
 */
export function logAiOutput(ctx: AiOutputLogCtx): void {
  try {
    const raw = ctx.raw ?? "";
    const entry: Record<string, unknown> = {
      tag: "ai_output",
      fn: ctx.fn ?? "unknown",
      stage: ctx.stage ?? "parse",
      model: ctx.model ?? null,
      outcome: ctx.outcome,
      raw_length: raw.length,
      raw_masked: maskedSnippet(raw),
    };
    if (typeof ctx.repaired === "string") entry.repair = describeRepair(raw, ctx.repaired);
    if (ctx.error) {
      entry.error = maskSensitive(
        String(ctx.error instanceof Error ? ctx.error.message : ctx.error),
      ).slice(0, 300);
    }
    const line = JSON.stringify(entry);
    if (ctx.outcome === "failed") console.error(line);
    else console.log(line);
  } catch {
    /* логването никога не чупи основния поток */
  }
}
