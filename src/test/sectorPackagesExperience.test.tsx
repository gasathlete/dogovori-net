import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SECTOR_PACKAGES } from "@/data/sectorPackages";
import SectorPackagesPage from "@/pages/SectorPackages";
import SectorPackageDetailPage from "@/pages/SectorPackageDetail";
import KitDetailPage from "@/pages/KitDetail";
import { LaunchPurchaseBanner } from "@/components/prelaunch/LaunchPurchaseBanner";

vi.mock("@/components/Header", () => ({ Header: () => null }));
vi.mock("@/components/SeoFooter", () => ({ SeoFooter: () => null }));
vi.mock("@/lib/metrics", () => ({ trackMetric: vi.fn() }));

function route(path: string, pattern: string, element: React.ReactNode) {
  return render(<HelmetProvider><MemoryRouter initialEntries={[path]}><Routes><Route path={pattern} element={element} /><Route path="/paketi" element={<p>Индекс пакети</p>} /><Route path="/komplekti" element={<p>Индекс комплекти</p>} /></Routes></MemoryRouter></HelmetProvider>);
}

describe("пакети и комплекти в предварителен режим", () => {
  it("подредбата на началната страница е доказателство → пакети → комплекти → продукти → реклама", async () => {
    const source = await import("node:fs").then(({ readFileSync }) => readFileSync("src/components/home/HomeSections.tsx", "utf8"));
    const positions = ["<SocialProofStrip", "<SectorPackages", "<LifeScenarios", "<ProductsSection", "<AdSpotlight"].map((token) => source.indexOf(token));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(source.match(/<LifeScenarios/g)).toHaveLength(1);
  });

  it("показва четирите пакета и работещи detail връзки", () => {
    render(<HelmetProvider><MemoryRouter><SectorPackagesPage /></MemoryRouter></HelmetProvider>);
    for (const item of SECTOR_PACKAGES) {
      expect(screen.getByRole("heading", { name: item.title })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Разгледайте съдържанието/, hidden: false, exact: false }).closest("a")).toBeTruthy();
    }
  });

  it("detail показва наличен шаблон и планиран документ без фалшива връзка", () => {
    route("/paketi/naemi", "/paketi/:slug", <SectorPackageDetailPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Наеми" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Оформяте наема и плащането/ })).toHaveAttribute("href", "/shablon/dogovor-za-naem-na-zhilishte");
    expect(screen.getByText("Финален протокол за връщане и разчети").closest("a")).toBeNull();
  });

  it("непознат пакет и комплект се връщат към безопасния индекс", () => {
    route("/paketi/nepoznat", "/paketi/:slug", <SectorPackageDetailPage />);
    expect(screen.getByText("Индекс пакети")).toBeInTheDocument();
    route("/komplekti/nepoznat", "/komplekti/:slug", <KitDetailPage />);
    expect(screen.getByText("Индекс комплекти")).toBeInTheDocument();
  });

  it("заключената покупка отваря заявката без checkout или запис", () => {
    const listener = vi.fn();
    window.addEventListener("dogovori:prelaunch-waitlist", listener);
    render(<MemoryRouter><LaunchPurchaseBanner source="package_detail" productId="package_rentals" /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Извести ме при пускане" }));
    expect(listener).toHaveBeenCalledOnce();
    const detail = (listener.mock.calls[0]?.[0] as CustomEvent).detail;
    expect(detail).toEqual({ feature: "one_time_product" });
    window.removeEventListener("dogovori:prelaunch-waitlist", listener);
  });

  it("комплектът запазва preview връзките, но няма старт на нов запис", () => {
    route("/komplekti/naem-zhilishte", "/komplekti/:slug", <KitDetailPage />);
    expect(screen.getByRole("link", { name: /Договор за наем на жилище/ })).toHaveAttribute("href", "/shablon/dogovor-za-naem-na-zhilishte");
    expect(screen.queryByRole("button", { name: /Стартирай комплекта/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Извести ме при пускане" })).toBeInTheDocument();
  });
});