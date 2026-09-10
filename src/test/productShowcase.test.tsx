/**
 * Продуктовата витрина — ротация, пауза, достъпност, точен ред и цени.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import {
  ProductShowcaseCarousel,
  SHOWCASE_INTERVAL_MS,
} from "@/components/products/ProductShowcaseCarousel";
import { ProductComparisonList } from "@/components/products/ProductComparisonList";
import {
  ONE_TIME_PRODUCTS,
  productDiscountLabel,
  productPath,
  productPreviousPriceLabel,
  productPriceLabel,
} from "@/lib/products";
import { CHECK_SEVERITY, PREVIEW_NOTE, PREVIEW_TITLE } from "@/components/products/previewData";

vi.mock("@/lib/funnel", () => ({
  trackFunnelEvent: vi.fn(() => true),
  markFunnelStep: vi.fn(),
}));

const wrap = (ui: React.ReactNode) => <MemoryRouter>{ui}</MemoryRouter>;

function setReducedMotion(reduced: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: reduced && query.includes("reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

const activeId = () =>
  screen.getByTestId("product-showcase").getAttribute("data-active-product");

const advance = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};

describe("ротация на витрината", () => {
  beforeEach(() => {
    setReducedMotion(false);
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("започва от проверката и минава през трите продукта в точния ред", async () => {
    render(wrap(<ProductShowcaseCarousel source="test" />));
    expect(activeId()).toBe("contract_check");
    await advance(SHOWCASE_INTERVAL_MS + 10);
    expect(activeId()).toBe("contract_improve");
    await advance(SHOWCASE_INTERVAL_MS + 10);
    expect(activeId()).toBe("negotiation_package");
    await advance(SHOWCASE_INTERVAL_MS + 10);
    expect(activeId()).toBe("contract_check");
  });

  it("интервалът е спокоен — между 6 и 8 секунди", () => {
    expect(SHOWCASE_INTERVAL_MS).toBeGreaterThanOrEqual(6000);
    expect(SHOWCASE_INTERVAL_MS).toBeLessThanOrEqual(8000);
  });

  it("бутонът за пауза спира смяната, а повторният клик я връща", async () => {
    render(wrap(<ProductShowcaseCarousel source="test" />));
    const toggle = screen.getByTestId("showcase-toggle");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await advance(SHOWCASE_INTERVAL_MS * 2);
    expect(activeId()).toBe("contract_check");
    fireEvent.click(toggle);
    await advance(SHOWCASE_INTERVAL_MS + 10);
    expect(activeId()).toBe("contract_improve");
  });

  it("спира при посочване с мишката и продължава след напускане", async () => {
    render(wrap(<ProductShowcaseCarousel source="test" />));
    const root = screen.getByTestId("product-showcase");
    fireEvent.mouseEnter(root);
    await advance(SHOWCASE_INTERVAL_MS * 2);
    expect(activeId()).toBe("contract_check");
    fireEvent.mouseLeave(root);
    await advance(SHOWCASE_INTERVAL_MS + 10);
    expect(activeId()).toBe("contract_improve");
  });

  it("работа с вариант вътре в примерния резултат спира ротацията", async () => {
    render(wrap(<ProductShowcaseCarousel source="test" />));
    fireEvent.click(screen.getByTestId("showcase-toggle"));
    fireEvent.click(screen.getByTestId("showcase-toggle"));
    // Клик вътре в панела задържа ротацията за спокоен период.
    const panel = document.querySelector("[data-showcase-panel]") as HTMLElement;
    fireEvent.pointerDown(panel);
    await advance(SHOWCASE_INTERVAL_MS * 2);
    expect(activeId()).toBe("contract_check");
  });

  it("скрита страница не върти продуктите", async () => {
    const spy = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    render(wrap(<ProductShowcaseCarousel source="test" />));
    await advance(SHOWCASE_INTERVAL_MS * 2);
    expect(activeId()).toBe("contract_check");
    spy.mockRestore();
  });

  it("стрелките сменят продукта, местят фокуса и се въртят в кръг", () => {
    render(wrap(<ProductShowcaseCarousel source="test" />));
    const tablist = screen.getByRole("tablist", { name: "Изберете продукт" });
    const tabs = within(tablist).getAllByRole("tab");
    tabs[0].focus();

    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(activeId()).toBe("contract_improve");
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0]).toHaveAttribute("tabindex", "-1");

    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tabs[0]);
    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(activeId()).toBe("negotiation_package");
    expect(document.activeElement).toBe(tabs[2]);

    fireEvent.keyDown(tablist, { key: "Home" });
    expect(activeId()).toBe("contract_check");
    expect(document.activeElement).toBe(tabs[0]);
    fireEvent.keyDown(tablist, { key: "End" });
    expect(activeId()).toBe("negotiation_package");
    expect(document.activeElement).toBe(tabs[2]);

    const panels = document.querySelectorAll('[role="tabpanel"]');
    expect(panels[2]).not.toHaveAttribute("hidden");
    expect(panels[0]).toHaveAttribute("hidden");
  });

  it("автоматичната смяна не се обявява, а човешката — да", async () => {
    render(wrap(<ProductShowcaseCarousel source="test" />));
    const live = screen.getByTestId("showcase-live");
    // Начален render: тихо.
    expect(live).toHaveTextContent("");

    await advance(SHOWCASE_INTERVAL_MS + 10);
    expect(activeId()).toBe("contract_improve");
    expect(live.textContent).toBe("");

    await advance(SHOWCASE_INTERVAL_MS + 10);
    expect(activeId()).toBe("negotiation_package");
    expect(live.textContent).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Следващ продукт" }));
    expect(live).toHaveTextContent("Продукт 1 от 3: Подробна проверка преди подпис");

    const tablist = screen.getByRole("tablist", { name: "Изберете продукт" });
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(live).toHaveTextContent("Продукт 2 от 3");
  });

  it("хоризонталното плъзгане сменя продукта, вертикалното — не", () => {
    render(wrap(<ProductShowcaseCarousel source="test" />));
    const panel = document.querySelector("[data-showcase-panel]") as HTMLElement;
    fireEvent.touchStart(panel, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(panel, { changedTouches: [{ clientX: 60, clientY: 108 }] });
    expect(activeId()).toBe("contract_improve");

    fireEvent.touchStart(panel, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(panel, { changedTouches: [{ clientX: 190, clientY: 320 }] });
    expect(activeId()).toBe("contract_improve");
  });
});

describe("намалено движение", () => {
  beforeEach(() => {
    setReducedMotion(true);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    setReducedMotion(false);
  });

  it("не сменя продуктите сама", async () => {
    render(wrap(<ProductShowcaseCarousel source="test" />));
    expect(screen.getByTestId("product-showcase")).toHaveAttribute(
      "data-running",
      "false",
    );
    await advance(SHOWCASE_INTERVAL_MS * 3);
    expect(activeId()).toBe("contract_check");
  });

  it("ръчният избор пак работи", () => {
    render(wrap(<ProductShowcaseCarousel source="test" />));
    fireEvent.click(screen.getByRole("tab", { name: /Пълен пакет/ }));
    expect(activeId()).toBe("negotiation_package");
  });
});

describe("достъпност и съдържание на витрината", () => {
  beforeEach(() => setReducedMotion(true));

  it("има точно три селектора и само активният панел е видим", () => {
    render(wrap(<ProductShowcaseCarousel source="test" />));
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("tabindex", "-1");

    const panels = document.querySelectorAll(
      '[data-showcase-panel] > div > div > [role="tabpanel"]',
    );
    expect(panels).toHaveLength(3);
    expect(panels[0]).not.toHaveAttribute("hidden");
    expect(panels[1]).toHaveAttribute("hidden");
  });

  it("има едно учтиво съобщение, празно преди човешко действие", () => {
    render(wrap(<ProductShowcaseCarousel source="test" />));
    const live = document.querySelectorAll('[aria-live="polite"]');
    expect(live).toHaveLength(1);
    expect(live[0].textContent).toBe("");
    fireEvent.click(screen.getByRole("tab", { name: /Поправка/ }));
    expect(live[0]).toHaveTextContent("Продукт 2 от 3");
  });

  it("надписът „Примерен резултат“ не е дублиран в рамката на витрината", () => {
    render(wrap(<ProductShowcaseCarousel source="test" />));
    const shown = screen
      .getAllByText(PREVIEW_TITLE)
      .filter((el) => !el.closest("[hidden]"));
    expect(shown).toHaveLength(1);
  });

  it("вътрешните контроли се движат с клавиши, без да сменят продукта", () => {
    render(wrap(<ProductShowcaseCarousel source="test" />));
    fireEvent.click(screen.getByRole("tab", { name: /Поправка/ }));
    const group = screen.getByRole("radiogroup", {
      name: "Изберете вариант за тази клауза",
    });
    const radios = within(group).getAllByRole("radio");
    radios[1].focus();
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(radios[2]).toHaveAttribute("aria-checked", "true");
    expect(document.activeElement).toBe(radios[2]);
    fireEvent.keyDown(group, { key: "Home" });
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
    expect(document.activeElement).toBe(radios[0]);
    expect(activeId()).toBe("contract_improve");

    fireEvent.click(screen.getByRole("tab", { name: /Пълен пакет/ }));
    const inner = screen.getByRole("tablist", {
      name: "Части от пакета за преговори",
    });
    const innerTabs = within(inner).getAllByRole("tab");
    innerTabs[0].focus();
    fireEvent.keyDown(inner, { key: "ArrowRight" });
    expect(innerTabs[1]).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(innerTabs[1]);
    fireEvent.keyDown(inner, { key: "End" });
    expect(innerTabs[2]).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(innerTabs[2]);
    expect(activeId()).toBe("negotiation_package");
  });

  it("показва цената, старата цена, отстъпката и каноничната връзка", () => {
    render(wrap(<ProductShowcaseCarousel source="test" />));
    const first = ONE_TIME_PRODUCTS[0];
    const price = screen.getByTestId(`product-price-${first.id}`);
    expect(price).toHaveTextContent(productPriceLabel(first.id));
    expect(price).toHaveTextContent(productPreviousPriceLabel(first.id));
    expect(price).toHaveTextContent(productDiscountLabel(first.id));
    expect(screen.getByRole("link", { name: first.name })).toHaveAttribute(
      "href",
      productPath(first),
    );
    expect(screen.getByRole("link", { name: /Вижте продукта/ })).toHaveAttribute(
      "href",
      productPath(first),
    );
  });

  it("всеки панел е обозначен като демонстрация с примерни данни", () => {
    render(wrap(<ProductShowcaseCarousel source="test" />));
    const previews = screen.getAllByTestId("product-result-preview");
    expect(previews).toHaveLength(3);
    for (const p of previews) {
      expect(p).toHaveTextContent(PREVIEW_TITLE);
      expect(p).toHaveTextContent("Не е Вашият документ.");
    }
    expect(PREVIEW_NOTE).toContain("Не е Вашият документ");
  });

  it("бутоните за управление са с достатъчна големина за пръст", () => {
    setReducedMotion(false);
    render(wrap(<ProductShowcaseCarousel source="test" />));
    for (const label of ["Предишен продукт", "Следващ продукт"]) {
      expect(screen.getByRole("button", { name: label }).className).toContain("size-11");
    }
    expect(screen.getByTestId("showcase-toggle").className).toContain("size-11");
  });

  it("витрината няма картинки и не пише цени на ръка", () => {
    const src = readFileSync(
      "src/components/products/ProductShowcaseCarousel.tsx",
      "utf8",
    );
    expect(src).not.toMatch(/<img|background-image|\.jpg|\.png|\.webp/);
    expect(/\d{1,3}[.,]\d{2}\s?€/.test(src)).toBe(false);
  });
});

describe("визуални показатели от примерните данни", () => {
  beforeEach(() => setReducedMotion(true));

  it("графиката по тежест ползва точните числа от примера", () => {
    render(wrap(<ProductShowcaseCarousel source="test" />));
    const chart = screen.getByTestId("check-severity-chart");
    const total = CHECK_SEVERITY.reduce((s, x) => s + x.count, 0);
    expect(chart).toHaveTextContent(String(total));
    const img = within(chart).getByRole("img");
    for (const s of CHECK_SEVERITY) {
      expect(img.getAttribute("aria-label")).toContain(`${s.label} ${s.count}`);
    }
    // Няма твърдение за резултати на платформата.
    expect(chart.textContent ?? "").not.toMatch(/успех|клиенти|средно/i);
  });

  it("поправката показва редакция Преди/След и трите варианта", () => {
    render(wrap(<ProductShowcaseCarousel source="test" />));
    fireEvent.click(screen.getByRole("tab", { name: /Поправка/ }));
    const redline = screen.getByTestId("improve-redline");
    expect(redline).toHaveTextContent("Преди");
    expect(redline).toHaveTextContent("След");
    for (const label of ["Консервативен", "Балансиран", "По-настъпателен"]) {
      expect(screen.getByRole("radio", { name: label })).toBeInTheDocument();
    }
  });

  it("пакетът показва действията като времева линия и включените файлове", () => {
    render(wrap(<ProductShowcaseCarousel source="test" />));
    fireEvent.click(screen.getByRole("tab", { name: /Пълен пакет/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Действия и срокове" }));
    expect(screen.getByTestId("package-timeline")).toBeInTheDocument();
    expect(screen.getByTestId("package-chips")).toHaveTextContent("DOCX");
  });
});

describe("краткият списък на /produkti", () => {
  it("носи трите продукта, цените и каноничните връзки без взаимодействие", () => {
    render(wrap(<ProductComparisonList />));
    for (const p of ONE_TIME_PRODUCTS) {
      const link = screen.getByRole("link", { name: new RegExp(p.name) });
      expect(link).toHaveAttribute("href", productPath(p));
      expect(link).toHaveTextContent(productPriceLabel(p.id));
    }
  });
});
