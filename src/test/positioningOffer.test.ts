/**
 * Stage 2c1 — интегритет на позиционирането и на офертата.
 *
 * Тестовете пазят две неща едновременно:
 *  1) Копието да не обещава време за изпълнение и да не води с модели/„операции“.
 *  2) Цените, lookup ключовете и извикванията към плащането да останат непокътнати.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ENTRY_PACK_CONFIG,
  PRICING_PLANS,
  TOPUP_PACK_CONFIG,
} from "@/lib/pricing";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const CONVERSION_FILES = [
  "src/lib/audience.ts",
  "src/components/Hero.tsx",
  "src/components/home/PrimaryChoice.tsx",
  "src/components/home/ChoiceFlow.tsx",
  "src/components/PlatformCapabilities.tsx",
  "src/components/home/DogovaryAIShowcase.tsx",
  "src/pages/Index.tsx",
];

describe("позициониране на началната страница", () => {
  it("не обещава конкретно време за изготвяне", () => {
    for (const f of CONVERSION_FILES) {
      const src = read(f);
      expect(src, f).not.toContain("2 минути");
      expect(src, f).not.toMatch(/\d+\s?(сек|мин)\b/);
    }
  });

  it("не води с модели или с „операции“ в основното копие", () => {
    for (const f of CONVERSION_FILES) {
      const src = read(f);
      expect(src, f).not.toContain("GPT-5");
      expect(src, f).not.toContain("операции");
    }
  });

  it("H1-ите описват работния процес, не замяна на адвокат", () => {
    const src = read("src/lib/audience.ts");
    expect(src).toContain("Договорите на фирмата — от чернова до");
    expect(src).toContain("От ясни условия до готов");
    expect(src).not.toContain("без адвокат за всеки документ");
  });

  it("DogovaryAI е формулиран внимателно и е след доверието на страницата", () => {
    const showcase = read("src/components/home/DogovaryAIShowcase.tsx");
    expect(showcase).not.toContain("отговаря като юрист");
    expect(showcase).toContain("Не замества индивидуална правна консултация");

    const index = read("src/pages/Index.tsx");
    expect(index.indexOf("<DogovaryAIShowcase />")).toBeGreaterThan(
      index.indexOf("<ComplianceSection />"),
    );
    expect(index.indexOf("<DogovaryAIShowcase />")).toBeLessThan(index.indexOf("<FAQ />"));
  });
});

describe("оферта: еднократно срещу абонамент", () => {
  const plans = read("src/pages/Plans.tsx");

  it("страницата предлага и двата режима на плащане", () => {
    expect(plans).toContain("Платете според начина,");
    expect(plans).toContain("Конкретен документ");
    expect(plans).toContain("Редовна договорна работа");
    expect(plans).toContain('href="#plan-cards"');
  });

  it("има точно една реализация на CTA за входния пакет", () => {
    expect(plans.match(/entryPackCtaHref\(/g) ?? []).toHaveLength(1);
    expect(plans.match(/<EntryPackCta /g) ?? []).toHaveLength(1);
    expect(plans.match(/source: "public_entry_pack"/g) ?? []).toHaveLength(1);
    // CTA-то е само линк — без собствена рамка вътре в картата за еднократно плащане.
    expect(plans).not.toContain("border-2 border-brand/40 bg-brand/[0.04]");
    expect(plans.match(/Конкретен документ/g) ?? []).toHaveLength(1);
  });

  it("периодът на фактуриране е втори избор — в секцията с абонаментите", () => {
    expect(plans.match(/<BillingToggle /g) ?? []).toHaveLength(1);
    expect(plans.match(/role="tablist"/g) ?? []).toHaveLength(1);
    expect(plans.indexOf("<BillingToggle ")).toBeGreaterThan(
      plans.indexOf('id="purchase-modes-title"'),
    );
    expect(plans.indexOf("<BillingToggle ")).toBeGreaterThan(plans.indexOf('id="plan-cards"'));
    expect(plans.indexOf("<BillingToggle ")).toBeLessThan(plans.indexOf("PLAN_ICON[plan.id]"));
    expect(plans).toContain('aria-label="Период на фактуриране"');
  });

  it("измерва избора на режим на плащане със затворени стойности", () => {
    expect(plans).toContain('trackEvent("plans_purchase_mode_selected", { mode: "one_time"');
    expect(plans).toContain(
      'trackEvent("plans_purchase_mode_selected", { mode: "subscription", audience })',
    );
  });

  it("не съдържа недоказуеми твърдения и не води с фиксирана икономия", () => {
    for (const phrase of [
      "90 € и 3 дни",
      "струва повече от годишен абонамент",
      "най-честата причина",
      "Операциите се изразходват",
      "roiSubtitle",
    ]) {
      expect(plans, phrase).not.toContain(phrase);
    }
    const banner = read("src/components/funnel/RoiSavingsBanner.tsx");
    expect(banner).not.toContain("Спести над");
    expect(banner).not.toContain("изплаща от");
    expect(banner).not.toContain("1 операция");
    expect(banner).toContain("Сравнението е илюстративно");
  });

  it("копието за сегментите е коректно", () => {
    const aud = read("src/lib/audience.ts");
    expect(aud).toContain("За свободна практика");
    expect(aud).not.toContain("За на свободна практика");
    expect(aud).not.toContain('ctaExample: "\\n"');
    expect(aud).toContain("Абонаментът е за фирми");
  });


  it("помощта по обем е под избора и под абонаментните карти", () => {
    expect(plans.indexOf("<PlanScaleSlider")).toBeGreaterThan(
      plans.indexOf('id="purchase-modes-title"'),
    );
    expect(plans.indexOf("<PlanScaleSlider")).toBeGreaterThan(plans.indexOf('id="plan-cards"'));
  });

  it("SEO описанието посочва и еднократната цена, и абонамента", () => {
    expect(plans).toContain("2,90 € еднократно");
    expect(plans).toContain("12,90 €/мес");
  });
});

describe("цените и плащането остават непокътнати", () => {
  it("цени и капацитети", () => {
    expect(PRICING_PLANS.professional.monthly).toBe(12.9);
    expect(PRICING_PLANS.professional.yearly).toBe(129);
    expect(PRICING_PLANS.entrepreneur.monthly).toBe(19.9);
    expect(PRICING_PLANS.entrepreneur.yearly).toBe(199);
    expect(PRICING_PLANS.team.yearly).toBe(109);
    expect(PRICING_PLANS.team.seatMin).toBe(3);
    expect(PRICING_PLANS.professional.opsPerMonth).toBe(50);
    expect(PRICING_PLANS.entrepreneur.opsPerMonth).toBe(100);
  });

  it("lookup ключове и top-up пакети", () => {
    expect(ENTRY_PACK_CONFIG.priceId).toBe("five_operations");
    expect(ENTRY_PACK_CONFIG.ops).toBe(5);
    expect(ENTRY_PACK_CONFIG.eur).toBe(2.9);
    expect(TOPUP_PACK_CONFIG.map((p) => [p.ops, p.eur])).toEqual([
      [5, 2.9],
      [20, 5.4],
      [50, 12.9],
      [100, 23.9],
    ]);
  });

  it("checkout извикванията в /plans и в профила не са променени", () => {
    const plansSrc = read("src/pages/Plans.tsx");
    expect(plansSrc).toContain("/account?tab=subscription&plan=${planId}&billing=${billing}&promo=SEPT20");
    const tab = read("src/pages/account/SubscriptionTab.tsx");
    for (const key of [
      "professional_monthly",
      "professional_yearly",
      "entrepreneur_monthly",
      "entrepreneur_yearly",
    ]) {
      expect(tab, key).toContain(key);
    }
    expect(tab).toContain("setCheckoutPrice(ENTRY_PACK_CONFIG.priceId)");
  });
});
