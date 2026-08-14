/**
 * Визуални/DOM snapshot проверки: всички екрани, които показват цени, трябва
 * да рендират точно стойностите от `src/lib/pricing.ts`.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  PRICING_PLANS,
  monthlyLabel,
  opsLabel,
  teamMinYearlyTotal,
  fmtEur,
} from "@/lib/pricing";
import { RoiSavingsBanner } from "@/components/funnel/RoiSavingsBanner";
import { AnonymousPreviewNotice } from "@/components/wizard/AnonymousPreviewNotice";
import { DocumentValueCard } from "@/components/wizard/DocumentValueCard";

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

/** Нормализира whitespace, за да сравняваме копие, разбито от JSX фрагменти. */
const text = (el: HTMLElement) => el.textContent!.replace(/\s+/g, " ");

describe("ROI банер", () => {
  it("показва Предприемач с реалната цена и Екип с минимална годишна стойност", () => {
    const { container } = wrap(<RoiSavingsBanner />);
    const t = text(container.firstElementChild as HTMLElement);
    expect(t).toContain(PRICING_PLANS.entrepreneur.name);
    expect(t).toContain(monthlyLabel("entrepreneur"));
    expect(t).toContain(opsLabel("entrepreneur"));
    expect(t).toContain(PRICING_PLANS.team.name);
    expect(t).toContain(fmtEur(teamMinYearlyTotal()));
    expect(t).not.toMatch(/(?:^|[^1])9,90 €\/мес|10,90 €|32,70|\bлв\b/);
  });
});

describe("Анонимен преглед", () => {
  it("изброява и трите платени плана с коректни цени и CTA към /plans", () => {
    const { container } = wrap(<AnonymousPreviewNotice onRegister={() => {}} />);
    const t = text(container.firstElementChild as HTMLElement);
    expect(t).toContain(`${PRICING_PLANS.professional.name} за ${monthlyLabel("professional")}`);
    expect(t).toContain(monthlyLabel("entrepreneur"));
    expect(t).toContain(`мин. ${PRICING_PLANS.team.seatMin} места`);
    expect(screen.getByRole("link", { name: /Виж абонаментни планове/ })).toHaveAttribute(
      "href",
      expect.stringContaining("/plans"),
    );
  });
});

describe("Карта със стойност на документа", () => {
  it("при липса на операции сочи Професионалист и Предприемач с реални цени", () => {
    const { container } = wrap(<DocumentValueCard canDownload={false} />);
    const t = text(container.firstElementChild as HTMLElement);
    expect(t).toContain(monthlyLabel("professional"));
    expect(t).toContain(monthlyLabel("entrepreneur"));
    expect(t).not.toMatch(/12\.90|19\.90/);
  });
});

describe("Snapshot на ценовото копие", () => {
  it("остава стабилен", () => {
    const { container } = wrap(<RoiSavingsBanner />);
    expect(text(container.firstElementChild as HTMLElement)).toMatchSnapshot();
  });
});
