/**
 * Stage 2B3B — фокусирани регресии за работните екрани.
 * Проверява йерархия (документ → действие), истинни състояния, запазени
 * ограничения и забранена копирайт-лексика. Не тества backend поведение.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { WorkStateShell } from "@/components/workspace/WorkStateShell";
import { WorkStepStrip } from "@/components/workspace/WorkStepStrip";

const read = (p: string) => readFileSync(p, "utf8");

const CATALOG = read("src/pages/Catalog.tsx");
const BUILD = read("src/pages/BuildContract.tsx");
const ANALYZE = read("src/pages/Analyze.tsx");
const WORKSPACE = read("src/pages/DocumentWorkspace.tsx");
const DOWNLOADS = read("src/pages/Downloads.tsx");
const PROTECTED = read("src/components/ProtectedRoute.tsx");
const MOBILE_NAV = read("src/components/MobileBottomNav.tsx");

describe("WorkStateShell", () => {
  it("показва едно заглавие, едно изречение и едно действие", () => {
    render(
      <MemoryRouter>
        <WorkStateShell
          title="Още няма свалени документи"
          description="Тук ще виждате всеки свален документ."
          actionLabel="Изгответе документ"
          actionTo="/build"
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Още няма свалени документи",
    );
    const link = screen.getByRole("link", { name: "Изгответе документ" });
    expect(link).toHaveAttribute("href", "/build");
    expect(link.className).toContain("min-h-11");
  });

  it("маркира зареждането като busy, без да твърди резултат", () => {
    render(
      <MemoryRouter>
        <WorkStateShell tone="loading" title="Отваряме профила Ви" description="Проверяваме дали сте влезли." />
      </MemoryRouter>,
    );
    const region = screen.getByTestId("work-state");
    expect(region).toHaveAttribute("aria-busy", "true");
    expect(region).toHaveAttribute("data-state", "loading");
  });
});

describe("WorkStepStrip", () => {
  it("показва текущата стъпка и напредъка", () => {
    render(
      <WorkStepStrip
        steps={[
          { id: "a", label: "Документ" },
          { id: "b", label: "Проверка" },
          { id: "c", label: "Резултат" },
        ]}
        current={1}
      />,
    );
    expect(screen.getByText("Стъпка 2 от 3")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "67");
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Проверка");
  });
});

describe("/catalog — избор на документ преди обяснения", () => {
  it("пази SEO фактите и каталожните връзки", () => {
    expect(CATALOG).toContain("canonical");
    expect(CATALOG).toContain("/shablon/");
    expect(CATALOG).toContain("SectorCatalogGrid");
  });

  it("има истинно състояние на търсене и празен резултат", () => {
    expect(CATALOG).toContain("catalog-search-loading");
    expect(CATALOG).toContain("Търсим в каталога…");
    expect(CATALOG).toContain('testId="catalog-empty"');
  });

  it("филтрите са с достатъчно голяма зона за докосване", () => {
    expect(CATALOG).not.toMatch(/inline-flex items-center gap-1\.5 rounded-md border px-3 py-1\.5 text-sm/);
    expect((CATALOG.match(/min-h-11/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("не съдържа недоказани твърдения в затварящия ред", () => {
    expect(CATALOG).not.toContain("системен риск-анализ");
    expect(CATALOG).not.toContain("Стратегически интервюта");
  });
});

describe("/build — генераторът показва стъпка, не обещания", () => {
  it("запазва стъпките, валидациите и чернови", () => {
    expect(BUILD).toContain("STEPS[safeStepIdx].label");
    expect(BUILD).toContain("stepValid");
    expect(BUILD).toMatch(/draft|autosave|Draft/i);
  });

  it("горният ред показва текущата стъпка", () => {
    expect(BUILD).toContain('data-testid="build-topbar-step"');
  });

  it("няма обещания за време, готовност или AI обяснения в горния ред", () => {
    expect(BUILD).not.toContain("Системата е в готовност");
    expect(BUILD).not.toContain("AI-подпомогнат");
    expect(BUILD).not.toContain("Как работи AI");
    expect(BUILD).not.toContain("Готов документ до 2 минути");
    expect(BUILD).not.toContain("пазарно-стандартни клаузи");
  });
});

describe("/analiz — документ → проверка → резултат", () => {
  it("показва последователността на екрана", () => {
    expect(ANALYZE).toContain("WorkStepStrip");
    expect(ANALYZE).toContain("ANALYZE_STEPS");
    expect(ANALYZE).toContain("Документ");
  });

  it("свива повтарящите се обяснения в едно място", () => {
    expect(ANALYZE).toContain('data-testid="analyze-details"');
  });

  it("запазва ограниченията, качването и истинните твърдения", () => {
    expect(ANALYZE).toContain("PRODUCT_ACCEPTED_INPUT");
    expect(ANALYZE).toContain("PRODUCT_MAX_SOURCE_CHARS");
    expect(ANALYZE).toContain("/account?tab=documents&action=upload");
    expect(ANALYZE).toContain("не е правен съвет");
  });

  it("не използва технически или маркетингов жаргон", () => {
    for (const banned of ["модел", "халюц", "магия", "революционен", "воден процес"]) {
      expect(ANALYZE.toLowerCase()).not.toContain(banned);
    }
  });
});

describe("работни обвивки — вход, документ, сваляния", () => {
  it("защитеният маршрут пази пренасочването и показва ясно състояние", () => {
    expect(PROTECTED).toContain("WorkStateShell");
    expect(PROTECTED).toContain("/auth?redirect=");
    expect(PROTECTED).toContain('testId="protected-loading"');
  });

  it("работният екран използва общите състояния и пази генерирането", () => {
    expect(WORKSPACE).toContain('testId="workspace-unknown-kind"');
    expect(WORKSPACE).toContain('testId="workspace-empty-parent"');
    expect(WORKSPACE).toContain("generate-linked-document");
    expect(WORKSPACE).toContain("workspace:parent:");
  });

  it("свалянията имат ясно празно състояние с едно действие и пазят историята", () => {
    expect(DOWNLOADS).toContain('testId="downloads-empty"');
    expect(DOWNLOADS).toContain("Брояч в профила");
    expect(DOWNLOADS).toContain("redownload");
    expect(DOWNLOADS).not.toContain('className="h-9"');
  });
});

describe("мобилна навигация остава пълна", () => {
  it("пази петте позиции и DogovaryAI", () => {
    for (const label of ["Начало", "Каталог", "Изготви", "DogovaryAI", "Профил"]) {
      expect(MOBILE_NAV).toContain(label);
    }
  });
});
