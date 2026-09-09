/**
 * Продукти ↔ Планове като едно спокойно решение.
 * Проверява: взаимни връзки, канонични стойности, липса на недоказани
 * твърдения за икономия/break-even и на натиск.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  PlanAlternativeNote,
  planVolumeSentence,
} from "@/components/products/PlanAlternativeNote";
import { OneTaskAlternative } from "@/components/products/OneTaskAlternative";
import { PRICING_PLANS, ENTRY_PACK_CONFIG, fmtEur } from "@/lib/pricing";
import { ONE_TIME_PRODUCTS, productPath, productPriceLabel } from "@/lib/products";

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const BANNED = [
  "най-изгоден",
  "най-изгодно",
  "спестявате",
  "икономия",
  "само днес",
  "остават",
  "промоция изтича",
];

describe("PlanAlternativeNote (на продуктовите повърхности)", () => {
  it("показва тихия въпрос и връзка към плановете", () => {
    renderWithRouter(<PlanAlternativeNote />);
    expect(screen.getByText("Работите с документи редовно?")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Сравнете плановете/ });
    expect(link).toHaveAttribute("href", "/plans");
  });

  it("използва каноничните стойности на Професионалист с квалификатор за обема", () => {
    const sentence = planVolumeSentence();
    const plan = PRICING_PLANS.professional;
    expect(sentence).toContain(plan.name);
    expect(sentence).toContain(fmtEur(plan.monthly as number));
    expect(sentence).toContain(String(plan.opsPerMonth));
    expect(sentence).toContain("при използване на включения обем");
  });

  it("не рендерира недоказани твърдения за икономия или натиск", () => {
    const { container } = renderWithRouter(<PlanAlternativeNote />);
    const text = container.textContent ?? "";
    for (const phrase of BANNED) expect(text).not.toContain(phrase);
    // без цена на действие и без задраскана цена
    expect(text).not.toMatch(/на действие/);
    expect(container.querySelector("s, del")).toBeNull();
  });
});

describe("OneTaskAlternative (на /plans)", () => {
  it("води към трите канонични продуктови страници с точните цени", () => {
    renderWithRouter(<OneTaskAlternative />);
    expect(screen.getByText("Само за една задача?")).toBeInTheDocument();
    for (const p of ONE_TIME_PRODUCTS) {
      const link = screen.getByRole("link", { name: new RegExp(p.name) });
      expect(link).toHaveAttribute("href", productPath(p));
      expect(link.textContent).toContain(productPriceLabel(p.id));
    }
  });

  it("не смесва продуктите с входния пакет от 2,90 €", () => {
    const { container } = renderWithRouter(<OneTaskAlternative />);
    const text = container.textContent ?? "";
    expect(text).not.toContain(fmtEur(ENTRY_PACK_CONFIG.eur));
    for (const phrase of BANNED) expect(text).not.toContain(phrase);
  });

  it("не използва модал или sticky прекъсване", () => {
    const { container } = renderWithRouter(<OneTaskAlternative />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector(".fixed")).toBeNull();
  });
});
