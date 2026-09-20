/**
 * Редакция на чувствителни данни за админ логове и stack trace.
 *
 * Принцип: запазваме диагностично полезния контекст (имена на полета, типове,
 * дължини, файл:ред в stack trace, HTTP код), но заменяме самите стойности с
 * неутрални маркери. Функциите са идемпотентни и никога не хвърлят.
 */

/** Ключове, чиито стойности никога не влизат в лог (JSON полета и headers). */
const SENSITIVE_KEYS = [
  "authorization",
  "apikey",
  "api_key",
  "x-api-key",
  "cookie",
  "set-cookie",
  "x-qa-cron",
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "jwt",
  "password",
  "pass",
  "secret",
  "client_secret",
  "signature",
  "otp",
  "code",
  "egn",
  "pin",
  "eik",
  "iban",
  "card",
  "cvv",
  "email",
  "phone",
  "address",
  "full_name",
  "display_name",
  "first_name",
  "last_name",
  "name",
  "party",
  "signer_name",
  "signer_email",
];

const KEY_RE = new RegExp(
  `("(?:${SENSITIVE_KEYS.join("|")})"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`,
  "gi",
);

/** Header-и в текстов вид: `Authorization: Bearer …`. */
const HEADER_RE = new RegExp(
  `\\b(${SENSITIVE_KEYS.join("|")})\\b(\\s*[:=]\\s*)(?:Bearer\\s+)?[^\\s,;"']+`,
  "gi",
);

const VALUE_MASKS: Array<[RegExp, string]> = [
  // JWT / Bearer
  [/\bey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]+/g, "«jwt»"],
  [/\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*/gi, "Bearer «token»"],
  // API ключове
  [/\b(?:sk|pk|rk|whsec)_[A-Za-z0-9_-]{8,}\b/g, "«apikey»"],
  [/\bsb(?:p|s)?_[A-Za-z0-9_-]{16,}\b/g, "«apikey»"],
  // e-mail
  [/\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/gi, "«email»"],
  // IBAN
  [/\b[A-Z]{2}\d{2}[A-Z0-9]{10,26}\b/g, "«iban»"],
  // карти
  [/\b(?:\d[ -]?){13,19}\b/g, "«card»"],
  // телефони
  [/(?:\+?359|00359|0)\s*(?:\d[\s-]?){8,12}/g, "«phone»"],
  // ЕГН / ЕИК / БУЛСТАТ
  [/\b\d{9,10}\b/g, "«id»"],
  // токени в query string (?token=…, &access_token=…)
  [/([?&](?:token|access_token|apikey|key|signature|otp|code)=)[^&\s]+/gi, "$1«redacted»"],
  // адреси
  [/(?:гр\.|град|с\.|село|ул\.|улица|бул\.|булевард|ж\.к\.|кв\.)\s+[А-ЯA-Z][^\n,.;]{2,60}/g, "«address»"],
];

/** Три последователни изписани с главна буква думи = вероятно име на човек. */
const NAME_RE =
  /(?<![A-Za-zА-Яа-я])[А-ЯA-Z][а-яa-z]{1,20}\s+[А-ЯA-Z][а-яa-z]{1,20}\s+[А-ЯA-Z][а-яa-z]{1,20}(?![A-Za-zА-Яа-я])/g;

/** Маскира чувствителни стойности в произволен текст, пазейки структурата. */
export function redactText(input: string): string {
  if (!input) return "";
  let out = input;
  out = out.replace(KEY_RE, '$1"«redacted»"');
  out = out.replace(HEADER_RE, "$1$2«redacted»");
  for (const [re, rep] of VALUE_MASKS) out = out.replace(re, rep);
  out = out.replace(NAME_RE, "«name»");
  return out;
}

/** Скъсява текст, като пази началото и края (най-информативните части). */
export function clampText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const half = Math.max(40, Math.floor(maxLen / 2));
  return `${text.slice(0, half)} …[-${text.length - maxLen} симв.]… ${text.slice(-half)}`;
}

/** Маскиран и ограничен фрагмент за лог (приема и обекти). */
export function redactForLog(value: unknown, maxLen = 600): string {
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  } catch {
    text = String(value);
  }
  return clampText(redactText(text ?? ""), maxLen);
}

/**
 * Редактира stack trace: запазва функция, файл и ред (полезния контекст),
 * но премахва query параметри, токени и абсолютни локални пътища.
 */
