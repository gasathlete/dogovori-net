import { describe, it, expect } from "vitest";
import {
  PRICING_PLANS,
  STRICT_UNLOCK_EUR,
  TOPUP_PACK_CONFIG,
  fmtEur,
  monthlyLabel,
  opsLabel,
  perOpLabel,
  planSummary,
  teamMinYearlyTotal,
  teamSummary,
  yearlyLabel,
} from "@/lib/pricing";

describe("pricing config — канонични имена и стойности", () => {
  it("имената съвпадат с публичните български названия", () => {
    expect(PRICING_PLANS.free.name).toBe("Безплатен");
    expect(PRICING_PLANS.professional.name).toBe("Професионалист");
    expect(PRICING_PLANS.entrepreneur.name).toBe("Предприемач");
    expect(PRICING_PLANS.team.name).toBe("Екип");
  });

  it("цените отговарят на таблицата plans", () => {
    expect(PRICING_PLANS.professional.monthly).toBe(12.9);
    expect(PRICING_PLANS.professional.yearly).toBe(129);
    expect(PRICING_PLANS.professional.opsPerMonth).toBe(50);
    expect(PRICING_PLANS.entrepreneur.monthly).toBe(19.9);
    expect(PRICING_PLANS.entrepreneur.yearly).toBe(199);
    expect(PRICING_PLANS.entrepreneur.opsPerMonth).toBe(100);
    expect(PRICING_PLANS.team.monthly).toBeNull();
    expect(PRICING_PLANS.team.yearly).toBe(109);
    expect(PRICING_PLANS.team.seatMin).toBe(3);
    expect(teamMinYearlyTotal()).toBe(327);
    expect(STRICT_UNLOCK_EUR).toBe(0.4);
  });

  it("форматира EUR по български стандарт", () => {
    expect(fmtEur(12.9)).toBe("12,90 €");
    expect(fmtEur(129)).toBe("129 €");
    expect(fmtEur(0.4)).toBe("0,40 €");
  });

  it("генерира коректни етикети", () => {
    expect(monthlyLabel("entrepreneur")).toBe("19,90 €/мес");
    expect(yearlyLabel("professional")).toBe("129 €/год");
    expect(yearlyLabel("team")).toBe("109 €/място/год");
    expect(opsLabel("professional")).toBe("50 операции");
    expect(opsLabel("team")).toBe("100 операции на място");
    expect(planSummary("professional")).toBe("Професионалист — 12,90 €/мес (50 операции)");
    expect(planSummary("entrepreneur")).toBe("Предприемач — 19,90 €/мес (100 операции)");
    expect(teamSummary()).toBe("Екип — 109 €/място/год (мин. 3 места = 327 €/год)");
  });

  it("top-up пакетите са актуалните 4", () => {
    expect(TOPUP_PACK_CONFIG.map((p) => [p.ops, p.eur])).toEqual([
      [5, 2.9],
      [20, 5.4],
      [50, 12.9],
      [100, 23.9],
    ]);
    expect(perOpLabel(TOPUP_PACK_CONFIG[0])).toBe("0,58 €/оп.");
  });

  it("не съдържа изоставени цени/валути", () => {
    const deprecatedPrices = [9.9, 7.9, 23.7, 32.7, 10.9, 1.9];
    const used = [
      ...Object.values(PRICING_PLANS).flatMap((p) => [p.monthly, p.yearly]),
      ...TOPUP_PACK_CONFIG.map((p) => p.eur),
    ].filter((v): v is number => typeof v === "number");
    for (const bad of deprecatedPrices) expect(used).not.toContain(bad);

    const serialized = JSON.stringify(PRICING_PLANS) + JSON.stringify(TOPUP_PACK_CONFIG);
    for (const bad of ["лв", "BGN", "лева"]) {
      expect(serialized.includes(bad)).toBe(false);
    }
  });
});
