import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canUseFeature, PRELAUNCH_BLOCKERS, PRELAUNCH_FEATURES } from "@/lib/prelaunch";
import { PRELAUNCH_MATRIX } from "@/lib/prelaunchMatrix";

describe("матрица на предварителния режим", () => {
  it("правата на субекта и възникналите задължения никога не са затворени", () => {
    for (const t of ["delete-account", "export-my-data", "payments-webhook", "customer-portal", "/unsubscribe"]) {
      const row = PRELAUNCH_MATRIX.find((r) => r.target.includes(t));
      expect(row?.status, t).toBe("never_gated");
    }
  });
  it("активно право пропуска; нов потребител отива към заявка; непознато — затворено", () => {
    for (const f of PRELAUNCH_FEATURES) {
      expect(canUseFeature(f, { hasActiveEntitlement: true })).toBe(true);
      expect(canUseFeature(f, { hasActiveEntitlement: false })).toBe(false);
      expect(PRELAUNCH_BLOCKERS[f].length).toBeGreaterThan(0);
    }
    expect(canUseFeature("x", { hasActiveEntitlement: true })).toBe(false);
  });
  it("проверките в Wizard и CompanionChip отчитат вече възникнало право", () => {
    const w = readFileSync("src/pages/Wizard.tsx", "utf8");
    const c = readFileSync("src/components/CompanionChip.tsx", "utf8");
    expect(w).not.toContain("isFeatureAvailable(");
    expect(w.match(/canUseFeature\("[a-z_]+", \{ hasActiveEntitlement: isPro \}\)/g)?.length).toBe(4);
    expect(c).toContain('canUseFeature("blank_download", { hasActiveEntitlement: isPro })');
  });
  it("сценарий А: пътят за готови шаблони не вика AI", () => {
    expect(readFileSync("src/lib/templateExporter.ts", "utf8")).not.toMatch(/supabase|invoke|fetch\(/);
    expect(readFileSync("supabase/functions/download-document/index.ts", "utf8")).not.toMatch(/ai\.gateway|LOVABLE_API_KEY/);
    expect(readFileSync("supabase/functions/download-blank/index.ts", "utf8")).toMatch(/ai\.gateway|LOVABLE_API_KEY|gateway/);
  });
});
