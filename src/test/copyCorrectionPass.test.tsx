/**
 * Regression за хирургичния copy/достоверност pass:
 * вярна сметка в примерния резултат, учтив език, липса на AI жаргон,
 * каноничните цени и намаления, ограниченията в продуктов режим.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { CHECK_CONCLUSION, CHECK_FINDINGS, PREVIEW_TITLE, PREVIEW_NOTE } from "@/components/products/previewData";
import { ONE_TIME_PRODUCTS, productPriceLabel, productPreviousPriceLabel, productDiscountLabel } from "@/lib/products";

const read = (p: string) => readFileSync(p, "utf8");

const PRIORITY_FILES = [
  "src/components/Logo.tsx",
  "src/components/Hero.tsx",
  "src/components/home/HomeSections.tsx",
  "src/components/home/PrimaryChoice.tsx",
  "src/components/home/ChoiceFlow.tsx",
  "src/components/home/DogovaryAIShowcase.tsx",
  "src/components/products/HeroProductRail.tsx",
  "src/components/products/ProductCard.tsx",
  "src/pages/Products.tsx",
  "src/pages/ProductDetail.tsx",
  "src/pages/ProductCheckout.tsx",
  "src/pages/Analyze.tsx",
];

const BANNED = [
  "воден процес",
  "готови за поръчки",
  "архитект",
  "powered by",
  "скор на риска",
  "договорна карта",
  "качваш",
  "искаш",
  "твоя договор",
  "твой документ",
];

describe("достоверност на примерния резултат", () => {
  it("неустойката при 24 000 € и 0,5% на ден за 20 дни е 2 400 €", () => {
    const finding = CHECK_FINDINGS[0];
    expect(finding.consequence).toContain("2 400 €");
    expect(finding.consequence).not.toContain("10 000 €");
    expect(CHECK_CONCLUSION).toContain("2 400 €");
    expect(CHECK_CONCLUSION).toMatch(/таван/);
    // Точната аритметика на видимия пример.
    expect(Math.round(24000 * 0.005 * 20)).toBe(2400);
  });

  it("примерът остава ясно означен като демонстрация", () => {
    expect(PREVIEW_TITLE).toBe("Примерен резултат");
    expect(PREVIEW_NOTE).toContain("Не е Вашият документ");
  });
});

describe("клиентският текст е учтив и без AI жаргон", () => {
  for (const file of PRIORITY_FILES) {
    it(`${file} не съдържа забранени фрази`, () => {
      const src = read(file).toLowerCase();
      for (const phrase of BANNED) {
        expect(src, `${file}: ${phrase}`).not.toContain(phrase);
      }
    });
  }

  it("логото е само Dogovori.net, без слоган и партньорски надпис", () => {
    const src = read("src/components/Logo.tsx");
    expect(src).toContain("Dogovori");
    expect(src).not.toMatch(/Архитект|IM Development/i);
  });

  it("началната страница е един responsive вариант", () => {
    expect(read("src/components/home/HomeSections.tsx")).toContain('data-home-variant="responsive"');
  });

  it("ChoiceFlow ползва учтиви глаголи и не рекламира OCR", () => {
    const src = read("src/components/home/ChoiceFlow.tsx");
    expect(src).toContain("Оценка на риска");
    expect(src).toMatch(/Качвате документа/);
    expect(src).not.toMatch(/OCR|снимка/i);
  });

  it("DogovaryAI отговаря условно, не категорично", () => {
    const src = read("src/components/home/DogovaryAIShowcase.tsx");
    expect(src).toMatch(/може да Ви даде основание/);
    expect(src).toMatch(/клауз/i);
    expect(src).not.toMatch(/Ви дава основание да развалите/);
  });
});

describe("цени и продуктов режим", () => {
  it("трите продукта пазят каноничните цени и намаления", () => {
    const expected = {
      contract_check: ["2,99 €", "3,99 €", "−25%"],
      contract_improve: ["3,99 €", "4,99 €", "−20%"],
      negotiation_package: ["7,99 €", "9,99 €", "−20%"],
    } as const;
    for (const p of ONE_TIME_PRODUCTS) {
      const [now, prev, disc] = expected[p.id as keyof typeof expected];
      expect(productPriceLabel(p.id)).toBe(now);
      expect(productPreviousPriceLabel(p.id)).toBe(prev);
      expect(productDiscountLabel(p.id)).toBe(disc);
    }
  });

  it("checkout показва цената през ProductPrice", () => {
    expect(read("src/pages/ProductCheckout.tsx")).toContain("<ProductPrice");
  });

  it("продуктовият режим на /analiz показва точното платено ограничение", () => {
    const src = read("src/pages/Analyze.tsx");
    expect(src).toContain("PRODUCT_ACCEPTED_INPUT");
    expect(src).toContain("PRODUCT_MAX_SOURCE_CHARS");
    expect(src).toMatch(/не съкращаваме документа тихо/);
    // Старите OCR/3 страници/10 MB твърдения са само в общия режим.
    expect(src).toMatch(/productCopy\s*\?/);
  });

  it("Products SEO покрива трите намерения", () => {
    const src = read("src/pages/Products.tsx");
    expect(src).toMatch(/проверка на договор/i);
    expect(src).toMatch(/поправка/i);
    expect(src).toMatch(/преговори/i);
  });
});
