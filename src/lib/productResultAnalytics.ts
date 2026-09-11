/**
 * Факти за платения резултат — без лични данни и без съдържание.
 *
 * Записваме само какво се е случило (видяно състояние, отворена находка, избор,
 * изтегляне, уточнение) и с кой продукт. Никога заглавия на документи, имена на
 * файлове, идентификатори, хешове, указания или текст от документа.
 */
import { trackMetric } from "@/lib/metrics";

export type ResultExportKind =
  | "review_pdf"
  | "corrected_docx"
  | "corrected_pdf"
  | "change_report_pdf"
  | "negotiation_brief_pdf";

const sent = new Set<string>();

/** Едно и също събитие с един и същи ключ се изпраща веднъж на сесия. */
function once(key: string, name: string, props: Record<string, string | number | boolean>) {
  if (sent.has(key)) return;
  sent.add(key);
  trackMetric(name, props);
}

/** Само за тестове: изчиства паметта за дедупликация. */
export function resetResultAnalytics(): void {
  sent.clear();
}

export function trackResultProcessingSeen(productId: string) {
  once(`processing:${productId}`, "result_processing_seen", { product: productId });
}

export function trackResultReadySeen(productId: string, findings: number) {
  once(`ready:${productId}`, "result_ready_seen", { product: productId, findings });
}

export function trackFindingOpened(productId: string, severity: string) {
  trackMetric("finding_opened", { product: productId, severity });
}

export function trackCorrectionSelected(productId: string, strategy: string, decision: string) {
  trackMetric("correction_selected", { product: productId, strategy, decision });
}

export function trackCorrectedPreviewOpened(productId: string) {
  once(`preview:${productId}`, "corrected_preview_opened", { product: productId });
}

export function trackExportCompleted(productId: string, type: ResultExportKind) {
  trackMetric("export_completed", { product: productId, type });
}

export function trackRefinementSubmitted() {
  trackMetric("refinement_submitted", { product: "negotiation_package" });
}

export function trackRefinementCompleted() {
  trackMetric("refinement_completed", { product: "negotiation_package" });
}

export function trackRefinementFailed(reason: string) {
  trackMetric("refinement_failed", { product: "negotiation_package", reason });
}

export function trackQuietPlanLinkClicked(productId: string) {
  trackMetric("quiet_plan_link_clicked", { product: productId });
}
