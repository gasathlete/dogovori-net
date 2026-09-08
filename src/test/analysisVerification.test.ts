import { describe, expect, it } from "vitest";
import {
  analysisBadge,
  emptyIssuesMessage,
  parseAnalysisVerification,
  presentAnalysisScore,
} from "@/lib/analysisVerification";
import { VERIFICATION_FIXTURES } from "./analysisVerificationFixtures";

const checked = {
  version: 1,
  status: "evidence_checked",
  reason_codes: [],
  counts: {
    issues_raw: 1,
    issues_kept: 1,
    issues_rejected: 0,
    missing_raw: 0,
    missing_kept: 0,
    missing_rejected: 0,
  },
  score_trusted: true,
};

const incomplete = {
  version: 1,
  status: "incomplete",
  reason_codes: ["quote_unverified"],
  counts: {
    issues_raw: 2,
    issues_kept: 1,
    issues_rejected: 1,
    missing_raw: 0,
    missing_kept: 0,
    missing_rejected: 0,
  },
  score_trusted: false,
};

describe("parseAnalysisVerification — строга схема, огледална на edge функцията", () => {
  it("решава еднакво с edge валидатора по общия набор случаи", () => {
    for (const f of VERIFICATION_FIXTURES) {
      const parsed = parseAnalysisVerification(f.value);
      const accepted = parsed.status === "evidence_checked" || parsed.status === "incomplete";
      expect(accepted, f.name).toBe(f.valid);
      if (!f.valid) expect(parsed.status, f.name).toBe("unverified");
      if (!f.valid) expect(parsed.scoreTrusted, f.name).toBe(false);
    }
  });

  it("липсата на метаданни е legacy_unverified", () => {
    for (const v of [null, undefined]) {
      const p = parseAnalysisVerification(v);
      expect(p.status).toBe("legacy_unverified");
      expect(p.scoreTrusted).toBe(false);
      expect(p.counts).toBeNull();
    }
  });

  it("не се доверява на непълни метаданни без броеве", () => {
    const p = parseAnalysisVerification({ version: 1, status: "evidence_checked", score_trusted: true });
    expect(p.status).toBe("unverified");
    expect(p.scoreTrusted).toBe(false);
  });

  it("не се доверява на противоречиви метаданни", () => {
    const p = parseAnalysisVerification({ ...incomplete, status: "evidence_checked", score_trusted: true });
    expect(p.status).toBe("unverified");
  });

  it("валидните метаданни връщат типизирани броеве", () => {
    const p = parseAnalysisVerification(incomplete);
    expect(p.status).toBe("incomplete");
    expect(p.counts).toEqual({
      issuesRaw: 2,
      issuesKept: 1,
      issuesRejected: 1,
      missingRaw: 0,
      missingKept: 0,
      missingRejected: 0,
    });
  });
});

describe("presentAnalysisScore", () => {
  it("показва оценка само при потвърден анализ", () => {
    const p = presentAnalysisScore({ score: 8, verification: checked, freshness: "current" });
    expect(p.showScore).toBe(true);
    expect(p.score).toBe(8);
    expect(p.notice).toBeNull();
  });

  it("непълен анализ не показва оценка", () => {
    const p = presentAnalysisScore({ score: 9, verification: incomplete, freshness: "current" });
    expect(p.showScore).toBe(false);
    expect(p.score).toBeNull();
    expect(p.label).toBe("Част от проверката не е завършена");
    expect(p.subtext).toBe("Потвърдените находки остават видими.");
    expect(p.notice).toContain("не е завършена");
  });

  it("легаси запис насочва към нов анализ, без оценка", () => {
    const p = presentAnalysisScore({ score: 9, verification: null, freshness: "current" });
    expect(p.showScore).toBe(false);
    expect(p.label).toBe("Предишен анализ");
    expect(p.subtext).toBe("Направете нов анализ, за да получите актуална проверка.");
  });

  it("непотвърдени метаданни канят към преглед, без да наричат находките потвърдени", () => {
    const p = presentAnalysisScore({ score: 9, verification: { version: 99 } });
    expect(p.showScore).toBe(false);
    expect(p.label).toBe("Не можем да потвърдим този анализ");
    expect(p.subtext).toBe("Прегледайте документа и посочените находки.");
    expect(`${p.subtext} ${p.notice}`).not.toMatch(/потвърдените находки/i);
  });

  it("копието е за ползвателя, не за вътрешното състояние", () => {
    for (const v of [null, incomplete, { version: 99 }]) {
      const p = presentAnalysisScore({ score: 9, verification: v, freshness: "current" });
      const txt = `${p.label} ${p.subtext} ${p.notice}`;
      for (const jargon of [/показва се неутрално/i, /със задна дата/i, /метаданни/i, /верси/i, /валидатор/i, /схем/i]) {
        expect(txt, JSON.stringify(v)).not.toMatch(jargon);
      }
    }
  });

  it("дробна оценка НЕ се закръгля, а се отхвърля", () => {
    for (const bad of [7.5, 0, 11, NaN, Infinity, "8", null, undefined]) {
      const p = presentAnalysisScore({ score: bad, verification: checked, freshness: "current" });
      expect(p.showScore).toBe(false);
      expect(p.score).toBeNull();
    }
  });

  it("никъде няма гаранция за безопасен подпис", () => {
    for (const s of [1, 5, 8, 10]) {
      const p = presentAnalysisScore({ score: s, verification: checked, freshness: "current" });
      const txt = `${p.label} ${p.subtext}`;
      expect(txt).not.toMatch(/безопас/i);
      expect(txt).not.toMatch(/без рискове/i);
      expect(txt).not.toMatch(/гарант(ира|ирано)\b/i);
    }
  });
});

describe("текстове при нула находки и в списъци", () => {
  it("непълен анализ без находки не звучи безрисково", () => {
    expect(emptyIssuesMessage(incomplete)).toBe(
      "Няма потвърдени находки; част от проверката не е завършена.",
    );
    for (const v of [null, { version: 1, status: "evidence_checked" }]) {
      const msg = emptyIssuesMessage(v);
      expect(msg).toBe("Няма отбелязани находки, но този анализ не е потвърден. Прегледайте документа.");
      expect(msg).not.toMatch(/потвърдени находки/);
    }
  });

  it("потвърден анализ без находки пак не е правна гаранция", () => {
    expect(emptyIssuesMessage(checked)).toContain("не е правна гаранция");
  });

  it("баджът е неутрален при непотвърдени метаданни", () => {
    expect(analysisBadge({ score: 9, verification: incomplete, freshness: "current" }).text).toBe("непотвърден");
    expect(analysisBadge({ score: 9, verification: null, freshness: "current" }).text).toBe("непотвърден");
    expect(analysisBadge({ score: 9, verification: checked, freshness: "current" }).text).toBe("9/10");
  });
});
