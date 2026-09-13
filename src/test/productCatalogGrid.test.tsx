import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ProductCatalogGrid } from "@/components/products/ProductCatalogGrid";
import {
  ONE_TIME_PRODUCTS,
  productDiscountLabel,
  productPath,
  productPreviousPriceLabel,
  productPriceLabel,
} from "@/lib/products";
import { PREVIEW_NOTE, PREVIEW_TITLE } from "@/components/products/previewData";

vi.mock("@/lib/funnel", () => ({
  trackFunnelEvent: vi.fn(() => true),
  markFunnelStep: vi.fn(),
}));

const renderGrid = () =>
  render(
    <MemoryRouter>
      <ProductCatalogGrid source="test" />
    </MemoryRouter>,
  );

describe("каталожна продуктова витрина", () => {
  it("показва едновременно трите продукта с точните цени и връзки", () => {
    renderGrid();

    expect(screen.getAllByRole("article")).toHaveLength(3);
    for (const product of ONE_TIME_PRODUCTS) {
      const card = screen.getByTestId(`catalog-product-${product.id}`);
      expect(card).toHaveTextContent(product.name);
      expect(card).toHaveTextContent(productPriceLabel(product.id));
      expect(card).toHaveTextContent(productPreviousPriceLabel(product.id));
      expect(card).toHaveTextContent(productDiscountLabel(product.id));
      expect(within(card).getByRole("link", { name: product.name })).toHaveAttribute(
        "href",
        productPath(product),
      );
      expect(within(card).getByRole("link", { name: new RegExp(product.ctaLabel) })).toHaveAttribute(
        "href",
        product.ctaHref,
      );
    }
  });

  it("показва реалните демонстрации, ясно означени като примерни", () => {
    renderGrid();

    expect(screen.getAllByText(PREVIEW_TITLE)).toHaveLength(3);
    expect(screen.getAllByText(PREVIEW_NOTE)).toHaveLength(3);
  });

  it("не показва оценки или брой отзиви без проверен източник", () => {
    renderGrid();

    for (const product of ONE_TIME_PRODUCTS) {
      expect(screen.getByTestId(`product-rating-slot-${product.id}`)).not.toBeVisible();
    }
    expect(screen.queryByText(/отзив/i)).toBeNull();
    expect(screen.queryByLabelText(/звезд/i)).toBeNull();
  });

  it("запазва пълния пакет на цял ред при телефонна решетка", () => {
    renderGrid();
    expect(screen.getByTestId("catalog-product-negotiation_package").className).toContain(
      "col-span-2",
    );
  });
});