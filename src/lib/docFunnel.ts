/**
 * Документна фуния (5 етапа) — къде спират хората по пътя към готов документ.
 *
 *   1 start     — съзнателен избор/старт на конкретен документ
 *   2 fill      — попълва въпроси (прогрес по стъпки)
 *   3 generate  — AI генерира документа
 *   4 download  — сваля PDF/DOCX
 *   5 sign      — изпраща за подпис / подписва
 *
 * Каноничните имена, семантиката и правилата за идемпотентност са в
 * `src/lib/funnelEvents.ts`. Тук са само удобните helper-и за call sites.
 *
 * Пише се в public.funnel_events през trackFunnelEvent (GA + DB).
 * `step` остава NULL (RLS позволява само 1–4 за маркетинг фунията),
 * а етапът се носи в props.dstage.
 */
import { trackFunnelEvent } from "@/lib/funnel";
import { ensureDocumentJourney } from "@/lib/funnelContext";
import { compactSessionToken } from "@/lib/checkoutAnalytics";
import { abProps } from "@/lib/ab";


import {
  ONCE_PER_SESSION_DOC,
  STORED_NAME,
  buildDedupKey,
  sanitizeFunnelProps,
  type CanonicalEvent,
} from "@/lib/funnelEvents";

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
  /** Причина за провал/преграда, когато outcome = "fail" | "blocked". */
  reason?: string;
  [k: string]: unknown;
}

const STAGE_OF: Record<CanonicalEvent, DocStage | null> = {
  document_selected: "start",
  wizard_step_completed: "fill",
  generation_started: "generate",
  generation_succeeded: "generate",
  generation_failed: "generate",
  generation_blocked: "generate",
  result_viewed: "generate",
  auth_prompt_shown: null,
  signup_completed: null,
  paywall_shown: null,
  checkout_started: null,
  checkout_completed: null,
  document_saved: "download",
  document_downloaded: "download",
  download_failed: "download",
  draft_created: "start",
  draft_autosaved: "fill",
  draft_restore_offered: null,
  draft_restored: "fill",
  draft_claim_started: null,
  draft_claim_succeeded: null,
  draft_claim_blocked: null,
  draft_sync_blocked: null,
  draft_expired: null,
};

/**
 * Причини, при които генерирането е спряно от продуктова преграда
 * (потвърждение, лимит, вход, чувствително съдържание), а НЕ от техническа грешка.
 * Отчитат се като `generation_blocked`, за да не изкривяват процента реални провали.
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
  "user_cancelled",
] as const;

export function isGateReason(reason?: string): boolean {
  if (!reason) return false;
  const r = reason.toLowerCase();
  return GATE_REASONS.some((g) => r.includes(g));
}

/**
 * ЗАТВОРЕН списък с документирани кодове за причина. Всичко извън него става
 * "unknown" или безопасна класификация — никога slug от свободен текст, защото
 * съобщенията за грешка могат да съдържат имена, имейли, части от документи,
 * номера или имена на файлове.
 */
export const FUNNEL_REASON_CODES = [
  "unknown",
  // Прегради (generation_blocked)
  ...GATE_REASONS,
  // Технически класификации
  "network", "timeout", "aborted", "ai_parse_failed", "ai_upstream", "rate_limited",
  "server_error", "input_not_processable", "legal_verification_unavailable",
  // Идемпотентност / квота / права
  "operation_conflict", "operation_in_progress", "operation_id_required", "invalid_operation_id",
  "idempotency_key_conflict", "response_expired", "quota_unavailable", "entitlement_unavailable",
  "reconciliation_required", "pro_required", "prelaunch_closed",
  // Сваляне
  "auth_required", "disclaimer_cancelled", "unfilled_placeholders",
  // Качване / поверителност
  "restricted_identifiers", "raw_file_blocked", "text_too_short", "missing_title", "missing_file",
  "extraction_failed", "upload_failed", "session_expired", "save_failed", "analysis_failed",
  // Чернови
  "invalid_request", "payload_too_large", "expired", "invalid_token", "unauthorized",
  "different_owner", "already_claimed",
  // Подпис
  "signing_failed",
] as const;
export type FunnelReasonCode = (typeof FUNNEL_REASON_CODES)[number] | `http_${4 | 5}${number}`;

const REASON_SET: ReadonlySet<string> = new Set<string>(FUNNEL_REASON_CODES);

export function isKnownReasonCode(reason: unknown): reason is FunnelReasonCode {
  if (typeof reason !== "string") return false;
  return REASON_SET.has(reason) || /^http_[45]\d\d$/.test(reason);
}

