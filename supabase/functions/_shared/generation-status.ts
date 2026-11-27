/**
 * Статуси на асинхронните generation jobs.
 *
 * В базата (`generation_jobs.status`) историческата стойност за успешен край е
 * `done` и тя се запазва — съществуващите записи не се пренаписват, а SQL
 * заявките остават с една стойност. По HTTP/за клиента каноничният статус е
 * `completed`; `normalizeJobStatus` превежда съхранения статус към каноничния.
 * Клиентът приема и двете форми.
 */

/** Канонични стойности по HTTP. */
export type CanonicalJobStatus = "running" | "completed" | "error" | "rejected";

/** Стойности, които реално се пишат в базата. */
export type StoredJobStatus = "running" | "done" | "error" | "rejected";

export const STORED_STATUS: Record<CanonicalJobStatus, StoredJobStatus> = {
  running: "running",
  completed: "done",
  error: "error",
  rejected: "rejected",
};

export function normalizeJobStatus(stored: string | null | undefined): CanonicalJobStatus {
  switch ((stored ?? "").toLowerCase()) {
    case "done":
    case "completed":
    case "success":
      return "completed";
    case "error":
    case "failed":
      return "error";
    case "rejected":
      return "rejected";
    default:
      return "running";
  }
}

export function isTerminalStatus(status: string | null | undefined): boolean {
  return normalizeJobStatus(status) !== "running";
}

/** Максимална продължителност на един job; след това се маркира като `job_timeout`. */
export const JOB_MAX_RUNTIME_MS = 6 * 60 * 1000;
/** Таймаут на вътрешното извикване към generate-contract. */
export const UPSTREAM_TIMEOUT_MS = 170 * 1000;
/** Колко дълго един idempotency_key връща същия job. */
export const IDEMPOTENCY_WINDOW_MS = 15 * 60 * 1000;

const IDEMPOTENCY_RE = /^[A-Za-z0-9_.:-]{8,128}$/;

export function isValidIdempotencyKey(v: unknown): v is string {
  return typeof v === "string" && IDEMPOTENCY_RE.test(v);
}

/**
 * Типизиран код за грешка при неуспешен job. Приоритет: код от upstream тялото
 * > HTTP статус > текст.
 */
export function classifyUpstreamFailure(input: {
  httpStatus?: number | null;
  bodyCode?: string | null;
  bodyError?: string | null;
  thrown?: string | null;
}): string {
  if (input.bodyCode) return input.bodyCode;
  const msg = `${input.bodyError ?? ""} ${input.thrown ?? ""}`;
  if (/abort|timeout|timed out/i.test(msg)) return "job_timeout";
  if (/json|парсн|анализиран|unparsable/i.test(msg)) return "ai_parse_failed";
  if (/празен отговор|не върна съдържание|ai грешка|ai gateway/i.test(msg)) return "ai_upstream_error";
  const s = input.httpStatus ?? 0;
  if (s === 401) return "auth_required";
  if (s === 402) return "quota_exceeded";
  if (s === 429) return "rate_limited";
  if (s === 422) return "special_category_blocked";
  if (s >= 500) return "internal_error";
  if (input.thrown) return "background_failure";
  return "unknown";
}
