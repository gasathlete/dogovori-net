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


/**
 * Сглобява плоския текст на документа от резултата на генератора.
 *
 * ВАЖНО: редът и съставът са КАНОНИЧНИ и трябва да съвпадат дословно с
 * `renderCanonicalPlainText` на сървъра (Q4a). Включват се и английските
 * рендерирани полета, за да вижда ревизията целия двуезичен текст и промяна
 * само в английската част да обезсилва подадения манифест за качество.
 * Манифестът НИКОГА не влиза в четимото/експортираното съдържание.
 */
export function contractToPlainText(contract: {
  title?: string;
  title_en?: string;
  preamble?: string;
  preamble_en?: string;
  clauses?: Array<{
    number?: string;
    title?: string;
    title_en?: string;
    body?: string;
    body_en?: string;
  }>;
  closing?: string;
  closing_en?: string;
}): string {
  const parts: string[] = [];
  if (contract.title) parts.push(contract.title);
  if (contract.title_en) parts.push(contract.title_en);
  if (contract.preamble) parts.push(contract.preamble);
  if (contract.preamble_en) parts.push(contract.preamble_en);
  for (const c of contract.clauses ?? []) {
    parts.push([c.number, c.title].filter(Boolean).join(" ").trim());
    if (c.body) parts.push(c.body);
    if (c.title_en) parts.push([c.number, c.title_en].filter(Boolean).join(" ").trim());
    if (c.body_en) parts.push(c.body_en);
  }
  if (contract.closing) parts.push(contract.closing);
  if (contract.closing_en) parts.push(contract.closing_en);
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
  /**
   * Q4a — подписан манифест за качество, издаден от нашия генератор ЗА ТОЧНО
   * ТОЗИ документ. Подава се само когато е обвързан с текущото съдържание;
   * сървърът го проверява по подпис и отпечатък и при несъвпадение го
   * третира като външен документ (нищо не се потиска).
   */
  qualityManifest?: unknown;
  /**
   * ЕДНОКРАТЕН пропуск, ИЗДАДЕН ОТ СЪРВЪРА при изготвянето на този документ.
   * Браузърът не може да го създаде, а само да го препрати непроменен. Заедно
   * с `document_id` това са ЕДИНСТВЕНИТЕ два пътя до ревизия.
   */
  grant?: unknown;
  /** Запазен документ, чиято собственост сървърът проверява сам. */
  document_id?: string;
  /** Конкретна версия на запазения документ (по избор). */
  document_version_no?: number;
}

export interface ReviewOutcome {
  review: DocumentReview | null;
  error: string | null;
  /** Отпечатък на ЗАЯВЕНИЯ източник — с него UI-ът проверява отговора. */
  requestedDigest: string;
  /** Ревизията изисква изрично потвърждение за чувствителни данни. */
  confirmationRequired: boolean;
  /** Същата проверка може да се повтори БЕЗ нова такса и без нов резултат. */
  retryable?: boolean;
  /** Колко секунди е разумно да се изчака преди нов опит. */
  retryAfterSeconds?: number;
}

/**
 * Runtime проверка на отговора — без cast-ове. Нечетима задължителна структура
 * означава НЕУТРАЛЕН провал, а не „готово" без доказателство.
 */