/**
 * Нормализира причина до код от затворения списък. Познат код минава
 * (без значение за главни букви); иначе само безопасна класификация по
 * ключови думи; иначе "unknown". Никога не връща части от входния текст.
 */
export function normalizeReason(reason?: string | null): FunnelReasonCode {
  if (!reason) return "unknown";
  const r = String(reason).trim().slice(0, 500);
  const lower = r.toLowerCase();
  if (isKnownReasonCode(lower)) return lower;
  for (const g of GATE_REASONS) if (lower.includes(g)) return g as FunnelReasonCode;
  if (/failed to send|failed to fetch|load failed|networkerror|network error|relay|econnreset|socket|connection/i.test(r)) return "network";
  if (/timed? ?out|timeout|твърде дълго/i.test(r)) return "timeout";
  if (/abort/i.test(r)) return "aborted";
  if (/json|парсн|анализиран/i.test(r)) return "ai_parse_failed";
  if (/rate|429|лимит/i.test(r) && /много|rate|429/i.test(r)) return "rate_limited";
  const m = r.match(/\b(?:status(?: code)?|http|non-2xx status code)\s*[:=]?\s*([45]\d\d)\b/i);
  if (m) return `http_${m[1]}` as FunnelReasonCode;
  return "unknown";
}

/** Всички събития носят активните A/B варианти + санитизирани свойства. */
function baseProps(canonical: CanonicalEvent, props?: DocFunnelProps): Record<string, unknown> {
  const stage = STAGE_OF[canonical];
  const clean = sanitizeFunnelProps(props);
  return {
    event: canonical,
    ...(stage ? { dstage: stage } : {}),
    ...abProps(),
    ...clean,
  };
}

/**
 * Централен вход: канонично събитие → съхранено име + идемпотентност.
 * @returns true ако е изпратено, false ако е дедупликирано.
 */
export function trackCanonical(
  canonical: CanonicalEvent,
  props?: DocFunnelProps,
  dedupParts?: Array<string | number | undefined | null>,
): boolean {
  const once = ONCE_PER_SESSION_DOC.has(canonical) || (dedupParts?.length ?? 0) > 0;
  const dedupKey = once
    ? buildDedupKey(dedupParts && dedupParts.length > 0 ? dedupParts : [props?.doc_key ?? "", props?.source ?? ""])
    : undefined;
  return trackFunnelEvent(STORED_NAME[canonical], baseProps(canonical, props), dedupKey ? { dedupKey } : undefined);
}

/**
 * Съвместимост: произволно събитие с етап (стари call sites). Санитизира
 * свойствата, но не дедупликира.
 */
export function trackDocEvent(name: string, stage: DocStage, props?: DocFunnelProps) {
  trackFunnelEvent(name, { dstage: stage, ...abProps(), ...sanitizeFunnelProps(props) });
}

/**
 * Резултат от автоматичната проверка на готовия документ.
 * `clean = true` означава нула открити пропуски/плейсхолдъри.
 */
export function trackReviewResult(clean: boolean, issues: number, props?: DocFunnelProps) {
  trackDocEvent("doc_review_result", "generate", { clean, issues, ...(props ?? {}) });
}

/* -------------------- 1. Старт -------------------- */

/**
 * document_selected — САМО при съзнателно действие на потребителя (клик върху
 * документ, първи отговор във въпросника). Еднократно за run_id, така че
 * различни `source` етикети НЕ могат да произведат два старта за един и същи
 * опит върху документа. Не се вика от useEffect при mount, от SEO страници
 * или при prefetch.
 */
export function trackDocStart(props?: DocFunnelProps): boolean {
  const ctx = ensureDocumentJourney(typeof props?.doc_key === "string" ? props.doc_key : undefined);
  return trackCanonical("document_selected", props, [ctx.run_id]);
}


/* -------------------- 2. Попълване -------------------- */

/** wizard_step_completed — еднократно за (сесия, документ, стъпка). */
export function trackFillStep(stepIdx: number, total: number, props?: DocFunnelProps): boolean {
  return trackCanonical(
    "wizard_step_completed",
    { step_idx: stepIdx, total_steps: total, ...(props ?? {}) },
    [props?.doc_key ?? "", props?.source ?? "", stepIdx],
  );
}

/* -------------------- 3. Генериране -------------------- */

/**
 * Всеки опит е отделно събитие (без дедупликация) — процентът провали трябва
 * да ги вижда всичките. Прегради → blocked, дори когато call site-ът подава "fail".
 */
