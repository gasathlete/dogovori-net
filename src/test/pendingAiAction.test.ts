/**
 * Отложено AI действие след потвърждение за чувствителни данни.
 * Ключово: ПЪРВИ анализ (без актуален предишен анализ) трябва да може да се
 * потвърди, а старо потвърждение не бива да оторизира променен източник.
 */
import { describe, expect, it } from "vitest";
import {
  PENDING_REJECTION_MESSAGES,
  validatePendingAiAction,
  type AiActionScope,
  type PendingAiAction,
} from "@/lib/pendingAiAction";

const binding = { version: 1 as const, text_sha256: "a".repeat(64), title_sha256: "b".repeat(64) };
const other = { version: 1 as const, text_sha256: "c".repeat(64), title_sha256: "b".repeat(64) };

const scope: AiActionScope = {
  identity: { docId: "doc-1", userId: "user-1" },
  savedRevision: 0,
  savedSnapshotKey: "text\u0000Име",
};

describe("отложено AI действие", () => {
  it("първи анализ се потвърждава, дори когато няма актуален анализ", () => {
    const pending: PendingAiAction = { kind: "analyze", scope };
    const res = validatePendingAiAction(pending, {
      scope,
      hasUnsavedChanges: false,
      analysisId: null,
      currentBinding: null,
      freshness: "unknown",
    });
    expect(res.ok).toBe(true);
  });

  it("незапазени промени спират потвърденото действие", () => {
    const res = validatePendingAiAction({ kind: "analyze", scope }, {
      scope,
      hasUnsavedChanges: true,
      analysisId: null,
      currentBinding: null,
      freshness: "unsaved",
    });
    expect(res).toEqual({ ok: false, reason: "unsaved_changes" });
  });

  it("промяна на запазения източник обезсилва потвърждението", () => {
    const res = validatePendingAiAction({ kind: "analyze", scope }, {
      scope: { ...scope, savedRevision: 1, savedSnapshotKey: "друг текст\u0000Име" },
      hasUnsavedChanges: false,
      analysisId: null,
      currentBinding: null,
      freshness: "unknown",
    });
    expect(res).toEqual({ ok: false, reason: "scope_changed" });
  });

  it("смяна на документ или профил обезсилва потвърждението", () => {
    const res = validatePendingAiAction({ kind: "analyze", scope }, {
      scope: { ...scope, identity: { docId: "doc-2", userId: "user-1" } },
      hasUnsavedChanges: false,
      analysisId: null,
      currentBinding: null,
      freshness: "unknown",
    });
    expect(res).toEqual({ ok: false, reason: "scope_changed" });
  });

  it("корекция изисква същия анализ и същия актуален отпечатък", () => {
    const pending: PendingAiAction = {
      kind: "correct",
      scope,
      analysisId: "an-1",
      binding,
      selectedIssueIndices: [0],
      selectedMissingIndices: [],
    };
    expect(
      validatePendingAiAction(pending, {
        scope,
        hasUnsavedChanges: false,
        analysisId: "an-2",
        currentBinding: binding,
        freshness: "current",
      }),
    ).toEqual({ ok: false, reason: "analysis_changed" });

    expect(
      validatePendingAiAction(pending, {
        scope,
        hasUnsavedChanges: false,
        analysisId: "an-1",
        currentBinding: other,
        freshness: "current",
      }),
    ).toEqual({ ok: false, reason: "source_changed" });

    expect(
      validatePendingAiAction(pending, {
        scope,
        hasUnsavedChanges: false,
        analysisId: "an-1",
        currentBinding: binding,
        freshness: "stale",
      }),
    ).toEqual({ ok: false, reason: "source_changed" });

    const ok = validatePendingAiAction(pending, {
      scope,
      hasUnsavedChanges: false,
      analysisId: "an-1",
      currentBinding: binding,
      freshness: "current",
    });
    expect(ok.ok).toBe(true);
  });

  it("липсващо отложено действие никога не се изпълнява", () => {
    expect(
      validatePendingAiAction(null, {
        scope,
        hasUnsavedChanges: false,
        analysisId: null,
        currentBinding: null,
        freshness: "current",
      }),
    ).toEqual({ ok: false, reason: "scope_changed" });
  });

  it("съобщенията не звучат технически", () => {
    for (const msg of Object.values(PENDING_REJECTION_MESSAGES)) {
      expect(msg).not.toMatch(/binding|hash|token|generation|CAS/i);
      expect(msg.length).toBeGreaterThan(20);
    }
  });
});
