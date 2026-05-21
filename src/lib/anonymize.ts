/**
 * Bulgarian PII anonymization helpers.
 *
 * Used in admin moderation views to strip names, emails, EGN/EIK
 * from contract / blank content before showing it to staff.
 *
 * Approach: deterministic regex replacement, returning a counter-based map
 * so repeated occurrences keep the same label ([ИМЕ-A] always refers to
 * the same string within one call).
 */

const EMAIL_RE = /\b[\w.+\-]+@[\w-]+\.[\w.-]+\b/gi;
const PHONE_RE = /(?:\+?359|0)\s*[\d\s\-()]{7,15}/g;
// Bulgarian EGN: 10 digits
const EGN_RE = /\b\d{10}\b/g;
// Bulgarian EIK/BULSTAT: 9 or 13 digits
const EIK_RE = /\b\d{9}(?:\d{4})?\b/g;
const IBAN_RE = /\bBG\d{2}[A-Z]{4}\d{14,20}\b/gi;

// Bulgarian / Latin proper-name heuristic: capitalized 2-4 word sequences.
// Conservative — only matches sequences that look like full names (Capital + lower).
const FULLNAME_RE =
  /\b([А-ЯA-Z][а-яa-z]{1,20})\s+([А-ЯA-Z][а-яa-z]{1,20})(?:\s+([А-ЯA-Z][а-яa-z]{1,20}))?\b/g;

const STOPWORDS = new Set([
  "Република", "България", "София", "Пловдив", "Варна", "Бургас", "Русе",
  "Чл", "Член", "Алинея", "Точка", "Глава", "Раздел",
  "Договор", "Страна", "Страните", "Възложител", "Изпълнител",
  "Купувач", "Продавач", "Наемател", "Наемодател",
  "Закон", "Кодекс", "Регламент", "Директива",
  "Настоящият", "Настоящата", "Настоящото",
]);

function makeCounter(prefix: string) {
  const map = new Map<string, string>();
  let n = 0;
  return (raw: string) => {
    const norm = raw.trim();
    if (map.has(norm)) return map.get(norm)!;
    n += 1;
    const label = `[${prefix}-${n}]`;
    map.set(norm, label);
    return label;
  };
}

export interface AnonymizeResult {
  text: string;
  replacements: number;
}

export function anonymize(text: string): AnonymizeResult {
  if (!text) return { text: "", replacements: 0 };
  let count = 0;
  let out = text;

  const emailRepl = makeCounter("EMAIL");
  const phoneRepl = makeCounter("ТЕЛ");
  const ibanRepl = makeCounter("IBAN");
  const nameRepl = makeCounter("ИМЕ");

  out = out.replace(EMAIL_RE, (m) => { count++; return emailRepl(m); });
  out = out.replace(IBAN_RE, (m) => { count++; return ibanRepl(m); });
  out = out.replace(PHONE_RE, (m) => { count++; return phoneRepl(m); });
  out = out.replace(EGN_RE, () => { count++; return "[ЕГН]"; });
  // EIK after EGN so 10-digit EGNs aren't caught by EIK pattern (EIK is 9 or 13).
  out = out.replace(EIK_RE, () => { count++; return "[ЕИК]"; });

  out = out.replace(FULLNAME_RE, (match, a: string, b: string, c?: string) => {
    if (STOPWORDS.has(a) || STOPWORDS.has(b) || (c && STOPWORDS.has(c))) return match;
    count++;
    return nameRepl(match);
  });

  return { text: out, replacements: count };
}

/**
 * Walk a parsed contract payload and anonymize all string fields.
 * Returns a shallow clone with same structure.
 */
export function anonymizePayload<T>(payload: T): T {
  if (payload == null) return payload;
  if (typeof payload === "string") return anonymize(payload).text as unknown as T;
  if (Array.isArray(payload)) {
    return payload.map((item) => anonymizePayload(item)) as unknown as T;
  }
  if (typeof payload === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
      out[k] = anonymizePayload(v);
    }
    return out as T;
  }
  return payload;
}
