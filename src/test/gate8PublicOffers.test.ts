import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ONE_TIME_PRODUCTS,
  ONE_TIME_PURCHASES_AVAILABLE,
  productPriceLabel,
} from "@/lib/products";

const read = (path: string) => readFileSync(path, "utf8");

describe("Gate 8 — публични оферти преди пускане", () => {
  it("пази точните канонични цени и fail-closed състоянието", () => {
    expect(ONE_TIME_PRODUCTS.map((product) => productPriceLabel(product.id))).toEqual([
      "2,99 €",
      "3,99 €",
      "7,99 €",
    ]);
    expect(ONE_TIME_PURCHASES_AVAILABLE).toBe(false);
  });

  it("разграничава безплатните действия от платената подробна проверка", () => {
    const analyze = read("src/pages/Analyze.tsx");
    expect(analyze).toContain("FREE_OFFER_RULE");
    expect(analyze).toContain('productPriceLabel("contract_check")');
    expect(analyze).not.toContain("една пълна проверка");
  });

  it("не показва недоказано уверение за GDPR на страницата с планове", () => {
    const plans = read("src/pages/Plans.tsx");
    expect(plans).not.toContain("GDPR съвместим");
    expect(plans).toContain("Условия и поверителност");
    expect(read("src/lib/seo/schemas.ts")).not.toContain("GDPR-compliant");
    expect(read("src/components/AuthGateModal.tsx")).not.toContain("· GDPR");
    expect(read("src/components/auth/InlineAuthDialog.tsx")).not.toContain("· GDPR");
  });

  it("не обещава качване от началната страница и основната навигация", () => {
    for (const path of [
      "src/components/Hero.tsx",
      "src/components/Header.tsx",
      "src/components/CTABand.tsx",
    ]) {
      const source = read(path);
      expect(source).not.toContain("Качете за проверка");
      expect(source).not.toContain("Качи за анализ");
      expect(source).not.toContain("Качете файл за проверка");
    }
  });
});