/**
 * Типизирани грешки при генериране на документ.
 *
 * Едно място, което превежда „суровите" отговори (мрежов срив, non-2xx тяло,
 * статус на job, код от сървъра) в стабилен код + правило дали има смисъл от
 * повторен опит + съобщение за потребителя. Използва се от Wizard/BuildContract
 * за UX и от аналитиката като `reason`, така че /admin/generation вижда едни
 * и същи категории навсякъде.
 *
 * Retryable = повторният опит е безопасен (не таксува двойно, не създава
 * дубликат) И има шанс да успее. Прегради (квота, вход, потвърждение) не са
 * retryable — те искат действие от потребителя.
 */

export type GenerationErrorCode =
  | "network"
  | "timeout"
  | "rate_limited"
  | "quota_exceeded"
  | "requires_login"
  | "needs_confirmation"
  | "sensitive_blocked"
  | "input_not_processable"
  | "blocked_content"
  | "ai_parse_failed"
  | "ai_upstream"
  | "legal_verification_unavailable"
  | "server_error"
  | "rejected"
  | "cancelled"
  | "unknown";

export interface GenerationError {
  code: GenerationErrorCode;
  /** Кратко, безопасно за показване съобщение на български. */
  message: string;
  /** Безопасно и смислено ли е автоматично/ръчно „Опитай отново". */
  retryable: boolean;
  /** Продуктова преграда (не е технически провал) — отчита се като blocked. */
  gate: boolean;
  httpStatus?: number;
  correlationId?: string;
  /** Оригиналното съобщение — само за логове/диагностика, не за аналитика. */
  raw?: string;
}

export interface RawGenerationOutcome {
  error?: { message?: string; status?: number; correlationId?: string; code?: string } | null;
  data?: { error?: unknown; code?: unknown; requires_login?: unknown } | null;
  /** Статус на асинхронния job, ако е известен. */
  jobStatus?: string | null;
  /** Съобщение от изключение (catch), ако има. */
  thrownMessage?: string;
}

const NETWORK_RE =
  /failed to send|failed to fetch|load failed|networkerror|network error|econnreset|socket hang|connection (reset|refused|closed)|relay error|няма връзка/i;
const TIMEOUT_RE = /timed? ?out|timeout|deadline|твърде дълго/i;
const ABORT_RE = /aborted|abort/i;
const JSON_RE = /json|парсн|анализиран като|unparsable|невалиден отговор/i;
const AI_UPSTREAM_RE = /ai грешка|ai gateway|празен отговор от ai|не върна съдържание|upstream|bad gateway|gateway timeout/i;

const USER_MESSAGES: Record<GenerationErrorCode, string> = {
  network: "Връзката бе прекъсната. Данните ви са запазени — опитайте отново.",
  timeout: "Генерирането отне твърде дълго. Опитайте отново — ако процесът е приключил междувременно, ще продължим от него.",
  rate_limited: "Твърде много заявки за кратко време. Изчакайте малко и опитайте отново.",
  quota_exceeded: "Изчерпан е лимитът на операциите за този месец.",
  requires_login: "Влезте в профила си, за да продължите. Въведените данни остават запазени.",
  needs_confirmation: "Нужно е потвърждение за откритите лични данни, преди да продължим.",
  sensitive_blocked: "Документът съдържа специални категории данни, които не могат да бъдат обработени автоматично.",
  input_not_processable:
    "Въведените данни не можаха да бъдат подготвени за обработка. Прегледайте попълнените полета и опитайте отново.",
  blocked_content: "Заявката съдържа съдържание, което не може да бъде обработено.",
  ai_parse_failed: "AI отговорът беше невалиден и не бе таксуван. Опитайте отново — обикновено вторият опит е успешен.",
  ai_upstream: "AI услугата е временно недостъпна. Не сте таксувани — опитайте отново след малко.",
  legal_verification_unavailable:
    "Проверката на правната основа е временно недостъпна. Въведеното и документът са запазени, не е използвана квота и няма плащане — опитайте отново.",
  server_error: "Възникна грешка на сървъра. Не сте таксувани — опитайте отново.",
  rejected: "Заявката бе отхвърлена от сървъра.",
  cancelled: "Генерирането бе прекратено.",
  unknown: "Възникна неочаквана грешка. Опитайте отново.",
};

const RETRYABLE: ReadonlySet<GenerationErrorCode> = new Set<GenerationErrorCode>([
  "network",
  "timeout",
  "rate_limited",
  "ai_parse_failed",
  "ai_upstream",
  "legal_verification_unavailable",
  "server_error",
  "input_not_processable",
  "unknown",
]);

const GATES: ReadonlySet<GenerationErrorCode> = new Set<GenerationErrorCode>([
  "quota_exceeded",
  "requires_login",
  "needs_confirmation",
  "sensitive_blocked",
  "blocked_content",
  "cancelled",
]);

export function isRetryableCode(code: GenerationErrorCode): boolean {
  return RETRYABLE.has(code);
}

export function generationErrorMessage(code: GenerationErrorCode): string {
  return USER_MESSAGES[code];
}

