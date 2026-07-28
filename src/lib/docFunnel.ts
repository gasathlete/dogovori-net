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
  trackFunnelEvent(name, { dstage: stage, ...(props ?? {}) });
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

export function trackGenerate(
  outcome: "started" | "success" | "fail",
  props?: DocFunnelProps,
) {
  trackDocEvent(`doc_generate_${outcome}`, "generate", { outcome, ...(props ?? {}) });
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
