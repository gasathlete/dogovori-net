/**
 * Възобновяемо състояние на пакетното генериране. Записът за документ е
 * вързан към SHA-256 на оригинала; успешен кандидат се преизползва, неуспешен
 * се повтаря само при изрично --retry-failed и до MAX_ATTEMPTS общо.
 */
import type { CandidateStatus } from "./candidateValidation";

export const MAX_ATTEMPTS = 3;

export interface CandidateRecord {
  slug: string;
  kind: "draft" | "content";
  baseSourceSha256: string;
  status: CandidateStatus;
  attempts: number;
  errors: string[];
  legalApproval: null;
}

export type NextAction = "generate" | "skip_validated" | "skip_failed" | "skip_attempts_exhausted";

export function decideAction(existing: unknown, sourceSha256: string, retryFailed: boolean): NextAction {
  const r = existing as Partial<CandidateRecord> | null;
  if (!r || typeof r !== "object" || r.baseSourceSha256 !== sourceSha256 || typeof r.status !== "string") return "generate";
  if (r.status === "validated_generated_pending_legal_review") return "skip_validated";
  if ((r.attempts ?? 0) >= MAX_ATTEMPTS) return "skip_attempts_exhausted";
  return retryFailed ? "generate" : "skip_failed";
}

/** Кои HTTP грешки са преходни (ограничен повтор) и кои спират целия пакет. */
export function classifyHttp(status: number): "retry" | "stop_all" | "fail" {
  if (status === 402) return "stop_all";
  if (status === 429 || status >= 500) return "retry";
  return "fail";
}
