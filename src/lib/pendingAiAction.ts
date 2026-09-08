/**
 * Q2b2 — отложено AI действие след потвърждение за чувствителни данни.
 *
 * Потвърждението се дава за КОНКРЕТНА снимка на документа. Затова при заявката
 * запомняме обхвата (документ + потребител + версия на запазения източник) и при
 * потвърждаване сравняваме с ЗАПОМНЕНИЯ обхват, а не текущите стойности сами със
 * себе си. Старо потвърждение не може да оторизира нов източник.
 *
 * Важно: първи анализ, наследен или изостанал анализ означава, че актуалността
 * е `unknown`/`stale`. Това НЕ пречи да се направи анализ — за анализ се иска
 * само същата запазена снимка без незапазени промени.
 */

import type { AnalysisSourceBinding, SnapshotFreshness } from "@/lib/analysisSourceBinding";
import { isSourceBindingEqual } from "@/lib/analysisSourceBinding";
import { isSameViewIdentity, type ViewIdentity } from "@/lib/uploadedContractOps";

export interface AiActionScope {
  identity: ViewIdentity;
  /** Расте при всяка нова запазена версия на документа (текст или име). */
  savedRevision: number;
  /** Ключ на запазената снимка — точният текст и име, върху които работим. */
  savedSnapshotKey: string;
}

export type PendingAiAction =
  | { kind: "analyze"; scope: AiActionScope }
  | {
      kind: "correct";
      scope: AiActionScope;
      analysisId: string;
      binding: AnalysisSourceBinding;
      selectedIssueIndices: number[];
      selectedMissingIndices: number[];
    };

export function isSameAiActionScope(a: AiActionScope, b: AiActionScope): boolean {
  return (
    isSameViewIdentity(a.identity, b.identity) &&
    a.savedRevision === b.savedRevision &&
    a.savedSnapshotKey === b.savedSnapshotKey
  );
}

export type PendingRejectionReason =
  | "scope_changed"
  | "unsaved_changes"
  | "analysis_changed"
  | "source_changed";

export const PENDING_REJECTION_MESSAGES: Record<PendingRejectionReason, string> = {
  scope_changed:
    "Документът или профилът се смениха след потвърждението. Потвърдете отново за текущия документ.",
  unsaved_changes:
    "Има незапазени промени след потвърждението. Запазете текста и потвърдете отново.",
  analysis_changed:
    "Анализът се смени след потвърждението. Отворете корекциите отново.",
  source_changed:
    "Текстът на документа се промени след потвърждението. Направете нов анализ и потвърдете отново.",
};

export function validatePendingAiAction(
  pending: PendingAiAction | null,
  now: {
    scope: AiActionScope;
    hasUnsavedChanges: boolean;
    analysisId: string | null | undefined;
    currentBinding: AnalysisSourceBinding | null;
    freshness: SnapshotFreshness;
  },
): { ok: true; action: PendingAiAction } | { ok: false; reason: PendingRejectionReason } {
  if (!pending) return { ok: false, reason: "scope_changed" };
  if (!isSameAiActionScope(pending.scope, now.scope)) return { ok: false, reason: "scope_changed" };
  if (now.hasUnsavedChanges) return { ok: false, reason: "unsaved_changes" };

  if (pending.kind === "analyze") {
    // За анализ НЕ се иска съществуващ актуален анализ — точно това е случаят
    // при първи анализ или при наследен/изостанал предишен анализ.
    return { ok: true, action: pending };
  }

  if (!now.analysisId || pending.analysisId !== now.analysisId) {
    return { ok: false, reason: "analysis_changed" };
  }
  if (now.freshness !== "current" || !now.currentBinding) {
    return { ok: false, reason: "source_changed" };
  }
  if (!isSourceBindingEqual(pending.binding, now.currentBinding)) {
    return { ok: false, reason: "source_changed" };
  }
  return { ok: true, action: pending };
}
