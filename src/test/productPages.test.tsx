/**
 * Трите самостоятелни продуктови страници: маршрути, метаданни, структурирани
 * данни, вътрешни връзки, sitemap и еднакво съдържание при двата размера.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { readFileSync } from "node:fs";
import ProductDetail from "@/pages/ProductDetail";
import {
  ONE_TIME_PRODUCTS,
  ONE_TIME_PRODUCT_PATHS,
  getProductBySlug,
  productPath,
  productPriceLabel,
} from "@/lib/products";

vi.mock("@/lib/funnel", () => ({
  trackFunnelEvent: vi.fn(() => true),
  markFunnelStep: vi.fn(),
}));
vi.mock("@/components/Header", () => ({ Header: () => null }));
vi.mock("@/components/SeoFooter", () => ({ SeoFooter: () => null }));

const read = (f: string) => readFileSync(f, "utf8");

const renderAt = (path: string) =>
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/produkti/:slug" element={<ProductDetail />} />
          <Route path="/produkti" element={<div>витрина</div>} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );

describe("канонични продуктови пътища", () => {
  it("използва точните ASCII slug-ове", () => {
    expect(ONE_TIME_PRODUCT_PATHS).toEqual([
      "/produkti/proverka-predi-podpis",
      "/produkti/popravi-dokument",
      "/produkti/palen-paket-pregovori",
    ]);
  });

  it("непознат slug не се приема", () => {
    expect(getProductBySlug("nyama-takova")).toBeNull();
    expect(getProductBySlug(undefined)).toBeNull();
  });

  it("маршрутите са регистрирани в App", () => {
    const app = read("src/App.tsx");
    expect(app).toContain('path="/produkti/:slug"');
    expect(app).toContain("ProductDetail");
  });

  it("страниците са в sitemap-а", () => {
    const sitemap = read("scripts/build-sitemap.ts");
    expect(sitemap).toContain("ONE_TIME_PRODUCT_PATHS");
    expect(sitemap).toContain('loc: "/produkti"');
  });

  it("вътрешни връзки от витрината, футъра и картите", () => {
    expect(read("src/components/products/ProductCard.tsx")).toContain("productPath(product)");
    expect(read("src/components/products/HeroProductRail.tsx")).toContain("productPath(product)");
    expect(read("src/components/SeoFooter.tsx")).toContain("productPath(p)");
    expect(read("src/pages/Products.tsx")).toContain("productPath(p)");
  });
});

describe.each(ONE_TIME_PRODUCTS.map((p) => [p.slug, p] as const))(
  "продуктова страница %s",
  (slug, product) => {
    it("има един H1, точна цена и условията на плащане", () => {
      renderAt(productPath(product));
      const headings = screen.getAllByRole("heading", { level: 1 });
      expect(headings).toHaveLength(1);
      expect(headings[0]).toHaveTextContent(product.page.h1);
      expect(screen.getByTestId(`product-price-${product.id}`)).toHaveTextContent(productPriceLabel(product.id));
      expect(
        screen.getByText(/С включен ДДС · без абонамент/),
      ).toBeInTheDocument();
    });

    it("казва какво давате и какво получавате, с три стъпки и FAQ в DOM", () => {
      renderAt(productPath(product));
      expect(screen.getByText("Какво давате Вие")).toBeInTheDocument();
      expect(screen.getByText("Какво получавате")).toBeInTheDocument();
      for (const item of product.page.youReceive) {
        expect(screen.getAllByText(item).length).toBeGreaterThan(0);
      }
      expect(product.page.steps).toHaveLength(3);
      for (const step of product.page.steps) {
        expect(screen.getAllByText(new RegExp(step)).length).toBeGreaterThan(0);
      }
      expect(product.page.faq.length).toBeGreaterThanOrEqual(3);
      for (const item of product.page.faq) {
        expect(screen.getByText(item.q)).toBeInTheDocument();
        expect(screen.getByText(item.a)).toBeInTheDocument();
      }
      expect(product.page.youReceive.length).toBeGreaterThanOrEqual(3);
      expect(product.page.youReceive.length).toBeLessThanOrEqual(5);
    });

    it("сочи към другите два продукта и към плановете", () => {
      renderAt(productPath(product));
      for (const other of ONE_TIME_PRODUCTS.filter((p) => p.id !== product.id)) {
        expect(
          screen.getByRole("link", { name: new RegExp(other.name) }),
        ).toHaveAttribute("href", productPath(other));
      }
      expect(screen.getByRole("link", { name: "Вижте плановете" })).toHaveAttribute(
        "href",
        "/plans",
      );
    });

    it("има уникални метаданни и канонична връзка", () => {
      expect(product.page.title.length).toBeGreaterThan(20);
      expect(product.page.title.length).toBeLessThan(70);
      expect(product.page.metaDescription.length).toBeLessThan(175);
      const others = ONE_TIME_PRODUCTS.filter((p) => p.id !== product.id);
      for (const other of others) {
        expect(other.page.title).not.toBe(product.page.title);
        expect(other.page.metaDescription).not.toBe(product.page.metaDescription);
      }
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    });
  },
);

describe("структурирани данни", () => {
  const src = read("src/pages/ProductDetail.tsx");

  it("BreadcrumbList, WebPage, Service и FAQPage", () => {
    for (const type of ["BreadcrumbList", "WebPage", "Service", "FAQPage"]) {
      expect(src).toContain(type);
    }
  });

  it("без Product/Offer твърдения, докато плащането не е живо", () => {
    expect(src).not.toContain('"@type": "Offer"');
    expect(src).not.toContain('"@type": "Product"');
    expect(src).not.toContain("availability");
  });

  it("съдържанието не зависи от размера на екрана и не се дозарежда след клик", () => {
    expect(src).not.toContain("useIsMobileViewport");
    expect(src).not.toContain("isMobile");
    expect(src).not.toContain("lazy(");
  });
});

describe("човешко българско копие на публичните повърхности", () => {
  const banned = [
    "в един работен процес",
    "Готови за поръчка",
    "готови за поръчки",
    "воден процес",
    "отключете потенциала",
    "безпроблемно изживяване",
    "интелигентно решение",
    "екосистема",
  ];
  const files = [
    "src/components/Header.tsx",
    "src/components/Hero.tsx",
    "src/lib/audience.ts",
    "src/components/home/ProductsSection.tsx",
    "src/components/products/ProductCard.tsx",
    "src/components/products/HeroProductRail.tsx",
    "src/pages/Products.tsx",
    "src/pages/ProductDetail.tsx",
    "src/pages/Index.tsx",
    "src/pages/Plans.tsx",
    "src/lib/products.ts",
  ];

  it.each(files)("%s не съдържа генерирани фрази", (file) => {
    const text = read(file).toLowerCase();
    for (const phrase of banned) {
      expect(text).not.toContain(phrase.toLowerCase());
    }
  });

  it("не обещава скорост, адвокатски преглед или гаранции", () => {
    for (const file of ["src/pages/ProductDetail.tsx", "src/lib/products.ts"]) {
      const text = read(file);
      expect(text).not.toMatch(/за \d+ (минут|секунд)/);
      expect(text).not.toMatch(/гарантира|проверено от адвокат/);
    }
  });
});