/** Известни кодове, връщани от сървъра (generate-contract / generate-job). */
const SERVER_CODE_MAP: Record<string, GenerationErrorCode> = {
  quota_exceeded: "quota_exceeded",
  auth_required: "requires_login",
  requires_login: "requires_login",
  rate_limited: "rate_limited",
  sensitive_data_confirmation_required: "needs_confirmation",
  needs_confirmation: "needs_confirmation",
  context_not_redactable: "input_not_processable",
  input_not_processable: "input_not_processable",
  special_category_blocked: "sensitive_blocked",
  sensitive_blocked: "sensitive_blocked",
  illegal_content: "blocked_content",
  blocked_content: "blocked_content",
  ai_parse_failed: "ai_parse_failed",
  ai_json_unparsable: "ai_parse_failed",
  ai_empty_response: "ai_upstream",
  ai_upstream_error: "ai_upstream",
  ai_upstream: "ai_upstream",
  legal_verification_unavailable: "legal_verification_unavailable",
  job_timeout: "timeout",
  timeout: "timeout",
  background_failure: "server_error",
  internal_error: "server_error",
};

function fromStatus(status: number | undefined): GenerationErrorCode | null {
  if (!status) return null;
  if (status === 401) return "requires_login";
  if (status === 402) return "quota_exceeded";
  if (status === 408 || status === 504) return "timeout";
  if (status === 429) return "rate_limited";
  if (status === 502 || status === 503) return "ai_upstream";
  if (status >= 500) return "server_error";
  return null;
}

function fromMessage(msg: string | undefined): GenerationErrorCode | null {
  if (!msg) return null;
  if (NETWORK_RE.test(msg)) return "network";
  if (TIMEOUT_RE.test(msg)) return "timeout";
  if (ABORT_RE.test(msg)) return "cancelled";
  if (JSON_RE.test(msg)) return "ai_parse_failed";
  if (AI_UPSTREAM_RE.test(msg)) return "ai_upstream";
  if (/\b429\b|твърде много заявки|достигнат е лимитът/i.test(msg)) return "rate_limited";
  if (/\b402\b|изчерпан/i.test(msg)) return "quota_exceeded";
  if (/\b401\b|влезте|unauthorized/i.test(msg)) return "requires_login";
  if (/\b5\d\d\b/.test(msg)) return "server_error";
  return null;
}

/**
 * Определя типизираната грешка от наличната информация. Редът е важен:
 * сървърният код > HTTP статус > текст на съобщението > статус на job-а.
 */
export function classifyGenerationError(raw: RawGenerationOutcome): GenerationError {
  const data = raw.data ?? null;
  const err = raw.error ?? null;
  const serverCode =
    (typeof data?.code === "string" && data.code) ||
    (typeof err?.code === "string" && err.code) ||
    undefined;
  const dataError = typeof data?.error === "string" ? data.error : undefined;
  const thrown = raw.thrownMessage;
  const message = dataError || err?.message || thrown || "";

  let code: GenerationErrorCode | null = null;
  if (serverCode && SERVER_CODE_MAP[serverCode]) code = SERVER_CODE_MAP[serverCode];
  else if (data?.requires_login) code = "requires_login";
  else if (dataError === "needs_confirmation") code = "needs_confirmation";
  if (!code) code = fromStatus(err?.status);
  if (!code) code = fromMessage(message);
  if (!code && raw.jobStatus === "rejected") code = "rejected";
  if (!code) code = "unknown";

  return {
    code,
    message: USER_MESSAGES[code],
    retryable: RETRYABLE.has(code),
    gate: GATES.has(code),
    httpStatus: err?.status,
    correlationId: err?.correlationId,
    raw: message ? String(message).slice(0, 200) : undefined,
  };
}

/** Кодът, който сървърът връща, когато строгата правна проверка липсва. */
export const LEGAL_VERIFICATION_UNAVAILABLE = "legal_verification_unavailable";

/**
 * Едно място за разпознаване на ограничената правна грешка от всеки консуматор
 * (503 + code). Състоянието на потребителя се запазва, действието е „опитайте
 * отново“.
 */
export function isLegalVerificationUnavailable(raw: RawGenerationOutcome): boolean {
  const data = raw.data as { code?: unknown } | null | undefined;
  const err = raw.error as { code?: unknown; status?: number; message?: string } | null | undefined;
  if (data?.code === LEGAL_VERIFICATION_UNAVAILABLE) return true;
  if (err?.code === LEGAL_VERIFICATION_UNAVAILABLE) return true;
  return typeof err?.message === "string" && err.message.includes(LEGAL_VERIFICATION_UNAVAILABLE);
}

/** Клас на грешката за таблата: network | server | ai | gate | app. */
export function errorClassOf(code: GenerationErrorCode): "network" | "server" | "ai" | "gate" | "app" {
  if (code === "network" || code === "timeout") return "network";
  if (code === "server_error" || code === "rate_limited" || code === "rejected") return "server";
  if (code === "ai_parse_failed" || code === "ai_upstream") return "ai";
  if (GATES.has(code)) return "gate";
  return "app";
}
