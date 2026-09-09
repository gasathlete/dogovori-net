/**
 * Продуктовата витрина — единствен източник на истина, IA, CTA маршрути,
 * allowlist на ?product=, персона логика и достъпност/reduced motion.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { readFileSync } from "node:fs";
import {
  ONE_TIME_PRODUCTS,
  ONE_TIME_TERMS,
  PERSONA_STORAGE_KEY,
  getProduct,
  isOneTimeProductId,
  loadBusinessPersona,
  parseProductParam,
  personaNextStepHref,
  productPriceLabel,
  recommendForPersona,
  saveBusinessPersona,
} from "@/lib/products";
import { ProductCards } from "@/components/products/ProductCards";
import { ProductsSection } from "@/components/home/ProductsSection";
import BusinessCardIntake from "@/pages/BusinessCardIntake";

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
      ["business_contract_map", 6.99],
    ]);
    expect(productPriceLabel("contract_check")).toBe("2,99 €");
    expect(productPriceLabel("contract_improve")).toBe("3,99 €");
    expect(productPriceLabel("business_contract_map")).toBe("6,99 €");
  });

  it("имена, значки и CTA маршрути са каноничните", () => {
    expect(getProduct("contract_check").name).toBe("Проверка преди подпис");
    expect(getProduct("contract_check").ctaLabel).toBe("Провери договора");
    expect(getProduct("contract_check").ctaHref).toBe(
      "/analiz?product=contract_check",
    );
    expect(getProduct("contract_improve").badge).toBe("Най-предпочитан");
    expect(getProduct("contract_improve").ctaHref).toBe(
      "/analiz?product=contract_improve",
    );
    expect(getProduct("business_contract_map").badge).toBe("За бизнес");
    expect(getProduct("business_contract_map").ctaHref).toBe(
      "/produkti/biznes-karta",
    );
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
    const text = JSON.stringify(ONE_TIME_PRODUCTS).toLowerCase();
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
      "src/pages/BusinessCardIntake.tsx",
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
    expect(parseProductParam("business_contract_map")).toBe(
      "business_contract_map",
    );
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

  it("началната секция носи точното заглавие и същите продукти", () => {
    render(wrap(<ProductsSection />));
    expect(
      screen.getByRole("heading", { name: "Разгледайте нашите продукти" }),
    ).toBeInTheDocument();
    for (const p of ONE_TIME_PRODUCTS) {
      expect(screen.getByRole("heading", { name: p.name })).toBeInTheDocument();
    }
    expect(screen.getAllByText(ONE_TIME_TERMS)).toHaveLength(
      ONE_TIME_PRODUCTS.length,
    );
  });

  it("CTA-тата сочат към каноничните маршрути", () => {
    render(wrap(<ProductCards variant="full" source="produkti" />));
    for (const p of ONE_TIME_PRODUCTS) {
      expect(screen.getByRole("link", { name: p.ctaLabel })).toHaveAttribute(
        "href",
        p.ctaHref,
      );
    }
  });

  it("компактният вариант показва същите продукти и същите цени", () => {
    render(wrap(<ProductCards variant="compact" source="home" />));
    for (const p of ONE_TIME_PRODUCTS) {
      expect(screen.getByText(productPriceLabel(p.id))).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: p.ctaLabel }),
      ).toBeInTheDocument();
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
    await userEvent.click(screen.getByRole("link", { name: "Провери договора" }));
    expect(trackFunnelEvent).toHaveBeenCalledWith(
      "product_selected",
      expect.objectContaining({ product: "contract_check", source: "home" }),
    );
    // Никое събитие не твърди покупка/плащане.
    for (const call of vi.mocked(trackFunnelEvent).mock.calls) {
      expect(String(call[0])).not.toMatch(/purchase|paid|payment|success/);
    }
  });

  it("демо блоковете са достъпни и без анимация", () => {
    render(wrap(<ProductCards variant="full" source="produkti" />));
    const demos = screen.getAllByRole("img");
    expect(demos).toHaveLength(3);
    for (const d of demos) {
      expect(d.getAttribute("aria-label")).toBeTruthy();
      expect(d.textContent?.length ?? 0).toBeGreaterThan(10);
    }
  });
});

describe("бизнес персона", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it("детерминистично съответствие персона → план", () => {
    expect(recommendForPersona("own_business").plan).toBe("entrepreneur");
    expect(recommendForPersona("own_business").planName).toBe("Предприемач");
    expect(recommendForPersona("client_work").plan).toBe("professional");
    expect(recommendForPersona("client_work").planName).toBe("Професионалист");
    expect(personaNextStepHref("own_business")).toBe(
      "/plans?product=business_contract_map&persona=own_business",
    );
  });

  it("съхранява само избора и игнорира подправени стойности", () => {
    saveBusinessPersona("client_work");
    expect(window.sessionStorage.getItem(PERSONA_STORAGE_KEY)).toBe(
      "client_work",
    );
    expect(loadBusinessPersona()).toBe("client_work");
    window.sessionStorage.setItem(PERSONA_STORAGE_KEY, "hacked");
    expect(loadBusinessPersona()).toBeNull();
  });

  it("intake екранът препоръчва и записва след избор", async () => {
    render(wrap(<BusinessCardIntake />));
    expect(
      screen.getByText("Работите с договори основно за:"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("persona-recommendation"),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Моя бизнес/ }));
    expect(screen.getByTestId("persona-recommendation")).toHaveTextContent(
      "Предприемач",
    );
    expect(loadBusinessPersona()).toBe("own_business");
    expect(trackFunnelEvent).toHaveBeenCalledWith(
      "business_persona_selected",
      expect.objectContaining({
        persona: "own_business",
        recommended_plan: "entrepreneur",
      }),
    );
    expect(
      screen.getByRole("link", { name: /Продължи към следващата стъпка/ }),
    ).toHaveAttribute(
      "href",
      "/plans?product=business_contract_map&persona=own_business",
    );
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
