/**
 * P0 Stage 2B3A — публичните конверсионни маршрути: /produkti, продуктовите
 * страници, началото на купуването и /plans.
 *
 * Проверява йерархията, точните цени, статичните връзки, извадката от
 * резултата, сравнението по честота и забранените фрази.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { readFileSync } from "node:fs";
import Products from "@/pages/Products";
import ProductDetail from "@/pages/ProductDetail";
import { ProductComparisonList } from "@/components/products/ProductComparisonList";
import { FrequencyCompare } from "@/components/products/FrequencyCompare";
import { CheckoutStepper } from "@/components/products/CheckoutStepper";
import {
  ONE_TIME_PRELAUNCH_MESSAGE,
  ONE_TIME_PURCHASES_AVAILABLE,
  ONE_TIME_PRODUCTS,
  productPath,
  productPriceLabel,
} from "@/lib/products";
import { PRODUCT_MAX_SOURCE_CHARS } from "@/lib/productSource";
import { monthlyLabel, teamSummary } from "@/lib/pricing";

vi.mock("@/lib/funnel", () => ({
  trackFunnelEvent: vi.fn(() => true),
  markFunnelStep: vi.fn(),
}));
vi.mock("@/components/Header", () => ({ Header: () => null }));
vi.mock("@/components/SeoFooter", () => ({ SeoFooter: () => null }));

const read = (f: string) => readFileSync(f, "utf8");

const wrap = (ui: React.ReactNode) => (
  <HelmetProvider>
    <MemoryRouter>{ui}</MemoryRouter>
  </HelmetProvider>
);

const renderDetail = (path: string) =>
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/produkti/:slug" element={<ProductDetail />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );

describe("/produkti — статични записи и йерархия", () => {
  it("носи трите записа с цена, получавате и една връзка", () => {
    render(wrap(<ProductComparisonList />));
    for (const p of ONE_TIME_PRODUCTS) {
      const entry = screen.getByTestId(`product-entry-${p.id}`);
      expect(entry).toHaveAttribute("href", productPath(p));
      expect(entry).toHaveTextContent(productPriceLabel(p.id));
      expect(
        screen.getByTestId(`product-entry-receive-${p.id}`),
      ).toBeInTheDocument();
    }
  });

  it("визуалната йерархия акцентира 3,99 € и подсилва 7,99 €", () => {
    render(wrap(<ProductComparisonList />));
    expect(
      screen.getByTestId("product-entry-contract_improve").className,
    ).toContain("ring-gold/25");
    const pkg = screen.getByTestId(
      "product-entry-receive-negotiation_package",
    );
    const check = screen.getByTestId("product-entry-receive-contract_check");
    expect(pkg.textContent!.length).toBeGreaterThan(check.textContent!.length);
  });

  it("цените остават точно 2,99 / 3,99 / 7,99 €", () => {
    expect(ONE_TIME_PRODUCTS.map((p) => productPriceLabel(p.id))).toEqual([
      "2,99 €",
      "3,99 €",
      "7,99 €",
    ]);
  });

  it("страницата показва витрината над дългия текст и сравнението с плановете", () => {
    const src = read("src/pages/Products.tsx");
    const showcase = src.indexOf("ProductShowcaseCarousel");
    const list = src.indexOf("ProductComparisonList");
    const compare = src.indexOf("FrequencyCompare");
    expect(showcase).toBeGreaterThan(-1);
    expect(showcase).toBeLessThan(list);
    expect(list).toBeLessThan(compare);
  });

  it("страницата се рендира с един H1", () => {
    render(wrap(<Products />));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});

describe("продуктови страници — първи изглед и граници", () => {
  for (const p of ONE_TIME_PRODUCTS) {
    it(`${p.slug}: уникален H1, цена, CTA, извадка от резултата и граници`, () => {
      renderDetail(productPath(p));
      const h1 = screen.getAllByRole("heading", { level: 1 });
      expect(h1).toHaveLength(1);
      expect(h1[0]).toHaveTextContent(p.page.h1);
      expect(screen.getByTestId(`product-price-${p.id}`)).toHaveTextContent(
        productPriceLabel(p.id),
      );
      expect(ONE_TIME_PURCHASES_AVAILABLE).toBe(false);
      expect(screen.queryByRole("link", { name: new RegExp(p.ctaLabel) })).toBeNull();
      expect(screen.getByTestId("product-prelaunch-status")).toHaveTextContent(
        "Покупките предстоят",
      );
      expect(screen.getByText(ONE_TIME_PRELAUNCH_MESSAGE)).toBeInTheDocument();
      const limits = screen.getByTestId("product-limits");
      expect(limits.textContent).toContain("PDF");
      expect(limits.textContent).toContain(
        PRODUCT_MAX_SOURCE_CHARS.toLocaleString("bg-BG"),
      );
      // Статични връзки към другите продукти и към плановете.
      for (const other of ONE_TIME_PRODUCTS.filter((o) => o.id !== p.id)) {
        expect(
          screen.getByRole("link", { name: new RegExp(other.name) }),
        ).toHaveAttribute("href", productPath(other));
      }
      expect(screen.getAllByRole("link", { name: /план/i }).length).toBeGreaterThan(0);
    });
  }

  it("H1 и въведението са различни за всеки продукт", () => {
    const h1s = new Set(ONE_TIME_PRODUCTS.map((p) => p.page.h1));
    const intros = new Set(ONE_TIME_PRODUCTS.map((p) => p.page.intro));
    expect(h1s.size).toBe(3);
    expect(intros.size).toBe(3);
  });
});

describe("началото на купуването — стъпки и гейтове", () => {
  it("предстартовият frontend е fail-closed преди качване и checkout", () => {
    const src = read("src/pages/ProductCheckout.tsx");
    const prelaunch = src.indexOf("if (!ONE_TIME_PURCHASES_AVAILABLE)");
    const prepare = src.indexOf("const handlePrepare");
    const checkout = src.indexOf('supabase.functions.invoke("create-product-checkout"');
    expect(prelaunch).toBeGreaterThan(-1);
    expect(prelaunch).toBeLessThan(prepare);
    expect(prelaunch).toBeLessThan(checkout);
    expect(src).toContain('data-testid="product-checkout-prelaunch"');
  });
  it("указателят маркира текущата и готовите стъпки", () => {
    render(
      wrap(
        <CheckoutStepper
          steps={[
            { id: "document", label: "Документ" },
            { id: "context", label: "Вашата страна" },
            { id: "payment", label: "Плащане" },
          ]}
          activeId="context"
          doneIds={["document"]}
        />,
      ),
    );
    expect(screen.getByTestId("checkout-stepper")).toBeInTheDocument();
    expect(screen.getByTestId("checkout-step-context")).toHaveAttribute(
      "aria-current",
      "step",
    );
  });

  it("нито едно съгласие или гейт не е премахнато", () => {
    const src = read("src/pages/ProductCheckout.tsx");
    for (const key of [
      "termsAccepted",
      "aiAckAccepted",
      "immediatePerformanceConsent",
      "withdrawalLossAcknowledged",
    ]) {
      expect(src).toContain(key);
    }
    expect(src).toContain(
      "Boolean(prepared) && contextReady && allConsents && !busy && !locked",
    );
  });

  it("Stripe и заявката се отварят само след всички гейтове", () => {
    const src = read("src/pages/ProductCheckout.tsx");
    expect(src).toContain("if (!user || !prepared || !canPay) return;");
    // Плащането се монтира само при наличен clientSecret от сървъра.
    const stripeAt = src.indexOf("<StripeEmbeddedCheckout");
    expect(src.slice(0, stripeAt)).toContain("locked = clientSecret !== null");
  });

  it("контекстът се пита само когато продуктът го ползва", () => {
    const src = read("src/pages/ProductCheckout.tsx");
    expect(src).toContain('needsObjective = product?.id !== "contract_check"');
    expect(src).toContain(
      'needsCounterparty = product?.id === "negotiation_package"',
    );
  });

  it("готовите стъпки се свиват до резюме и се отварят отново до заключване", () => {
    const src = read("src/pages/ProductCheckout.tsx");
    expect(src).toContain("contextSummary");
    expect(src).toContain("Промени");
    // Свитата стъпка се отваря отново само докато плащането не е заключено.
    expect(src).toContain("{reopenStep && !locked && (");
  });
});

describe("сравнение по честота", () => {
  it("показва един документ, редовна работа и екип с каноничните числа", () => {
    render(wrap(<FrequencyCompare />));
    expect(screen.getByTestId("frequency-row-one_document")).toHaveTextContent(
      "2,99 €",
    );
    expect(screen.getByTestId("frequency-row-regular")).toHaveTextContent(
      monthlyLabel("professional"),
    );
    expect(screen.getByTestId("frequency-row-team")).toHaveTextContent(
      teamSummary(),
    );
    expect(
      screen.getByRole("link", { name: /Вижте продуктите/ }),
    ).toHaveAttribute("href", "/produkti");
  });

  it("не съдържа измислени проценти икономия или натиск", () => {
    const src = read("src/components/products/FrequencyCompare.tsx");
    expect(src).not.toMatch(/спест/i);
    expect(src).not.toMatch(/\d+\s*%/);
    expect(src).not.toMatch(/само днес|последен шанс|изтича след/i);
  });

  it("/plans показва сравнението и запазва връзката към продуктите", () => {
    const src = read("src/pages/Plans.tsx");
    expect(src).toContain("FrequencyCompare");
    expect(src).toContain("OneTaskAlternative");
  });
});

describe("език и мобилна безопасност", () => {
  const FILES = [
    "src/pages/Products.tsx",
    "src/pages/ProductDetail.tsx",
    "src/pages/ProductCheckout.tsx",
    "src/components/products/ProductComparisonList.tsx",
    "src/components/products/FrequencyCompare.tsx",
    "src/components/products/CheckoutStepper.tsx",
  ];

  const BANNED = [
    "воден процес",
    "готови за поръчки",
    "скрити рискове",
    "без халюцинации",
    "революционен",
    "най-добрият",
    "лв.",
    "BGN",
  ];

  it("няма забранени публични фрази", () => {
    for (const f of FILES) {
      const src = read(f);
      for (const phrase of BANNED) {
        expect(src, `${f} съдържа „${phrase}“`).not.toContain(phrase);
      }
    }
  });

  it("контролите остават достатъчно големи за пръст", () => {
    for (const f of [
      "src/components/products/ProductComparisonList.tsx",
      "src/components/products/FrequencyCompare.tsx",
    ]) {
      expect(read(f)).toContain("min-h-[44px]");
    }
    expect(read("src/pages/ProductCheckout.tsx")).toContain("min-h-11");
  });
});
