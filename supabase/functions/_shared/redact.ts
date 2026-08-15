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
