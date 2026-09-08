import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  buildSnapshotIdentityKey,
  buildTitleContext,
  computeSavedSnapshotBinding,
  computeSourceBinding,
  historicalFindingsNotice,
  isSnapshotActionable,
  readSourceBinding,
  resolveSnapshotFreshness,
  sha256Hex,
  validateAnalysisSourceBinding,
  type AnalysisSourceBinding,
} from "@/lib/analysisSourceBinding";
import { analysisBadge, presentAnalysisScore } from "@/lib/analysisVerification";
import {
  buildCorrectionRequest,
  buildCorrectionSelection,
  classifyCasResult,
  isCorrectionStale,
  selectionTotal,
  shouldApplyAsyncResult,
} from "@/lib/uploadedContractOps";

const nodeSha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

const checked = {
  version: 1,
  status: "evidence_checked",
  reason_codes: [] as string[],
  counts: {
    issues_raw: 1, issues_kept: 1, issues_rejected: 0,
    missing_raw: 0, missing_kept: 0, missing_rejected: 0,
  },
  score_trusted: true,
};

const withSource = (b: AnalysisSourceBinding) => ({ ...checked, source: b });

describe("отпечатък на източника (браузър) съвпада с backend договорката", () => {
  it("дайджестът е SHA-256 на точния низ", async () => {
    const text = "Договор за услуги.\nЦена: 1 200,50 €.";
    expect(await sha256Hex(text)).toBe(nodeSha(text));
  });

  it("заглавният контекст е точно същият низ като на сървъра", async () => {
    expect(buildTitleContext("Наем")).toBe("Заглавие на документа: Наем");
    const b = await computeSavedSnapshotBinding({ savedText: `  ${"a".repeat(100)}  `, savedTitle: "Наем" });
    expect(b.text_sha256).toBe(nodeSha("a".repeat(100)));
    expect(b.title_sha256).toBe(nodeSha("Заглавие на документа: Наем"));
  });

  it("пълната опашка след 28 000 знака променя дайджеста", async () => {
    const base = "ю".repeat(28_000);
    const a = await computeSavedSnapshotBinding({ savedText: base + "край A", savedTitle: "T" });
    const b = await computeSavedSnapshotBinding({ savedText: base + "край Б", savedTitle: "T" });
    expect(a.text_sha256).not.toBe(b.text_sha256);
  });

  it("сума, отрицание, валута, разредка и заглавие дават различен отпечатък", async () => {
    const base = { savedText: "Неустойка 1 000,00 € не се дължи.", savedTitle: "Договор" };
    const ref = await computeSavedSnapshotBinding(base);
    const variants = [
      { ...base, savedText: "Неустойка 1 000,00 € се дължи." },
      { ...base, savedText: "Неустойка 1 000.00 € не се дължи." },
      { ...base, savedText: "Неустойка 1 000,00 лв. не се дължи." },
      { ...base, savedText: "Неустойка  1 000,00 € не се дължи." },
      { ...base, savedTitle: "Договор " },
    ];
    for (const v of variants) {
      const got = await computeSavedSnapshotBinding(v);
      expect(`${got.text_sha256}|${got.title_sha256}`).not.toBe(`${ref.text_sha256}|${ref.title_sha256}`);
    }
  });

  it("повредено/непознато/липсващо обвързване е невалидно (fail closed)", () => {
    const good = { version: 1, text_sha256: "a".repeat(64), title_sha256: "b".repeat(64) };
    expect(validateAnalysisSourceBinding(good)).not.toBeNull();
    for (const bad of [
      null, undefined, 1, "x", [], {},
      { ...good, version: 2 },
      { ...good, text_sha256: "A".repeat(64) },
      { ...good, title_sha256: "b".repeat(63) },
      { version: 1, text_sha256: "a".repeat(64) },
    ]) {
      expect(validateAnalysisSourceBinding(bad)).toBeNull();
    }
    expect(readSourceBinding(checked)).toBeNull();
    expect(readSourceBinding(null)).toBeNull();
  });
});