export function redactStack(stack: string, maxFrames = 20): string {
  if (!stack) return "";
  const lines = stack.split("\n");
  const out: string[] = [];
  let frames = 0;
  for (const raw of lines) {
    const isFrame = /^\s*at\s/.test(raw);
    if (isFrame && frames >= maxFrames) continue;
    let line = raw;
    // Премахваме query/hash от URL-ите в кадрите (може да носят токени).
    line = line.replace(/(https?:\/\/[^\s):]+?)[?#][^\s):]*/g, "$1");
    // Съкращаваме дълги файлови пътища до последните две части.
    line = line.replace(/(?:\/[\w.@%+-]+){3,}?\/([\w.@%+-]+\/[\w.@%+-]+)(?=:\d|\))/g, "…/$1");
    line = redactText(line);
    if (isFrame) frames++;
    out.push(line);
  }
  if (frames >= maxFrames) out.push(`    … [кадрите след ${maxFrames} са отрязани]`);
  return clampText(out.join("\n"), 2400);
}

/** Редактира обект „детайли“ по ключ и стойност, пазейки числа/булеви. */
export function redactDetail(
  detail: Record<string, unknown>,
  maxLen = 300,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(detail ?? {})) {
    if (SENSITIVE_KEYS.includes(k.toLowerCase())) {
      out[k] = "«redacted»";
      continue;
    }
    out[k] = typeof v === "number" || typeof v === "boolean" || v === null ? v : redactForLog(v, maxLen);
  }
  return out;
}


/* ---------------------------------------------------------------------------
 * Детерминирана PII редакция за payload-и към AI моделите.
 *
 * Мапингът живее САМО в паметта на извикващия — никога не се записва и логва.
 * `unredact` връща оригиналните стойности в изхода на модела, когато текстът
 * трябва да се покаже на потребителя.
 * ------------------------------------------------------------------------- */

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
const AI_NAME_RE = new RegExp(
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

/**
 * Токен, устойчив на колизии: солта е различна при ВСЯКО извикване.
 *
 * Предвидими обозначения като `<EMAIL_1>` могат да се съдържат буквално във
 * входния документ (или да бъдат вкарани умишлено) и при разкриването да
 * получат чужда стойност. Солта прави това практически невъзможно, без да
 * разваля четимостта за модела.
 */
/**
 * Солта е САМО букви. Цифри в солта могат да бъдат разпознати от следващите
 * правила (телефон/ЕГН) и токенът да бъде подменен втори път — тогава
 * `unredact` не намира ключа и оригиналната стойност не се връща.
 */
function alphaOnlySalt(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "").replace(
    /[0-9]/g,
    (d) => String.fromCharCode(113 + Number(d)), // 0-9 -> q..z
  );
}

function makeCallSalt(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return alphaOnlySalt(Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""));
}

function makeCounter(
  prefix: string,
  mapping: RedactionMapping,
  stats: Record<string, number>,
  salt: string,
) {
  const seen = new Map<string, string>();
  let n = 0;
  return (raw: string) => {
    const norm = raw.trim();
    if (seen.has(norm)) return seen.get(norm)!;
    n += 1;
    const placeholder = `<${prefix}_${n}_${salt}>`;
    seen.set(norm, placeholder);
    mapping[placeholder] = norm;
    stats[prefix.toLowerCase()] = (stats[prefix.toLowerCase()] ?? 0) + 1;
    return placeholder;
  };
}

export function redactForAI(input: string, tokenSalt?: string): RedactionResult {
  if (!input) return { redacted: "", mapping: {}, stats: {} };

  const mapping: RedactionMapping = {};
  const stats: Record<string, number> = {};
  const salt = tokenSalt && /^[a-z0-9]{4,32}$/i.test(tokenSalt)
    ? alphaOnlySalt(tokenSalt)
    : makeCallSalt();
  let out = input;

  // Order matters: email/IBAN/ID_CARD first (съдържат цифрови серии). После
  // EGN (10 точни цифри) ПРЕДИ phone, защото EGN-та започващи с "0" (родени
  // 2000+) се хващат от phone regex и водят до грешна редакция.
  out = out.replace(EMAIL_RE, makeCounter("EMAIL", mapping, stats, salt));
  out = out.replace(IBAN_RE, makeCounter("IBAN", mapping, stats, salt));
  out = out.replace(ID_CARD_RE, makeCounter("ID_CARD", mapping, stats, salt));
  out = out.replace(EGN_RE, makeCounter("EGN", mapping, stats, salt));
  out = out.replace(PHONE_RE, makeCounter("PHONE", mapping, stats, salt));
  out = out.replace(ADDRESS_RE, makeCounter("ADDRESS", mapping, stats, salt));

  const nameCounter = makeCounter("NAME", mapping, stats, salt);
  out = out.replace(AI_NAME_RE, (match, a: string, b: string, c?: string) => {
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
  EGN_RE.lastIndex = 0; IBAN_RE.lastIndex = 0; EMAIL_RE.lastIndex = 0;
  return EGN_RE.test(text) || IBAN_RE.test(text) || EMAIL_RE.test(text);
}
