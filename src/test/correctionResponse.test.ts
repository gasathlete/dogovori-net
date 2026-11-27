/**
 * Отговорът с корекция се приема САМО ако носи точно заявения анализ и източник.
 */
import { describe, expect, it } from "vitest";
import { validateCorrectionResponse } from "@/lib/uploadedContractOps";
import type { AnalysisSourceBinding } from "@/lib/analysisSourceBinding";

const binding: AnalysisSourceBinding = {
  version: 1,
  text_sha256: "a".repeat(64),
  title_sha256: "b".repeat(64),
};
const other: AnalysisSourceBinding = { ...binding, text_sha256: "c".repeat(64) };

const base = {
  requestedAnalysisId: "an-1",
  requestedBinding: binding,
};

const good = {
  analysis_id: "an-1",
  source: binding,
  corrected_text: "Поправен текст",
  changes: ["едно"],
};

describe("проверка на отговора с корекция", () => {
  it("валиден отговор минава с идентичност и промени", () => {
    const r = validateCorrectionResponse({ ...base, response: good });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.analysisId).toBe("an-1");
      expect(r.result.sourceBinding).toEqual(binding);
      expect(r.result.changes).toEqual(["едно"]);
    }
  });

  it("липсващ анализ не се допълва от заявката", () => {
    const { analysis_id: _drop, ...rest } = good;
    const r = validateCorrectionResponse({ ...base, response: rest });
    expect(r).toEqual({ ok: false, reason: "analysis_missing" });
  });

  it("друг анализ се отхвърля", () => {
    const r = validateCorrectionResponse({ ...base, response: { ...good, analysis_id: "an-2" } });
    expect(r).toEqual({ ok: false, reason: "analysis_mismatch" });
  });

  it("липсващо обвързване се отхвърля", () => {
    const { source: _s, ...rest } = good;
    const r = validateCorrectionResponse({ ...base, response: rest });
    expect(r).toEqual({ ok: false, reason: "binding_missing" });
  });

  it("друг източник се отхвърля", () => {
    const r = validateCorrectionResponse({ ...base, response: { ...good, source: other } });
    expect(r).toEqual({ ok: false, reason: "binding_mismatch" });
  });

  it("празен текст се отхвърля", () => {
    const r = validateCorrectionResponse({ ...base, response: { ...good, corrected_text: "   " } });
    expect(r).toEqual({ ok: false, reason: "empty_text" });
  });

  it("непознат вид отговор се отхвърля", () => {
    for (const bad of [null, undefined, "текст", 5, []]) {
      expect(validateCorrectionResponse({ ...base, response: bad }).ok).toBe(false);
    }
  });

  it("нетекстови промени се пренебрегват, без да се приема отговорът за невалиден", () => {
    const r = validateCorrectionResponse({ ...base, response: { ...good, changes: ["ок", 3, null] } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.result.changes).toEqual(["ок"]);
  });
});
