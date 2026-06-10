// Deterministic PII redaction for payloads sent to AI models.
// The mapping is kept ONLY in the caller's memory; it must never be persisted
// or logged. `unredact` re-inserts the original values into model output when
// the caller needs to return the final text to the user.

export interface RedactionMapping {
  // placeholder -> original value
  [placeholder: string]: string;
}

export interface RedactionResult {
  redacted: string;
  mapping: RedactionMapping;
  stats: Record<string, number>;
}

const EMAIL_RE = /\b[\w.+\-]+@[\w-]+\.[\w.-]+\b/gi;
const PHONE_RE = /(?:\+?359|0)\s*[\d\s\-()]{7,15}/g;
const EGN_RE = /\b\d{10}\b/g;
const IBAN_RE = /\bBG\d{2}[A-Z]{4}\d{14,20}\b/gi;
const CYR_LB = "(?<![A-Za-zА-Яа-я])";
const CYR_RB = "(?![A-Za-zА-Яа-я])";
const ID_CARD_RE = new RegExp(
  CYR_LB + "(?:лична\\s*карта|л\\.?к\\.?|ид\\.?\\s*№)\\s*[:№]?\\s*\\d{6,12}" + CYR_RB,
  "gi",
);
const ADDRESS_RE = new RegExp(
  CYR_LB + "(?:гр\\.|град|с\\.|село|ул\\.|улица|бул\\.|булевард|ж\\.к\\.|кв\\.)\\s+[А-ЯA-Z][^\\n,.;]{2,80}",
  "g",
);
const NAME_RE = new RegExp(
  CYR_LB +
  "([А-ЯA-Z][а-яa-z]{1,20})\\s+([А-ЯA-Z][а-яa-z]{1,20})(?:\\s+([А-ЯA-Z][а-яa-z]{1,20}))?" +
  CYR_RB,
  "g",
);

const NAME_STOPWORDS = new Set([
  "Република","България","София","Пловдив","Варна","Бургас","Русе",
  "Чл","Член","Алинея","Точка","Глава","Раздел",
  "Договор","Страна","Страните","Възложител","Изпълнител",
  "Купувач","Продавач","Наемател","Наемодател",
  "Закон","Кодекс","Регламент","Директива",
  "Настоящият","Настоящата","Настоящото",
]);

function makeCounter(prefix: string, mapping: RedactionMapping, stats: Record<string, number>) {
  const seen = new Map<string, string>();
  let n = 0;
  return (raw: string) => {
    const norm = raw.trim();
    if (seen.has(norm)) return seen.get(norm)!;
    n += 1;
    const placeholder = `<${prefix}_${n}>`;
    seen.set(norm, placeholder);
    mapping[placeholder] = norm;
    stats[prefix.toLowerCase()] = (stats[prefix.toLowerCase()] ?? 0) + 1;
    return placeholder;
  };
}

export function redactForAI(input: string): RedactionResult {
  if (!input) return { redacted: "", mapping: {}, stats: {} };

  const mapping: RedactionMapping = {};
  const stats: Record<string, number> = {};
  let out = input;

  // Order matters: email/IBAN/ID_CARD first (съдържат цифрови серии). После
  // EGN (10 точни цифри) ПРЕДИ phone, защото EGN-та започващи с "0" (родени
  // 2000+) се хващат от phone regex и водят до грешна редакция.
  out = out.replace(EMAIL_RE, makeCounter("EMAIL", mapping, stats));
  out = out.replace(IBAN_RE, makeCounter("IBAN", mapping, stats));
  out = out.replace(ID_CARD_RE, makeCounter("ID_CARD", mapping, stats));
  out = out.replace(EGN_RE, makeCounter("EGN", mapping, stats));
  out = out.replace(PHONE_RE, makeCounter("PHONE", mapping, stats));
  out = out.replace(ADDRESS_RE, makeCounter("ADDRESS", mapping, stats));

  const nameCounter = makeCounter("NAME", mapping, stats);
  out = out.replace(NAME_RE, (match, a: string, b: string, c?: string) => {
    if (NAME_STOPWORDS.has(a) || NAME_STOPWORDS.has(b) || (c && NAME_STOPWORDS.has(c))) return match;
    return nameCounter(match);
  });

  return { redacted: out, mapping, stats };
}

export function unredact(text: string, mapping: RedactionMapping): string {
  if (!text || !mapping) return text;
  let out = text;
  // Replace longest placeholders first (e.g. <ID_CARD_10> before <ID_CARD_1>).
  const placeholders = Object.keys(mapping).sort((a, b) => b.length - a.length);
  for (const ph of placeholders) {
    // Escape regex specials in placeholder.
    const escaped = ph.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escaped, "g"), mapping[ph]);
  }
  return out;
}

/**
 * Safety check: returns true if the redacted output still contains obvious PII
 * patterns (used by tests / belt-and-suspenders before sending to model).
 */
export function hasLeakedPII(text: string): boolean {
  return EGN_RE.test(text) || IBAN_RE.test(text) || EMAIL_RE.test(text);
}
