/**
 * Документна фуния (5 етапа) — къде спират хората по пътя към готов документ.
 *
 *   1 start     — отваря визард / избира сценарий
 *   2 fill      — попълва въпроси (прогрес по стъпки)
 *   3 generate  — AI генерира документа
 *   4 download  — сваля PDF/DOCX
 *   5 sign      — изпраща за подпис / подписва
 *
 * Пише се в public.funnel_events през trackFunnelEvent (GA + DB).
 * `step` остава NULL (RLS позволява само 1–4 за маркетинг фунията),
 * а етапът се носи в props.dstage.
 */
import { trackFunnelEvent } from "@/lib/funnel";
import { abProps } from "@/lib/ab";


export type DocStage = "start" | "fill" | "generate" | "download" | "sign";

export const DOC_STAGES: DocStage[] = ["start", "fill", "generate", "download", "sign"];

export const DOC_STAGE_LABELS: Record<DocStage, string> = {
  start: "Старт",
  fill: "Попълване",
  generate: "Генериране",
  download: "Сваляне",
  sign: "Подпис",
};

export interface DocFunnelProps {
  /** Ключ на документа (slug / sector id) — за разрез по тип. */
  doc_key?: string;
  /** Откъде идва действието: wizard, build, catalog, start, kit… */
  source?: string;
  /** Причина за провал, когато outcome = "fail". */
  reason?: string;
  [k: string]: unknown;
}

export function trackDocEvent(
  name: string,
  stage: DocStage,
  props?: DocFunnelProps,
) {
  // Всяко събитие носи активните A/B варианти, за да може /admin/funnel да
  // сегментира фунията без допълнителни join-ове.
  trackFunnelEvent(name, { dstage: stage, ...abProps(), ...(props ?? {}) });
}

/**
 * Резултат от автоматичната проверка на готовия документ.
 * `clean = true` означава нула открити пропуски/плейсхолдъри.
 */
export function trackReviewResult(clean: boolean, issues: number, props?: DocFunnelProps) {
  trackDocEvent("doc_review_result", "generate", {
    clean,
    issues,
    ...(props ?? {}),
  });
}


export function trackDocStart(props?: DocFunnelProps) {
  trackDocEvent("doc_start", "start", props);
}

/** Извиква се при преминаване към следваща стъпка от въпросника. */
export function trackFillStep(stepIdx: number, total: number, props?: DocFunnelProps) {
  trackDocEvent("doc_fill_step", "fill", {
    step_idx: stepIdx,
    total_steps: total,
    ...(props ?? {}),
  });
}

/**
 * Причини, при които генерирането е спряно от продуктова преграда
 * (потвърждение, лимит, вход, чувствително съдържание), а НЕ от техническа грешка.
 * Отчитат се като `doc_generate_blocked`, за да не изкривяват процента реални провали.
 */
const GATE_REASONS = [
  "needs_confirmation",
  "confirmation_required",
  "quota_exceeded",
  "requires_login",
  "sensitive_blocked",
  "blocked_content",
  "illegal_content",
  "placeholder",
];

export function isGateReason(reason?: string): boolean {
  if (!reason) return false;
  const r = reason.toLowerCase();
  return GATE_REASONS.some((g) => r.includes(g));
}

export function trackGenerate(
  outcome: "started" | "success" | "fail" | "blocked",
  props?: DocFunnelProps,
) {
  // Прегради → blocked, дори когато call site-ът е подал "fail".
  const resolved = outcome === "fail" && isGateReason(props?.reason) ? "blocked" : outcome;
  trackDocEvent(`doc_generate_${resolved}`, "generate", { outcome: resolved, ...(props ?? {}) });
}

export function trackDownload(
  outcome: "success" | "fail",
  props?: DocFunnelProps,
) {
  trackDocEvent(`doc_download_${outcome}`, "download", { outcome, ...(props ?? {}) });
}

export function trackSign(
  event: "requested" | "signed" | "declined" | "fail",
  props?: DocFunnelProps,
) {
  trackDocEvent(`doc_sign_${event}`, "sign", { outcome: event, ...(props ?? {}) });
}
