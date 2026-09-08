import { describe, expect, it } from "vitest";
import {
  analysisBadge,
  emptyIssuesMessage,
  parseAnalysisVerification,
  presentAnalysisScore,
} from "@/lib/analysisVerification";

const checked = {
  version: 1,
  status: "evidence_checked",
  reason_codes: [],
  counts: {
    issues_raw: 2,
    issues_kept: 2,
    issues_rejected: 0,
    missing_raw: 1,
    missing_kept: 1,
    missing_rejected: 0,
  },
  score_trusted: true,
};

const incomplete = {
  ...checked,
  status: "incomplete",
  reason_codes: ["quote_unverified"],
  score_trusted: false,
};

describe("parseAnalysisVerification", () => {
  it("липсващи метаданни са legacy_unverified", () => {
    expect(parseAnalysisVerification(null).status).toBe("legacy_unverified");
    expect(parseAnalysisVerification(undefined).status).toBe("legacy_unverified");
  });

  it("повредени или несъвместими метаданни са unverified", () => {
    expect(parseAnalysisVerification("evidence_checked").status).toBe("unverified");
    expect(parseAnalysisVerification([]).status).toBe("unverified");
    expect(parseAnalysisVerification({ version: 2, status: "evidence_checked" }).status).toBe("unverified");
    expect(parseAnalysisVerification({ version: 1, status: "clean" }).status).toBe("unverified");
  });

  it("не се доверява на score_trusted при incomplete", () => {
    const p = parseAnalysisVerification({ ...incomplete, score_trusted: true });
    expect(p.status).toBe("incomplete");
    expect(p.scoreTrusted).toBe(false);
  });

  it("нечислови броячи стават нула, а не NaN", () => {
    const p = parseAnalysisVerification({ ...checked, counts: { issues_raw: "3" } });
    expect(p.counts?.issuesRaw).toBe(0);
    expect(p.counts?.issuesKept).toBe(0);
  });
});

describe("presentAnalysisScore", () => {
  it("показва оценка само при напълно обоснован анализ", () => {
    const p = presentAnalysisScore({ score: 8, verification: checked });
    expect(p.showScore).toBe(true);
    expect(p.score).toBe(8);
    expect(p.notice).toBeNull();
    expect(p.subtext).not.toContain("безопасен за подпис");
  });

  it("непълен анализ не показва оценка и обяснява защо", () => {
    const p = presentAnalysisScore({ score: 9, verification: incomplete });
    expect(p.showScore).toBe(false);
    expect(p.score).toBeNull();
    expect(p.tone).toContain("muted");
    expect(p.notice).toContain("не е пълна");
  });

  it("стар запис се показва неутрално, без сертифициране със задна дата", () => {
    const p = presentAnalysisScore({ score: 10, verification: null });
    expect(p.showScore).toBe(false);
    expect(p.label).toContain("без запис");
  });

  it("невалидна оценка не се показва дори при потвърдени метаданни", () => {
    for (const bad of [0, 11, NaN, "8", null, undefined]) {
      expect(presentAnalysisScore({ score: bad, verification: checked }).showScore).toBe(false);
    }
  });

  it("нито един етикет не обещава безопасен подпис", () => {
    for (const s of [1, 3, 5, 7, 9, 10]) {
      const p = presentAnalysisScore({ score: s, verification: checked });
      expect(`${p.label} ${p.subtext}`.toLowerCase()).not.toContain("безопасен");
    }
  });
});

describe("emptyIssuesMessage", () => {
  it("непълна проверка не твърди липса на риск", () => {
    expect(emptyIssuesMessage(incomplete)).toBe("Няма потвърдени находки; проверката не е пълна.");
    expect(emptyIssuesMessage(null)).toBe("Няма потвърдени находки; проверката не е пълна.");
  });

  it("обоснован анализ пак не дава правна гаранция", () => {
    expect(emptyIssuesMessage(checked)).toContain("не е правна гаранция");
  });
});

describe("analysisBadge", () => {
  it("зелен бадж е възможен само при потвърден анализ", () => {
    expect(analysisBadge({ score: 9, verification: checked }).text).toBe("9/10");
    const b = analysisBadge({ score: 9, verification: incomplete });
    expect(b.text).toBe("непотвърден");
    expect(b.className).not.toContain("emerald");
  });
});