export function parseDocumentReview(v: unknown): DocumentReview | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const verdict = o.verdict;
  if (verdict !== "ready" && verdict !== "needs_fixes" && verdict !== "blocked") return null;
  if (typeof o.summary !== "string") return null;
  const confidence =
    typeof o.confidence === "number" && Number.isFinite(o.confidence)
      ? Math.max(0, Math.min(100, Math.round(o.confidence)))
      : 0;
  if (!Array.isArray(o.checks)) return null;

  const checks: ReviewCheck[] = [];
  for (const c of o.checks) {
    if (!c || typeof c !== "object" || Array.isArray(c)) continue;
    const cc = c as Record<string, unknown>;
    const status = cc.status;
    if (typeof cc.label !== "string" || !cc.label.trim()) continue;
    if (status !== "pass" && status !== "warn" && status !== "fail") continue;
    checks.push({
      id: typeof cc.id === "string" ? cc.id : undefined,
      label: cc.label,
      status,
      note: typeof cc.note === "string" ? cc.note : undefined,
    });
  }

  const strings = (x: unknown): string[] =>
    Array.isArray(x) ? x.filter((i): i is string => typeof i === "string" && i.trim().length > 0) : [];

  const contradictions: ReviewContradiction[] = [];
  for (const c of Array.isArray(o.contradictions) ? o.contradictions : []) {
    if (!c || typeof c !== "object" || Array.isArray(c)) continue;
    const cc = c as Record<string, unknown>;
    if (typeof cc.detail !== "string" || !cc.detail.trim()) continue;
    contradictions.push({
      detail: cc.detail,
      where: typeof cc.where === "string" ? cc.where : undefined,
      quote: typeof cc.quote === "string" ? cc.quote : undefined,
    });
  }

  const legal_basis: ReviewLegalBasis[] = [];
  for (const b of Array.isArray(o.legal_basis) ? o.legal_basis : []) {
    if (!b || typeof b !== "object" || Array.isArray(b)) continue;
    const bb = b as Record<string, unknown>;
    if (typeof bb.act !== "string" || !bb.act.trim()) continue;
    legal_basis.push({
      act: bb.act,
      article: typeof bb.article === "string" ? bb.article : undefined,
      why: typeof bb.why === "string" ? bb.why : undefined,
    });
  }

  let source: { v?: string; digest?: string } | null = null;
  if (o.source && typeof o.source === "object" && !Array.isArray(o.source)) {
    const so = o.source as Record<string, unknown>;
    source = {
      v: typeof so.v === "string" ? so.v : undefined,
      digest: typeof so.digest === "string" ? so.digest : undefined,
    };
  }

  return {
    verdict,
    confidence,
    summary: o.summary,
    checks,
    missing_requisites: strings(o.missing_requisites),
    contradictions,
    unfilled_fields: strings(o.unfilled_fields),
    legal_basis,
    source,
    completeness: readCompleteness(o.completeness),
    model: typeof o.model === "string" ? o.model : undefined,
    reviewed_at: typeof o.reviewed_at === "string" ? o.reviewed_at : undefined,
  };
}

export const REVIEW_MALFORMED_MESSAGE =
  "Резултатът от проверката не е разчетен. Направете нова проверка.";

export async function reviewDocument(
  input: ReviewRequestInput,
  onRetry?: () => void,
): Promise<ReviewOutcome> {
  const requestedDigest = await computeReviewSourceDigest(input);
  // СТАБИЛЕН КЛЮЧ на ТОЧНО тази заявка: същият при повторен опит, двойно
  // натискане, загубена връзка и презареждане; различен при различен товар.
  const { getStableOpKey, opaqueOpScope, releaseStableOpKey } = await import("@/lib/opSession");
  const opScope = await opaqueOpScope("review", input);
  const operationId = getStableOpKey(opScope);
  const { data, error } = await invokeEdgeFunction<Record<string, unknown>>(
    "review-document",
    { body: { ...input, operation_id: operationId } },
  );

  // Правна преграда: документът остава запазен, няма такса, има ръчен опит.
  if (
    (await import("@/lib/legalGateClient")).handleLegalVerificationUnavailable(
      { data, error },
      onRetry,
    )
  ) {
    return {
      review: null,
      error: null,
      requestedDigest,
      confirmationRequired: false,
    };
  }

  if (error || !data || typeof data.error === "string") {
    const code = typeof data?.code === "string" ? data.code : "";
    // Тези две състояния НЕ са провал: проверката вече се прави или състоянието
    // ѝ се изяснява. Същият опит по-късно е безплатен.
    const retryable = code === "review_in_progress" || code === "reconciliation_required";
    const retryAfterSeconds = typeof data?.retry_after_seconds === "number"
      ? Math.max(1, Math.round(data.retry_after_seconds))
      : undefined;
    const message = code === "review_in_progress"
      ? "Проверката на този документ вече се извършва. Опитайте отново след малко."
      : code === "reconciliation_required"
      ? "Изясняваме състоянието на предишната проверка. Опитайте отново след малко."
      : (typeof data?.error === "string" ? data.error : null) || error?.message || "Ревизията не успя";
    return {
      review: null,
      error: message,
      requestedDigest,
      confirmationRequired: code === "confirmation_required",
      retryable,
      retryAfterSeconds,
    };
  }
  const review = parseDocumentReview(data);
  if (!review) {
    return { review: null, error: REVIEW_MALFORMED_MESSAGE, requestedDigest, confirmationRequired: false };
  }
  return { review, error: null, requestedDigest, confirmationRequired: false };
}

export type { ReviewCompleteness };
