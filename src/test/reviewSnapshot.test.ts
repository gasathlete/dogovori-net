/**
 * Q2d — доверие към резултата от ревизията в браузъра.
 * Синтетични данни; никакви AI повиквания.
 */
import { describe, expect, it } from "vitest";
import {
  assessReviewTrust,
  canShowReady,
  completenessNotice,
  computeReviewSourceDigest,
  readCompleteness,
  REVIEW_SOURCE_VERSION,
} from "@/lib/reviewSnapshot";

const base = {
  documentText: "Договорът се сключва за срок от 12 месеца и възнаграждението е 1 200,50 EUR.",
  documentTitle: "Договор за услуги",
  documentType: "dogovor-za-uslugi",
  context: { decisions: [{ label: "Срок", value: "12 месеца" }] },
  ignorePersonalData: true,
};

describe("отпечатък на източника", () => {
  it("е стабилен и се променя при промяна на текст, заглавие или контекст", async () => {
    const d = await computeReviewSourceDigest(base);
    expect(await computeReviewSourceDigest(base)).toBe(d);
    expect(await computeReviewSourceDigest({ ...base, documentText: `${base.documentText} Допълнение.` })).not.toBe(d);
    expect(await computeReviewSourceDigest({ ...base, documentTitle: "Друго" })).not.toBe(d);
    expect(
      await computeReviewSourceDigest({ ...base, context: { decisions: [{ label: "Срок", value: "24 месеца" }] } }),
    ).not.toBe(d);
    expect(await computeReviewSourceDigest({ ...base, ignorePersonalData: false })).not.toBe(d);
  });
});

describe("доверие към отговора", () => {
  it("стар резултат без отпечатък не се обявява за проверен", () => {
    const s = assessReviewTrust({ responseSource: null, expectedDigest: "abc" });
    expect(s.trust).toBe("unverified");
    expect(s.showVerdict).toBe(false);
    expect(s.notice).toBeTruthy();
  });

  it("различен отпечатък означава променен документ", () => {
    const s = assessReviewTrust({
      responseSource: { v: REVIEW_SOURCE_VERSION, digest: "aaa" },
      expectedDigest: "bbb",
    });
    expect(s.trust).toBe("mismatched");
    expect(s.showVerdict).toBe(false);
  });

  it("точно съвпадение се показва", () => {
    const s = assessReviewTrust({
      responseSource: { v: REVIEW_SOURCE_VERSION, digest: "aaa" },
      expectedDigest: "aaa",
    });
    expect(s.trust).toBe("verified");
    expect(s.showVerdict).toBe(true);
    expect(s.notice).toBeNull();
  });
});

describe("честна пълнота", () => {
  it("непълна проверка не може да е „готово“", () => {
    expect(canShowReady({ verdict: "ready", completeness: { status: "incomplete" }, trust: "verified" })).toBe(false);
    expect(canShowReady({ verdict: "ready", completeness: { status: "partial" }, trust: "verified" })).toBe(false);
    expect(canShowReady({ verdict: "ready", completeness: { status: "complete" }, trust: "unverified" })).toBe(false);
    expect(canShowReady({ verdict: "ready", completeness: { status: "complete" }, trust: "verified" })).toBe(true);
  });

  it("съобщенията са ясни и без техническа терминология", () => {
    expect(completenessNotice({ status: "complete" })).toBeNull();
    expect(completenessNotice({ status: "incomplete", reasons: ["input_truncated"] })).toContain("по-дълъг");
    expect(completenessNotice({ status: "partial" })).toContain("не се представят като установени факти");
  });

  it("пълнотата се чете строго", () => {
    expect(readCompleteness({ status: "partial", reasons: ["x", 5] })).toEqual({ status: "partial", reasons: ["x"] });
    expect(readCompleteness({ status: "нещо" })).toBeNull();
    expect(readCompleteness(null)).toBeNull();
    expect(readCompleteness([])).toBeNull();
  });
});