describe("актуалност на снимката", () => {
  const key = buildSnapshotIdentityKey({ userId: "u1", docId: "d1", savedText: "T", savedTitle: "Z" });
  const binding: AnalysisSourceBinding = {
    version: 1, text_sha256: "a".repeat(64), title_sha256: "b".repeat(64),
  };
  const other: AnalysisSourceBinding = {
    version: 1, text_sha256: "c".repeat(64), title_sha256: "b".repeat(64),
  };

  it("незапазени промени скриват актуалността", () => {
    expect(resolveSnapshotFreshness({
      hasUnsavedChanges: true, identityKey: key,
      digest: { identityKey: key, binding }, storedVerification: withSource(binding),
    })).toBe("unsaved");
  });

  it("дайджест за друг вход/документ не удостоверява текущия текст", () => {
    expect(resolveSnapshotFreshness({
      hasUnsavedChanges: false, identityKey: key,
      digest: { identityKey: "друг", binding }, storedVerification: withSource(binding),
    })).toBe("checking");
    expect(resolveSnapshotFreshness({
      hasUnsavedChanges: false, identityKey: key,
      digest: null, storedVerification: withSource(binding),
    })).toBe("checking");
  });

  it("липсващо обвързване (легаси) НИКОГА не е актуално", () => {
    expect(resolveSnapshotFreshness({
      hasUnsavedChanges: false, identityKey: key,
      digest: { identityKey: key, binding }, storedVerification: checked,
    })).toBe("unknown");
    expect(resolveSnapshotFreshness({
      hasUnsavedChanges: false, identityKey: key,
      digest: { identityKey: key, binding }, storedVerification: null,
    })).toBe("unknown");
  });

  it("различен източник е stale, идентичният е current", () => {
    expect(resolveSnapshotFreshness({
      hasUnsavedChanges: false, identityKey: key,
      digest: { identityKey: key, binding }, storedVerification: withSource(other),
    })).toBe("stale");
    expect(resolveSnapshotFreshness({
      hasUnsavedChanges: false, identityKey: key,
      digest: { identityKey: key, binding }, storedVerification: withSource(binding),
    })).toBe("current");
  });

  it("само current разрешава AI действия", () => {
    expect(isSnapshotActionable("current")).toBe(true);
    for (const f of ["checking", "unsaved", "stale", "unknown"] as const) {
      expect(isSnapshotActionable(f)).toBe(false);
      expect(historicalFindingsNotice(f)).toBeTruthy();
    }
    expect(historicalFindingsNotice("current")).toBeNull();
  });
});

describe("представянето пада затворено при неактуална снимка", () => {
  it("оценка се показва само при current + потвърден анализ", () => {
    expect(presentAnalysisScore({ score: 9, verification: checked, freshness: "current" }).showScore).toBe(true);
    for (const f of ["checking", "unsaved", "stale", "unknown"] as const) {
      const p = presentAnalysisScore({ score: 9, verification: checked, freshness: f });
      expect(p.showScore, f).toBe(false);
      expect(p.score).toBeNull();
      expect(p.notice).toBeTruthy();
      expect(`${p.label} ${p.subtext}`).not.toMatch(/безопас|гаранц/i);
    }
  });

  it("баджът в списъци е историчен, без да звучи потвърдено", () => {
    const b = analysisBadge({ score: 9, verification: checked, freshness: "unknown" });
    expect(b.text).toBe("Предишна проверка");
    expect(b.text).not.toMatch(/10/);
  });
});

describe("защита срещу закъснели отговори", () => {
  const idA = { docId: "A", userId: "u1" };
  const idB = { docId: "B", userId: "u1" };

  it("резултат за друг документ/потребител или стар токен се отхвърля", () => {
    expect(shouldApplyAsyncResult({ startedToken: 1, currentToken: 1, startedIdentity: idA, currentIdentity: idA })).toBe(true);
    expect(shouldApplyAsyncResult({ startedToken: 1, currentToken: 2, startedIdentity: idA, currentIdentity: idA })).toBe(false);
    expect(shouldApplyAsyncResult({ startedToken: 1, currentToken: 1, startedIdentity: idA, currentIdentity: idB })).toBe(false);
    expect(shouldApplyAsyncResult({
      startedToken: 1, currentToken: 1, startedIdentity: idA, currentIdentity: { docId: "A", userId: null },
    })).toBe(false);
  });
});

