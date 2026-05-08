import { describe, it, expect } from "vitest";

// Mirror of the Pro check used by download-document edge function.
function isPro(planRow: { plan: string; pro_until: string | null } | null): boolean {
  return !!planRow && (planRow.plan === "pro" || (!!planRow.pro_until && new Date(planRow.pro_until) > new Date()));
}

describe("isPro", () => {
  it("returns false for null row", () => {
    expect(isPro(null)).toBe(false);
  });
  it("returns true for plan=pro", () => {
    expect(isPro({ plan: "pro", pro_until: null })).toBe(true);
  });
  it("returns true when pro_until in future", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(isPro({ plan: "free", pro_until: future })).toBe(true);
  });
  it("returns false when pro_until in past", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(isPro({ plan: "free", pro_until: past })).toBe(false);
  });
});

describe("quota gate", () => {
  function canDownload(opts: { isPro: boolean; used: number; bonus: number; kind: "contract" | "template" }) {
    const limit = 1;
    if (opts.isPro) return true;
    if (opts.used < limit) return true;
    if (opts.kind === "contract" && opts.bonus > 0) return true;
    return false;
  }
  it("blocks free user past limit with no bonus", () => {
    expect(canDownload({ isPro: false, used: 1, bonus: 0, kind: "contract" })).toBe(false);
  });
  it("allows bonus contract", () => {
    expect(canDownload({ isPro: false, used: 1, bonus: 1, kind: "contract" })).toBe(true);
  });
  it("Pro is unlimited", () => {
    expect(canDownload({ isPro: true, used: 99, bonus: 0, kind: "contract" })).toBe(true);
  });
});
