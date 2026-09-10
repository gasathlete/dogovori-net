/**
 * Примерният резултат: съдържание в DOM, различно за всеки продукт,
 * достъпни контроли и без обещание за платен/запазен резултат.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { ONE_TIME_PRODUCTS } from "@/lib/products";
import { ProductResultPreview } from "@/components/products/ProductResultPreview";
import { Hero } from "@/components/Hero";

vi.mock("@/lib/funnel", () => ({
  trackFunnelEvent: vi.fn(() => true),
  markFunnelStep: vi.fn(),
}));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

describe("примерен резултат — общи правила", () => {
  it("всеки продукт е обозначен като демонстрация с примерен текст", () => {
    for (const product of ONE_TIME_PRODUCTS) {
      const { unmount } = render(
        <ProductResultPreview productId={product.id} />,
      );
      const preview = screen.getByTestId("product-result-preview");
      expect(preview).toHaveTextContent("Примерен резултат");
      expect(preview).toHaveTextContent(
        "Демонстрация с примерен текст. Не е Вашият документ.",
      );
      unmount();
    }
  });

  it("не твърди, че резултатът е платен, запазен или правен съвет", () => {
    for (const product of ONE_TIME_PRODUCTS) {
      const { unmount } = render(
        <ProductResultPreview productId={product.id} />,
      );
      const text = screen.getByTestId("product-result-preview").textContent ?? "";
      for (const banned of ["платен", "запазен", "правен съвет", "гарантира"]) {
        expect(text).not.toContain(banned);
      }
      unmount();
    }
  });

  it("трите примера са материално различни, не един шаблон", () => {
    const texts = ONE_TIME_PRODUCTS.map((product) => {
      const { unmount } = render(
        <ProductResultPreview productId={product.id} />,
      );
      const text = screen.getByTestId("product-result-preview").textContent ?? "";
      unmount();
      return text;
    });
    expect(new Set(texts).size).toBe(3);
    expect(texts[0]).toContain("Заключение");
    expect(texts[1]).toContain("Преди");
    expect(texts[2]).toContain("План за преговори");
  });

  it("няма картинка, видео или автоматична въртележка", () => {
    const file = readFileSync(
      "src/components/products/ProductResultPreview.tsx",
      "utf8",
    );
    for (const banned of ["<img", "<video", "setInterval", "animate-marquee"]) {
      expect(file).not.toContain(banned);
    }
  });
});

describe("проверка преди подпис", () => {
  it("показва заключение, тежест, находка с извадка и следваща стъпка", () => {
    render(<ProductResultPreview productId="contract_check" />);
    const preview = screen.getByTestId("product-result-preview");
    expect(preview).toHaveTextContent("Заключение");
    expect(preview).toHaveTextContent("Висока: 2");
    expect(preview).toHaveTextContent("стр. 4 · раздел 6.2");
    expect(preview).toHaveTextContent("Следваща стъпка:");
    expect(preview).toHaveTextContent("Пари, срокове и задължения");
    expect(within(preview).getAllByRole("listitem").length).toBeGreaterThan(3);
  });
});

describe("поправка на документа", () => {
  it("има Преди/След и достъпен избор между трите варианта", async () => {
    render(<ProductResultPreview productId="contract_improve" />);
    const group = screen.getByRole("radiogroup", {
      name: "Изберете вариант за тази клауза",
    });
    const options = within(group).getAllByRole("radio");
    expect(options.map((o) => o.textContent)).toEqual([
      "Консервативен",
      "Балансиран",
      "По-настъпателен",
    ]);
    expect(options[1]).toHaveAttribute("aria-checked", "true");

    await userEvent.click(options[2]);
    expect(options[2]).toHaveAttribute("aria-checked", "true");
    expect(options[1]).toHaveAttribute("aria-checked", "false");

    const preview = screen.getByTestId("product-result-preview");
    expect(preview).toHaveTextContent("Компромисът:");
    // Текстът и на трите варианта остава в страницата (за търсачки и четене).
    expect(preview).toHaveTextContent("не повече от 5% от стойността");
    expect(preview).toHaveTextContent("не повече от 10% от стойността");
  });
});

describe("пълен пакет за преговори", () => {
  it("има три раздела с реални tab семантики и цялото съдържание в DOM", async () => {
    render(<ProductResultPreview productId="negotiation_package" />);
    const tabs = within(
      screen.getByRole("tablist", { name: "Части от пакета за преговори" }),
    ).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      "План за преговори",
      "Действия и срокове",
      "Писма",
    ]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");

    await userEvent.click(tabs[1]);
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Разговор по трите високи находки")).toBeInTheDocument();

    const preview = screen.getByTestId("product-result-preview");
    expect(preview).toHaveTextContent("Червени линии");
    expect(preview).toHaveTextContent("Неутрално");
    expect(preview).toHaveTextContent("Твърдо");
    expect(preview).toHaveTextContent("Едно включено прецизиране");
  });
});

describe("hero — едно доминиращо действие", () => {
  it("не показва ROI, икономия или обещание за GDPR до бутона", () => {
    render(
      <MemoryRouter>
        <Hero />
      </MemoryRouter>,
    );
    const text = document.body.textContent ?? "";
    expect(screen.getByTestId("hero-primary-cta")).toHaveTextContent(
      "Започнете безплатно",
    );
    for (const banned of [
      "Вижте колко спестявате",
      "спестявате",
      "Старт без регистрация",
      "GDPR",
    ]) {
      expect(text).not.toContain(banned);
    }
  });

  it("продуктовият ред е втори по тежест и показва старата цена", () => {
    render(
      <MemoryRouter>
        <Hero />
      </MemoryRouter>,
    );
    const rail = screen.getByTestId("hero-product-rail");
    expect(rail).toHaveTextContent("Еднократни продукти");
    expect(rail).toHaveTextContent("За един документ. Без абонамент.");
    for (const product of ONE_TIME_PRODUCTS) {
      expect(within(rail).getByTestId(`product-price-${product.id}`))
        .toHaveTextContent("€");
    }
  });
});