describe("оптимистичен запис", () => {
  it("нула върнати реда е конфликт, не успех", () => {
    expect(classifyCasResult({ data: null, error: null })).toEqual({ kind: "conflict" });
    expect(classifyCasResult({ data: { id: "1" }, error: null })).toEqual({ kind: "ok", row: { id: "1" } });
    expect(classifyCasResult({ data: null, error: { message: "боом" } })).toEqual({ kind: "error", message: "боом" });
  });
});

describe("точен избор на корекции", () => {
  const binding: AnalysisSourceBinding = {
    version: 1, text_sha256: "a".repeat(64), title_sha256: "b".repeat(64),
  };

  it("празна категория остава празна — без падане към всички", () => {
    const sel = buildCorrectionSelection({
      issuesCount: 3, missingCount: 2, issueSel: {}, missingSel: { 1: true },
    });
    expect(sel.selectedIssueIndices).toEqual([]);
    expect(sel.selectedMissingIndices).toEqual([1]);
    expect(selectionTotal(sel)).toBe(1);

    const built = buildCorrectionRequest({
      uploadedContractId: "d1", analysisId: "a1", currentBinding: binding,
      freshness: "current", selection: sel, userConfirmed: false,
    });
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.payload.selectedIssueIndices).toEqual([]);
      expect(built.payload.selectedMissingIndices).toEqual([1]);
      expect(built.payload.expectedSourceBinding).toEqual(binding);
    }
  });

  it("нищо избрано или неактуален източник не праща заявка", () => {
    const empty = buildCorrectionSelection({ issuesCount: 2, missingCount: 2, issueSel: {}, missingSel: {} });
    expect(buildCorrectionRequest({
      uploadedContractId: "d1", analysisId: "a1", currentBinding: binding,
      freshness: "current", selection: empty, userConfirmed: false,
    })).toEqual({ ok: false, reason: "empty_selection" });

    const some = buildCorrectionSelection({ issuesCount: 2, missingCount: 0, issueSel: { 0: true }, missingSel: {} });
    for (const f of ["stale", "unknown", "unsaved", "checking"] as const) {
      expect(buildCorrectionRequest({
        uploadedContractId: "d1", analysisId: "a1", currentBinding: binding,
        freshness: f, selection: some, userConfirmed: false,
      })).toEqual({ ok: false, reason: "not_current" });
    }
    expect(buildCorrectionRequest({
      uploadedContractId: "d1", analysisId: "a1", currentBinding: null,
      freshness: "current", selection: some, userConfirmed: false,
    })).toEqual({ ok: false, reason: "not_current" });
    expect(buildCorrectionRequest({
      uploadedContractId: "d1", analysisId: null, currentBinding: binding,
      freshness: "current", selection: some, userConfirmed: false,
    })).toEqual({ ok: false, reason: "no_analysis" });
  });

  it("корекция за друг източник/анализ се маркира като изостанала", () => {
    const other: AnalysisSourceBinding = { ...binding, text_sha256: "c".repeat(64) };
    expect(isCorrectionStale({
      correction: { analysisId: "a1", sourceBinding: binding },
      analysisId: "a1", currentBinding: binding, freshness: "current",
    })).toBe(false);
    expect(isCorrectionStale({
      correction: { analysisId: "a1", sourceBinding: other },
      analysisId: "a1", currentBinding: binding, freshness: "current",
    })).toBe(true);
    expect(isCorrectionStale({
      correction: { analysisId: "a2", sourceBinding: binding },
      analysisId: "a1", currentBinding: binding, freshness: "current",
    })).toBe(true);
    expect(isCorrectionStale({
      correction: { analysisId: "a1", sourceBinding: null },
      analysisId: "a1", currentBinding: binding, freshness: "current",
    })).toBe(true);
    expect(isCorrectionStale({
      correction: { analysisId: "a1", sourceBinding: binding },
      analysisId: "a1", currentBinding: binding, freshness: "stale",
    })).toBe(true);
  });
});

describe("computeSourceBinding", () => {
  it("еднакъв вход дава стабилен резултат", async () => {
    const a = await computeSourceBinding({ sourceText: "x", titleContext: "y" });
    const b = await computeSourceBinding({ sourceText: "x", titleContext: "y" });
    expect(a).toEqual(b);
  });
});
