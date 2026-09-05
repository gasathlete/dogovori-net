import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  ENTRY_PACK_CONFIG,
  ENTRY_PACK_FEATURES,
  FREE_OFFER_ANON_HELPER,
  FREE_OFFER_RULE,
  FREE_OPS_ON_SIGNUP,
  FREE_OPS_PER_MONTH,
  FREE_OPS_SIGNUP_WINDOW_DAYS,
} from "@/lib/pricing";

const read = (p: string) => readFileSync(p, "utf-8");

describe("канонично правило за безплатните операции", () => {
  it("използва 5 / 30 дни / 2 месечно", () => {
    expect(FREE_OPS_ON_SIGNUP).toBe(5);
    expect(FREE_OPS_PER_MONTH).toBe(2);
    expect(FREE_OPS_SIGNUP_WINDOW_DAYS).toBe(30);
    expect(FREE_OFFER_RULE).toBe("5 операции през първите 30 дни, след това 2 месечно.");
  });

  it("анонимният helper пояснява, че операциите са към безплатния профил", () => {
    expect(FREE_OFFER_ANON_HELPER).toContain("Започнете без регистрация");
    expect(FREE_OFFER_ANON_HELPER).toContain("безплатен профил");
    expect(FREE_OFFER_ANON_HELPER).toContain(FREE_OFFER_RULE);
    expect(FREE_OFFER_ANON_HELPER).toContain("Без карта");
  });

  it("никъде не се обещава друг брой безплатни операции или стар текст", () => {
    const files = [
      "src/pages/Plans.tsx",
      "src/pages/Template.tsx",
      "src/pages/account/SubscriptionTab.tsx",
      "src/lib/planCategories.ts",
      "src/components/ProUpgradeDialog.tsx",
      "src/components/BetaDisclaimerModal.tsx",
      "src/components/AssistantPaywall.tsx",
      "src/components/AuthGateModal.tsx",
      "src/components/auth/InlineAuthDialog.tsx",
      "src/components/funnel/TrustGuaranteeBar.tsx",
      "src/components/paywall/FreeWelcomeDialog.tsx",
    ];
    const banned = [
      "5 операции при регистрация",
      "10 безпл",
      "5 операции + 2 всеки месец",
      "6 операции",
      "5 безплатни операции при регистрация",
    ];
    for (const file of files) {
      const src = read(file);
      for (const phrase of banned) {
        expect(src, `${file} съдържа „${phrase}“`).not.toContain(phrase);
      }
    }
  });
});

describe("еднократен входен пакет 2,90 €", () => {
  it("остава 5 операции за 2,90 € с ключ five_operations", () => {
    expect(ENTRY_PACK_CONFIG.ops).toBe(5);
    expect(ENTRY_PACK_CONFIG.eur).toBe(2.9);
    expect(ENTRY_PACK_CONFIG.priceId).toBe("five_operations");
  });

  it("списъкът с ползи е само за операции и изключва функции на планове", () => {
    const joined = ENTRY_PACK_FEATURES.join(" | ");
    expect(joined).toContain("+5 допълнителни операции");
    expect(joined).toContain("не изтичат");
    expect(joined).toContain("след включените безплатни операции");
    expect(joined).toContain("Не отключва функции от платените планове");
    for (const phrase of ["Без воден знак", "Предприемач", "неограничен"]) {
      expect(joined).not.toContain(phrase);
    }
  });

  it("paywall-ът за Стриктен документ описва 24 часа и 1 операция на теглене", () => {
    const src = read("src/components/wizard/StrictDocumentPaywall.tsx");
    expect(src).toContain("24 часа");
    expect(src).toContain("ползва по една операция");
    expect(src).not.toContain("неограничени сваляния");
    expect(src).not.toContain("0.40");
  });

  it("Общите условия описват пакета точно", () => {
    const src = read("src/pages/legal/Terms.tsx");
    expect(src).toContain("добавя 5 операции към профила");
    expect(src).toContain("не изтичат и не активират");
    expect(src).toContain("валиден 24 часа");
  });
});
