import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canUseFeature, isNewRawProcessingFeature, PRELAUNCH_BLOCKERS, PRELAUNCH_FEATURES } from "@/lib/prelaunch";
import { PRELAUNCH_MATRIX } from "@/lib/prelaunchMatrix";

describe("матрица на предварителния режим", () => {
  it("правата на субекта и възникналите задължения никога не са затворени", () => {
    for (const t of ["delete-account", "export-my-data", "payments-webhook", "customer-portal", "/unsubscribe"]) {
      const row = PRELAUNCH_MATRIX.find((r) => r.target.includes(t));
      expect(row?.status, t).toBe("never_gated");
    }
  });
  it("активно право пропуска само за не-AI функции; нова AI обработка/покупка — затворена и за абонати", () => {
    const proven = new Set<string>(["document_generation","document_review","assistant","blank_download","one_time_product","subscription"]);
    for (const f of PRELAUNCH_FEATURES) {
      expect(canUseFeature(f, { hasActiveEntitlement: true })).toBe(proven.has(f) || !isNewRawProcessingFeature(f));
      expect(canUseFeature(f, { hasActiveEntitlement: false })).toBe(proven.has(f));
      expect(PRELAUNCH_BLOCKERS[f].length).toBeGreaterThan(0);
    }
    expect(canUseFeature("x", { hasActiveEntitlement: true })).toBe(false);
  });
  it("Wizard (AI генериране и download-blank) не пропуска абонати; CompanionChip пази статичното право", () => {
    const w = readFileSync("src/pages/Wizard.tsx", "utf8");
    const c = readFileSync("src/components/CompanionChip.tsx", "utf8");
    expect(w).not.toContain("isFeatureAvailable(");
    expect(w).not.toContain("canUseFeature(");
    expect(w.match(/canStartNewProcessing\("(document_generation|blank_download)"\)/g)?.length).toBe(4);
    // Отворено за всички след реална проверка; абонатът не получава нищо повече.
    expect(canUseFeature("document_generation", { hasActiveEntitlement: false })).toBe(true);
    expect(c).toContain('canUseFeature("blank_download", { hasActiveEntitlement: isPro })');
  });
  it("сценарий А: пътят за готови шаблони не вика AI", () => {
    expect(readFileSync("src/lib/templateExporter.ts", "utf8")).not.toMatch(/supabase|invoke|fetch\(/);
    expect(readFileSync("supabase/functions/download-document/index.ts", "utf8")).not.toMatch(/ai\.gateway|LOVABLE_API_KEY/);
    expect(readFileSync("supabase/functions/download-blank/index.ts", "utf8")).toMatch(/ai\.gateway|LOVABLE_API_KEY|gateway/);
  });
});
