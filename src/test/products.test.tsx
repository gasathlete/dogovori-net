/**
 * Продуктовата витрина — единствен източник на истина, IA, CTA маршрути,
 * allowlist на ?product=, персона логика и достъпност/reduced motion.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { readFileSync } from "node:fs";
import {
  LEGACY_PRODUCT_SLUG_REDIRECTS,
  ONE_TIME_PRODUCTS,
  ONE_TIME_PURCHASES_AVAILABLE,
  ONE_TIME_TERMS,
  getProduct,
  isOneTimeProductId,
  legacyProductRedirect,
  parseProductParam,
  productPath,
  productDiscountLabel,
  productDiscountPercent,
  productPreviousPriceLabel,
  productPriceLabel,
} from "@/lib/products";
import { ProductCards } from "@/components/products/ProductCards";
import { ProductsSection } from "@/components/home/ProductsSection";

vi.mock("@/lib/funnel", () => ({
  trackFunnelEvent: vi.fn(() => true),
  markFunnelStep: vi.fn(),
}));
import { trackFunnelEvent } from "@/lib/funnel";

const wrap = (ui: React.ReactNode) => (
  <HelmetProvider>
    <MemoryRouter>{ui}</MemoryRouter>
  </HelmetProvider>
);

describe("продуктова конфигурация — единствен източник", () => {
  it("има точно трите очаквани продукта с точните цени", () => {
    expect(ONE_TIME_PRODUCTS.map((p) => [p.id, p.priceEur])).toEqual([
      ["contract_check", 2.99],
      ["contract_improve", 3.99],
      ["negotiation_package", 7.99],
    ]);
    expect(productPriceLabel("contract_check")).toBe("2,99 €");
    expect(productPriceLabel("contract_improve")).toBe("3,99 €");
    expect(productPriceLabel("negotiation_package")).toBe("7,99 €");
  });

  it("имена, значки и CTA маршрути са каноничните", () => {
    expect(getProduct("contract_check").name).toBe(
      "Подробна проверка преди подпис",
    );
    expect(getProduct("contract_check").ctaLabel).toBe("Проверете документ");
    expect(getProduct("contract_check").ctaHref).toBe(
      "/produkti/proverka-predi-podpis/start",
    );
    expect(getProduct("contract_improve").badge).toBe("Най-предпочитан");
    expect(getProduct("contract_improve").ctaHref).toBe(
      "/produkti/popravi-dokument/start",
    );
    const pkg = getProduct("negotiation_package");
    expect(pkg.name).toBe("Пълен пакет за преговори");
    expect(pkg.badge).toBe("Пълен пакет");
    expect(pkg.ctaLabel).toBe("Подгответе документа за преговори");
    expect(pkg.slug).toBe("palen-paket-pregovori");
  });

  it("конфигурацията е immutable", () => {
    expect(Object.isFrozen(ONE_TIME_PRODUCTS)).toBe(true);
    for (const p of ONE_TIME_PRODUCTS) expect(Object.isFrozen(p)).toBe(true);
  });

  it("условията са изрични и еднакви", () => {
    expect(ONE_TIME_TERMS).toBe(
      "Еднократно · с включен ДДС · без автоматичен абонамент",
    );
  });

  it("не описва продуктите като операции/кредити и не води с AI", () => {
    // Проверява се витринното копие; задължителните правни уточнения в
    // страниците (page.faq) съзнателно споменават адвокат.
    const text = ONE_TIME_PRODUCTS.map(
      (p) => `${p.name} ${p.promise} ${p.outcomes.join(" ")} ${p.ctaLabel}`,
    )
      .join(" ")
      .toLowerCase();
    for (const bad of ["кредит", "операци", "безопасно за подписване", "адвокат"]) {
      expect(text).not.toContain(bad);
    }
    for (const p of ONE_TIME_PRODUCTS) {
      expect(p.promise.toLowerCase().startsWith("ai")).toBe(false);
    }
  });

  it("не съдържа цена като литерал в компоненти/страници", () => {
    const files = [
      "src/components/products/ProductCard.tsx",
      "src/components/home/ProductsSection.tsx",
      "src/pages/Products.tsx",
    ];
    for (const f of files) {
      expect(/\d{1,3}[.,]\d{2}\s?€/.test(readFileSync(f, "utf8"))).toBe(false);
    }
  });
});

describe("allowlist на ?product=", () => {
  it("приема само познати стойности", () => {
    expect(parseProductParam("contract_check")).toBe("contract_check");
    expect(parseProductParam(" contract_improve ")).toBe("contract_improve");
    expect(parseProductParam("negotiation_package")).toBe(
      "negotiation_package",
    );
    expect(parseProductParam("business_contract_map")).toBeNull();
  });

  it("непознати/липсващи стойности падат безопасно", () => {
    for (const bad of ["", "x", "constructor", "toString", null, undefined]) {
      expect(parseProductParam(bad as string | null)).toBeNull();
    }
    expect(isOneTimeProductId("constructor")).toBe(false);
  });
});

describe("витрина — паритет между началната страница и /produkti", () => {
  beforeEach(() => vi.clearAllMocks());

  it("началната секция носи точното заглавие и витрината с трите продукта", () => {
    render(wrap(<ProductsSection />));
    expect(
      screen.getByRole("heading", { name: "Разгледайте нашите услуги" }),
    ).toBeInTheDocument();
    for (const p of ONE_TIME_PRODUCTS) {
      expect(screen.getByTestId(`catalog-product-${p.id}`)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: p.name })).toHaveAttribute(
        "href",
        productPath(p),
      );
    }
    expect(
      screen.getByTestId(`product-price-${ONE_TIME_PRODUCTS[0].id}`),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Вижте подробно всеки продукт/ }),
    ).toHaveAttribute("href", "/produkti");
  });

  it("CTA-тата сочат към самостоятелните продуктови страници", () => {
    render(wrap(<ProductCards variant="full" source="produkti" />));
    for (const p of ONE_TIME_PRODUCTS) {
      const card = screen.getByRole("article", { name: p.name });
      expect(within(card).getByRole("link", {
        name: ONE_TIME_PURCHASES_AVAILABLE ? p.ctaLabel : "Вижте продукта",
      })).toHaveAttribute("href", productPath(p));
      expect(screen.getByRole("link", { name: p.name })).toHaveAttribute(
        "href",
        productPath(p),
      );
    }
  });

  it("компактният вариант показва същите продукти, старата и новата цена", () => {
    render(wrap(<ProductCards variant="compact" source="home" />));
    for (const p of ONE_TIME_PRODUCTS) {
      const block = screen.getByTestId(`product-price-${p.id}`);
      expect(block).toHaveTextContent(productPriceLabel(p.id));
      expect(block).toHaveTextContent(productPreviousPriceLabel(p.id));
      expect(block).toHaveTextContent(productDiscountLabel(p.id));
      const card = screen.getByRole("article", { name: p.name });
      expect(within(card).getByRole("link", {
        name: ONE_TIME_PURCHASES_AVAILABLE ? p.ctaLabel : "Вижте продукта",
      })).toBeInTheDocument();
    }
  });

  it("изпраща факта за видяна секция и факта за избор при клик", async () => {
    render(wrap(<ProductCards variant="compact" source="home" />));
    expect(trackFunnelEvent).toHaveBeenCalledWith(
      "product_section_viewed",
      expect.objectContaining({ source: "home", products: 3 }),
      expect.objectContaining({ dedupKey: expect.any(String) }),
    );
    vi.mocked(trackFunnelEvent).mockClear();
    const firstCard = screen.getByRole("article", { name: ONE_TIME_PRODUCTS[0].name });
    await userEvent.click(within(firstCard).getByRole("link", {
      name: ONE_TIME_PURCHASES_AVAILABLE ? "Проверете документ" : "Вижте продукта",
    }));
    expect(trackFunnelEvent).toHaveBeenCalledWith(
      ONE_TIME_PURCHASES_AVAILABLE ? "product_selected" : "product_details_opened",
      expect.objectContaining({ product: "contract_check", source: "home" }),
    );
    // Никое събитие не твърди покупка/плащане.
    for (const call of vi.mocked(trackFunnelEvent).mock.calls) {
      expect(String(call[0])).not.toMatch(/purchase|paid|payment|success/);
    }
  });

  it("всяка пълна карта носи примерен резултат, обозначен като демонстрация", () => {
    render(wrap(<ProductCards variant="full" source="produkti" />));
    const previews = screen.getAllByTestId("product-result-preview");
    expect(previews).toHaveLength(3);
    for (const preview of previews) {
      expect(preview).toHaveTextContent("Примерен резултат");
      expect(preview).toHaveTextContent("Не е Вашият документ.");
      expect((preview.textContent ?? "").length).toBeGreaterThan(120);
    }
  });
});

describe("честно намаление — стара цена, нова цена, точен процент", () => {
  it("предишните цени са каноничните, подадени от собственика", () => {
    expect(
      ONE_TIME_PRODUCTS.map((p) => [p.id, p.previousPriceEur, p.priceEur]),
    ).toEqual([
      ["contract_check", 3.99, 2.99],
      ["contract_improve", 4.99, 3.99],
      ["negotiation_package", 9.99, 7.99],
    ]);
  });

  it("процентът е изчислен, не написан на ръка", () => {
    expect(productDiscountPercent("contract_check")).toBe(25);
    expect(productDiscountPercent("contract_improve")).toBe(20);
    expect(productDiscountPercent("negotiation_package")).toBe(20);
    expect(productDiscountLabel("contract_check")).toBe("−25%");
  });

  it("никой компонент не пише процент или стара цена като литерал", () => {
    for (const file of [
      "src/components/products/ProductCard.tsx",
      "src/components/products/HeroProductRail.tsx",
      "src/pages/ProductDetail.tsx",
      "src/pages/ProductCheckout.tsx",
    ]) {
      const text = readFileSync(file, "utf8");
      for (const literal of ["−25%", "−20%", "3,99", "4,99", "9,99"]) {
        expect(text, file).not.toContain(literal);
      }
    }
  });

  it("не обещава срок, брояч или измислена икономия", () => {
    render(wrap(<ProductCards variant="full" source="produkti" />));
    const text = document.body.textContent ?? "";
    for (const banned of [
      "спестявате",
      "спестихте",
      "изтича",
      "остават",
      "последен шанс",
      "само днес",
    ]) {
      expect(text).not.toContain(banned);
    }
  });
});

describe("изтеглената бизнес карта", () => {
  it("не съществува в каноничния модел", () => {
    expect(ONE_TIME_PRODUCTS.map((p) => p.id)).not.toContain(
      "business_contract_map",
    );
    expect(isOneTimeProductId("business_contract_map")).toBe(false);
    expect(ONE_TIME_PRODUCTS.map((p) => p.slug)).not.toContain(
      "biznes-karta-dokumenti",
    );
  });

  it("старите адреси водят към пълния пакет", () => {
    expect(legacyProductRedirect("biznes-karta")).toBe(
      "/produkti/palen-paket-pregovori",
    );
    expect(legacyProductRedirect("biznes-karta-dokumenti")).toBe(
      "/produkti/palen-paket-pregovori",
    );
    expect(legacyProductRedirect("proverka-predi-podpis")).toBeNull();
    expect(legacyProductRedirect(undefined)).toBeNull();
    expect(legacyProductRedirect("constructor")).toBeNull();
    expect(Object.isFrozen(LEGACY_PRODUCT_SLUG_REDIRECTS)).toBe(true);
  });

  it("никъде в продуктовия слой не остават стари цени на бизнес картата", () => {
    const text = readFileSync("src/lib/products.ts", "utf8");
    for (const stale of ["6,99", "6.99"]) {
      expect(text).not.toContain(stale);
    }
  });
});

describe("навигация — Продукти е първа", () => {
  const header = readFileSync("src/components/Header.tsx", "utf8");

  it("десктоп навигацията започва с /produkti", () => {
    const nav = header.slice(header.indexOf("const NAV = ["));
    const first = nav.slice(0, nav.indexOf("];"));
    expect(first).toMatch(/\{ to: "\/produkti", label: "Продукти" \}/);
    expect(first.indexOf("/produkti")).toBeLessThan(first.indexOf("/build"));
  });

  it("мобилното меню започва с продуктите", () => {
    const groups = header.slice(header.indexOf("const MOBILE_PRIMARY"));
    const body = groups.slice(0, groups.indexOf("\n];"));
    expect(body.indexOf("/produkti")).toBeGreaterThan(-1);
    expect(body.indexOf("/produkti")).toBeLessThan(body.indexOf("/build"));
  });

  it("съществуващите маршрути не са премахнати", () => {
    for (const route of ["/build", "/catalog", "/blog", "/analiz", "/komplekti", "/plans"]) {
      expect(header).toContain(route);
    }
  });
});
