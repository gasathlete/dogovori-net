/**
 * Клиентски слой към AI ревизията (`review-document`).
 *
 * Ревизията е втори, независим проход върху вече готовия документ. Не пише
 * и не пренаписва нищо — само връща структуриран технически одит, който UI-ът
 * показва като „Автоматична AI ревизия".
 */
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

export type ReviewVerdict = "ready" | "needs_fixes" | "blocked";
export type CheckStatus = "pass" | "warn" | "fail";

export interface ReviewCheck {
  id?: string;
  label: string;
  status: CheckStatus;
  note?: string;
}

export interface ReviewContradiction {
  detail: string;
  where?: string;
}

export interface ReviewLegalBasis {
  act: string;
  article?: string;
  why?: string;
}

export interface DocumentReview {
  verdict: ReviewVerdict;
  confidence: number;
  summary: string;
  checks: ReviewCheck[];
  missing_requisites: string[];
  contradictions: ReviewContradiction[];
  unfilled_fields: string[];
  legal_basis: ReviewLegalBasis[];
  model?: string;
  reviewed_at?: string;
}

/** Сглобява плоския текст на документа от резултата на генератора. */
export function contractToPlainText(contract: {
  title?: string;
  preamble?: string;
  clauses?: Array<{ number?: string; title?: string; body?: string }>;
  closing?: string;
}): string {
  const parts: string[] = [];
  if (contract.title) parts.push(contract.title);
  if (contract.preamble) parts.push(contract.preamble);
  for (const c of contract.clauses ?? []) {
    parts.push([c.number, c.title].filter(Boolean).join(" ").trim());
    if (c.body) parts.push(c.body);
  }
  if (contract.closing) parts.push(contract.closing);
  return parts.filter(Boolean).join("\n\n");
}

export async function reviewDocument(input: {
  documentText: string;
  documentTitle?: string;
  documentType?: string;
}): Promise<{ review: DocumentReview | null; error: string | null }> {
  const { data, error } = await invokeEdgeFunction<DocumentReview & { error?: string }>(
    "review-document",
    { body: input },
  );
  if (error || !data || data.error) {
    return { review: null, error: data?.error || error?.message || "Ревизията не успя" };
  }
  return { review: data, error: null };
}
