import { describe, it, expect } from "vitest";
import {
  PRICING_PLANS,
  ENTRY_PACK_CONFIG,
  ENTRY_PACK_AMOUNT_CENTS,
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
    expect(PRICING_PLANS.team.priceIds.yearly).toBe("team_seat_yearly");
  });

  it("форматира EUR по български стандарт", () => {
    expect(fmtEur(12.9)).toBe("12,90 €");
    expect(fmtEur(129)).toBe("129,00 €");
    expect(fmtEur(2.9)).toBe("2,90 €");
  });

  it("генерира коректни етикети", () => {
    expect(monthlyLabel("entrepreneur")).toBe("19,90 €/мес");
    expect(yearlyLabel("professional")).toBe("129,00 €/год");
    expect(yearlyLabel("team")).toBe("109,00 €/място/год");
    expect(opsLabel("professional")).toBe("50 действия");
    expect(opsLabel("team")).toBe("100 действия на място");
    expect(planSummary("professional")).toBe("Професионалист — 12,90 €/мес (50 действия)");
    expect(planSummary("entrepreneur")).toBe("Предприемач — 19,90 €/мес (100 действия)");
    expect(teamSummary()).toBe("Екип — 109,00 €/място/год (мин. 3 места = 327,00 €/год)");
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

  it("входният пакет е един канoничен еднократен продукт", () => {
    expect(ENTRY_PACK_CONFIG.priceId).toBe("five_operations");
    expect(ENTRY_PACK_CONFIG.ops).toBe(5);
    expect(ENTRY_PACK_CONFIG.eur).toBe(2.9);
    expect(ENTRY_PACK_AMOUNT_CENTS).toBe(290);
    // Stripe минимум за EUR карта е 0,50 € — входният пакет трябва да е над него.
    expect(ENTRY_PACK_AMOUNT_CENTS).toBeGreaterThanOrEqual(50);
    // Входният пакет НЕ е top-up пакет: различен lookup key.
    expect(TOPUP_PACK_CONFIG.map((p) => p.priceId)).not.toContain(
      ENTRY_PACK_CONFIG.priceId as string,
    );
    expect(Object.isFrozen(ENTRY_PACK_CONFIG)).toBe(true);
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
