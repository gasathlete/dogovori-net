import { describe, it, expect } from "vitest";
import { hasValidStrategyEvidence, readVerifiedStrategy } from "@/lib/strategyEvidence";

const ANALYSIS_ID = "11111111-1111-1111-1111-111111111111";

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    summary: "Стратегия",
    __evidence: {
      version: "v1",
      analysis_id: ANALYSIS_ID,
      source_digest: "abc123",
      generated_at: new Date().toISOString(),
      citations: [{ short_code: "ЗЗД", version: "2026-01" }],
      ...overrides,
    },
  };
}

describe("доказателствен плик на преговорната стратегия", () => {
  it("стар запис без плик не се показва", () => {
    const legacy = { summary: "Стара стратегия", talking_points: ["..."] };
    expect(hasValidStrategyEvidence(legacy, ANALYSIS_ID)).toBe(false);
    expect(readVerifiedStrategy(legacy, ANALYSIS_ID)).toBeNull();
  });

  it("плик за друг анализ не се показва", () => {
    expect(readVerifiedStrategy(envelope({ analysis_id: "друг" }), ANALYSIS_ID)).toBeNull();
  });

  it("плик без версии на източниците не се показва", () => {
    expect(readVerifiedStrategy(envelope({ citations: [{ short_code: "ЗЗД" }] }), ANALYSIS_ID)).toBeNull();
    expect(readVerifiedStrategy(envelope({ citations: [] }), ANALYSIS_ID)).toBeNull();
  });

  it("подменена версия на плика не се показва", () => {
    expect(readVerifiedStrategy(envelope({ version: "v0" }), ANALYSIS_ID)).toBeNull();
  });

  it("невалидна дата или липсващ отпечатък не се показват", () => {
    expect(readVerifiedStrategy(envelope({ generated_at: "не-дата" }), ANALYSIS_ID)).toBeNull();
    expect(readVerifiedStrategy(envelope({ source_digest: "" }), ANALYSIS_ID)).toBeNull();
  });

  it("текущ валиден резултат се показва", () => {
    const value = envelope();
    expect(readVerifiedStrategy(value, ANALYSIS_ID)).toBe(value);
  });

  it("null и празни стойности не чупят проверката", () => {
    expect(hasValidStrategyEvidence(null, ANALYSIS_ID)).toBe(false);
    expect(hasValidStrategyEvidence("текст", ANALYSIS_ID)).toBe(false);
  });
});
