import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ProductCatalogGrid } from "@/components/products/ProductCatalogGrid";
import {
  ONE_TIME_PRODUCTS,
  ONE_TIME_PURCHASES_AVAILABLE,
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
      const action = within(card).getByRole("link", {
        name: ONE_TIME_PURCHASES_AVAILABLE ? product.ctaLabel : "Вижте продукта",
      });
      expect(action).toHaveAttribute(
        "href",
        ONE_TIME_PURCHASES_AVAILABLE ? product.ctaHref : productPath(product),
      );
      if (!ONE_TIME_PURCHASES_AVAILABLE) {
        expect(within(card).queryByRole("link", { name: product.ctaLabel })).toBeNull();
      }
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

  it("извежда препоръчания продукт като широк редакционен акцент", () => {
    renderGrid();
    expect(screen.getByTestId("catalog-product-contract_improve").className).toContain(
      "lg:col-span-6",
    );
    expect(screen.getAllByRole("img")).toHaveLength(3);
    expect(screen.getByAltText(/разпечатан документ/)).toBeInTheDocument();
  });
});