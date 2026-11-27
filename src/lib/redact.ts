/**
 * Клиентска редакция на чувствителни данни за админ логовете.
 *
 * Второ ниво на защита: дори ако в базата попадне немаскирана стойност
 * (стар запис или външна грешка), тя не се показва в админ таблата.
 * Полезният контекст (полета, HTTP кодове, файл:ред) се запазва.
 */

const SENSITIVE_KEYS = [
  "authorization",
  "apikey",
  "api_key",
  "x-api-key",
  "cookie",
  "set-cookie",
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "jwt",
  "password",
  "secret",
  "client_secret",
  "signature",
  "otp",
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
  "signer_name",
  "signer_email",
];

const KEY_RE = new RegExp(
  `("(?:${SENSITIVE_KEYS.join("|")})"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`,
  "gi",
);

const HEADER_RE = new RegExp(
  `\\b(${SENSITIVE_KEYS.join("|")})\\b(\\s*[:=]\\s*)(?:Bearer\\s+)?[^\\s,;"']+`,
  "gi",
);

const VALUE_MASKS: Array<[RegExp, string]> = [
  [/\bey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]+/g, "«jwt»"],
  [/\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*/gi, "Bearer «token»"],
  [/\b(?:sk|pk|rk|whsec)_[A-Za-z0-9_-]{8,}\b/g, "«apikey»"],
  [/\bsb(?:p|s)?_[A-Za-z0-9_-]{16,}\b/g, "«apikey»"],
  [/\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/gi, "«email»"],
  [/\b[A-Z]{2}\d{2}[A-Z0-9]{10,26}\b/g, "«iban»"],
  [/\b(?:\d[ -]?){13,19}\b/g, "«card»"],
  [/(?:\+?359|00359|0)\s*(?:\d[\s-]?){8,12}/g, "«phone»"],
  [/\b\d{9,10}\b/g, "«id»"],
  [/([?&](?:token|access_token|apikey|key|signature|otp|code)=)[^&\s]+/gi, "$1«redacted»"],
  [/(?:гр\.|град|с\.|село|ул\.|улица|бул\.|булевард|ж\.к\.|кв\.)\s+[А-ЯA-Z][^\n,.;]{2,60}/g, "«address»"],
];

const NAME_RE =
  /(?<![A-Za-zА-Яа-я])[А-ЯA-Z][а-яa-z]{1,20}\s+[А-ЯA-Z][а-яa-z]{1,20}\s+[А-ЯA-Z][а-яa-z]{1,20}(?![A-Za-zА-Яа-я])/g;

/** Маскира чувствителни стойности, запазвайки структурата на текста. */
export function redactText(input: string | null | undefined): string {
  if (!input) return "";
  let out = input;
  out = out.replace(KEY_RE, '$1"«redacted»"');
  out = out.replace(HEADER_RE, "$1$2«redacted»");
  for (const [re, rep] of VALUE_MASKS) out = out.replace(re, rep);
  out = out.replace(NAME_RE, "«name»");
  return out;
}

/** Скъсява дълъг текст, пазейки начало и край. */
export function clampText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const half = Math.max(40, Math.floor(maxLen / 2));
  return `${text.slice(0, half)} …[-${text.length - maxLen} симв.]… ${text.slice(-half)}`;
}

/** Редактиран stack trace: пази функция/файл/ред, чисти токени и дълги пътища. */
export function redactStack(stack: string | null | undefined, maxFrames = 20): string {
  if (!stack) return "";
  const lines = stack.split("\n");
  const out: string[] = [];
  let frames = 0;
  for (const raw of lines) {
    const isFrame = /^\s*at\s/.test(raw);
    if (isFrame && frames >= maxFrames) continue;
    let line = raw.replace(/(https?:\/\/[^\s):]+?)[?#][^\s):]*/g, "$1");
    line = line.replace(/(?:\/[\w.@%+-]+){3,}?\/([\w.@%+-]+\/[\w.@%+-]+)(?=:\d|\))/g, "…/$1");
    out.push(redactText(line));
    if (isFrame) frames++;
  }
  if (frames >= maxFrames) out.push(`    … [кадрите след ${maxFrames} са отрязани]`);
  return clampText(out.join("\n"), 2400);
}

/** Редактира произволна стойност за показване в лог таблица. */
export function redactValue(value: unknown, maxLen = 600): string {
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value ?? null);
  } catch {
    text = String(value);
  }
  return clampText(redactText(text), maxLen);
}
