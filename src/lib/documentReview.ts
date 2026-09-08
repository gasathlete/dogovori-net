/**
 * Клиентски слой към AI ревизията (`review-document`).
 *
 * Ревизията е втори, независим проход върху вече готовия документ. Не пише
 * и не пренаписва нищо — само връща структуриран технически одит, който UI-ът
 * показва като „Автоматична AI ревизия".
 */
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import {
  computeReviewSourceDigest,
  readCompleteness,
  type ReviewCompleteness,
  type ReviewContextInput,
} from "@/lib/reviewSnapshot";


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
  /** Дословен откъс от подадения текст, който доказва констатацията. */
  quote?: string;
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
  /** Обвързване с ТОЧНИЯ подаден източник (липсва при стари резултати). */
  source?: { v?: string; digest?: string } | null;
  /** Честна пълнота на проверката. */
  completeness?: ReviewCompleteness | null;
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

export interface ReviewRequestInput {
  documentText: string;
  documentTitle?: string;
  documentType?: string;
  /** Версия на генерирания документ (ако е известна от потока). */
  documentVersion?: string;
  /** Минимален изричен контекст от реалния поток — нищо не се домисля. */
  context?: ReviewContextInput | null;
  /** Не отчитай непопълнени полета за лични данни — ще се вписват локално. */
  ignorePersonalData?: boolean;
  /** Изрично потвърждение за чувствителни данни, обвързано със същата снимка. */
  userConfirmed?: boolean;
}

export interface ReviewOutcome {
  review: DocumentReview | null;
  error: string | null;
  /** Отпечатък на ЗАЯВЕНИЯ източник — с него UI-ът проверява отговора. */
  requestedDigest: string;
  /** Ревизията изисква изрично потвърждение за чувствителни данни. */
  confirmationRequired: boolean;
}

export async function reviewDocument(input: ReviewRequestInput): Promise<ReviewOutcome> {
  const requestedDigest = await computeReviewSourceDigest(input);
  const { data, error } = await invokeEdgeFunction<
    DocumentReview & { error?: string; code?: string }
  >("review-document", { body: input });

  if (error || !data || data.error) {
    return {
      review: null,
      error: data?.error || error?.message || "Ревизията не успя",
      requestedDigest,
      confirmationRequired: data?.code === "confirmation_required",
    };
  }
  return {
    review: { ...data, completeness: readCompleteness(data.completeness) },
    error: null,
    requestedDigest,
    confirmationRequired: false,
  };
}

export type { ReviewCompleteness };

