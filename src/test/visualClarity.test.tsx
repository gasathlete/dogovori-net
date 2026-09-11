/**
 * P0 Stage 2B3 — фокусирани регресии за визуалната ясност и йерархията.
 *
 * Проверява: единственото доминиращо действие в hero-а, реда на секциите на
 * началната страница, компактния път на документа, статично достъпните
 * продуктови факти, разделението демонстрация/реални данни и липсата на
 * забранени фрази в приоритетните публични повърхности.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { DocumentPathStrip } from "@/components/home/DocumentPathStrip";
import { MOBILE_NAV_ITEMS } from "@/components/MobileBottomNav";
import { ONE_TIME_PRODUCTS, productPriceLabel } from "@/lib/products";
import { PREVIEW_NOTE, PREVIEW_TITLE } from "@/components/products/previewData";

vi.mock("@/lib/funnel", () => ({
  trackFunnelEvent: vi.fn(() => true),
  markFunnelStep: vi.fn(),
}));

const read = (f: string) => readFileSync(f, "utf8");

const BANNED = [
  "воден процес",
  "готови за поръчки",
  "скрити рискове",
  "без халюцинации",
  "революционен",
  "спестихте",
];

const PUBLIC_SURFACES = [
  "src/components/Hero.tsx",
  "src/components/home/HomeSections.tsx",
  "src/components/home/ProductsSection.tsx",
  "src/components/home/DocumentPathStrip.tsx",
  "src/pages/Products.tsx",
  "src/pages/ProductDetail.tsx",
  "src/components/products/ProductComparisonList.tsx",
  "src/components/products/ProductShowcaseCarousel.tsx",
];

describe("йерархия на началната страница", () => {
  it("hero-ът има точно едно доминиращо златно действие", () => {
    const hero = read("src/components/Hero.tsx");
    expect(hero.match(/btn-gold/g)?.length).toBe(1);
    expect(hero).toContain('data-testid="hero-primary-cta"');
    expect(hero).toContain("Започнете безплатно");
    expect(hero).toContain("HeroProductRail");
  });

  it("редът на секциите е доверие → продукти → път на документа → DogovaryAI", () => {
    const src = read("src/components/home/HomeSections.tsx");
    const order = ["SocialProofStrip />", "ProductsSection />", "DocumentPathStrip />", "DogovaryAIShowcase />"];
    const positions = order.map((token) => src.indexOf(token));
    expect(positions.every((p) => p > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("пътят на документа е компактен: три стъпки, едно тихо действие", () => {
    render(
      <MemoryRouter>
        <DocumentPathStrip />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("document-path-strip")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("/catalog");
    expect(read("src/components/home/DocumentPathStrip.tsx")).not.toContain("btn-gold");
  });
});

describe("продуктови факти без взаимодействие", () => {
  it("трите продукта и точните цени остават в изходния код на списъка", () => {
    const list = read("src/components/products/ProductComparisonList.tsx");
    expect(list).toContain("ONE_TIME_PRODUCTS");
    const labels = ONE_TIME_PRODUCTS.map((p) => productPriceLabel(p.id));
    expect(labels).toEqual(["2,99 €", "3,99 €", "7,99 €"]);
  });

  it("публичната витрина е ясно означена като пример", () => {
    expect(PREVIEW_TITLE).toContain("Пример");
    expect(PREVIEW_NOTE).toContain("Не е Вашият документ");
  });

  it("платените изгледи не внасят публични демонстрационни данни", () => {
    for (const file of [
      "src/pages/ProductResult.tsx",
      "src/components/product-result/ReviewResult.tsx",
      "src/components/product-result/CorrectionWorkspace.tsx",
      "src/components/product-result/NegotiationWorkspace.tsx",
    ]) {
      const src = read(file);
      expect(src).not.toContain("products/previewData");
      expect(src).not.toContain("productResultFixtures");
    }
  });
});

describe("мобилна навигация и език", () => {
  it("долната навигация е петте изхода с DogovaryAI", () => {
    expect(MOBILE_NAV_ITEMS).toHaveLength(5);
    expect(MOBILE_NAV_ITEMS.map((i) => i.label)).toContain("DogovaryAI");
  });

  it("приоритетните публични повърхности не съдържат забранени фрази", () => {
    for (const file of PUBLIC_SURFACES) {
      const src = read(file).toLowerCase();
      for (const phrase of BANNED) {
        expect(src.includes(phrase)).toBe(false);
      }
    }
  });
});
