import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { HeroProductRail } from "@/components/products/HeroProductRail";

vi.mock("@/lib/funnel", () => ({ trackFunnelEvent: vi.fn() }));

describe("branded product purchase actions", () => {
  it("retains each distinct existing document intake destination", () => {
    render(<MemoryRouter><HeroProductRail /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Проверете документ", exact: true })).toHaveAttribute("href", "/produkti/proverka-predi-podpis/start");
    expect(screen.getByRole("link", { name: "Поправете документ", exact: true })).toHaveAttribute("href", "/produkti/popravi-dokument/start");
    expect(screen.getByRole("link", { name: "Подгответе документа за преговори", exact: true })).toHaveAttribute("href", "/produkti/palen-paket-pregovori/start");
  });
});