export function trackGenerate(
  outcome: "started" | "success" | "fail" | "blocked",
  props?: DocFunnelProps,
) {
  const reason = props?.reason !== undefined ? normalizeReason(String(props.reason)) : undefined;
  const resolved = outcome === "fail" && isGateReason(reason) ? "blocked" : outcome;
  const canonical: CanonicalEvent =
    resolved === "started"
      ? "generation_started"
      : resolved === "success"
        ? "generation_succeeded"
        : resolved === "blocked"
          ? "generation_blocked"
          : "generation_failed";
  const { message: _dropped, ...rest } = props ?? {};
  trackCanonical(canonical, { ...rest, ...(reason ? { reason } : {}), outcome: resolved });
}

/** result_viewed — екранът с готовия документ е показан (еднократно за сесия + документ). */
export function trackResultViewed(props?: DocFunnelProps): boolean {
  return trackCanonical("result_viewed", props, [props?.doc_key ?? "", props?.source ?? ""]);
}

/* -------------------- Достъп / монетизация -------------------- */

/** auth_prompt_shown — вход/регистрация, показани в контекст на действие. */
export function trackAuthPromptShown(props?: DocFunnelProps & { action?: string }): boolean {
  return trackCanonical("auth_prompt_shown", props, [props?.doc_key ?? "", props?.action ?? "", props?.source ?? ""]);
}

/** paywall_shown — вид: strict_unlock | quota | pro_dialog | pillar. */
export function trackPaywallShown(kind: string, props?: DocFunnelProps): boolean {
  return trackCanonical("paywall_shown", { kind, ...(props ?? {}) }, [kind, props?.doc_key ?? "", props?.source ?? ""]);
}

/**
 * checkout_completed — еднократно за Stripe сесия. Суровият Stripe session id
 * НЕ влиза нито в props, нито в GA, нито в ключа за дедупликация: пази се само
 * детерминистичен необратим токен от него.
 */
export function trackCheckoutCompleted(stripeSessionId: string | null | undefined, props?: DocFunnelProps): boolean {
  return trackCanonical(
    "checkout_completed",
    props,
    [stripeSessionId ? `cst:${compactSessionToken(stripeSessionId)}` : `ts:${Math.floor(Date.now() / 60000)}`],
  );
}


/* -------------------- 4. Сваляне / запазване -------------------- */

/** document_saved — еднократно за запазен документ (saved_document_id). */
export function trackDocumentSaved(savedId: string | undefined, props?: DocFunnelProps): boolean {
  return trackCanonical(
    "document_saved",
    { ...(props ?? {}), saved: !!savedId },
    [savedId ? `id:${savedId}` : `${props?.doc_key ?? ""}|${props?.source ?? ""}`],
  );
}

export function trackDownload(outcome: "success" | "fail", props?: DocFunnelProps) {
  const reason = props?.reason !== undefined ? normalizeReason(String(props.reason)) : undefined;
  trackCanonical(outcome === "success" ? "document_downloaded" : "download_failed", {
    ...(props ?? {}),
    ...(reason ? { reason } : {}),
    outcome,
  });
}

/* -------------------- 5. Подпис -------------------- */

export function trackSign(
  event: "requested" | "signed" | "declined" | "fail",
  props?: DocFunnelProps,
) {
  const reason = props?.reason !== undefined ? normalizeReason(String(props.reason)) : undefined;
  trackDocEvent(`doc_sign_${event}`, "sign", { ...(props ?? {}), ...(reason ? { reason } : {}), outcome: event });
}

/* -------------------- Activation continuity -------------------- */

/**
 * Събития за непрекъснатост на активацията. Дедупликацията е по `draft_id`, за
 * да не се дублират при refresh или при два таба. Никакви лични данни в props —
 * `draft_id` е случаен идентификатор, а не съдържание.
 */
export function trackDraftEvent(
  event:
    | "draft_created"
    | "draft_autosaved"
    | "draft_restore_offered"
    | "draft_restored"
    | "draft_claim_started"
    | "draft_claim_succeeded"
    | "draft_claim_blocked"
    | "draft_sync_blocked"
    | "draft_expired",
  props?: DocFunnelProps & { draft_id?: string; reason?: string },
): boolean {
  const reason = props?.reason ? normalizeReason(props.reason) : undefined;
  const clean = { ...(props ?? {}), ...(reason ? { reason } : {}) };
  const once =
    event === "draft_created" ||
    event === "draft_autosaved" ||
    event === "draft_restore_offered" ||
    event === "draft_restored";
  // Отказан запис се брои веднъж на чернова+причина, за да не залива таблото
  // при повтарящ се debounce със същия резултат.
  const oncePerReason = event === "draft_sync_blocked";
  return trackCanonical(
    event,
    clean,
    once
      ? [event, props?.draft_id ?? "", props?.doc_key ?? ""]
      : oncePerReason
        ? [event, props?.draft_id ?? "", reason ?? ""]
        : undefined,
  );
}
