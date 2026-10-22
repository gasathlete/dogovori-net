import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DocumentWorkflowStage } from "@/components/home/DocumentWorkflowStage";

describe("home demonstration navigation", () => {
  it("advances through all four steps and wraps back to selection", () => {
    render(<MemoryRouter><DocumentWorkflowStage /></MemoryRouter>);
    const selected = () => screen.getAllByRole("tab").find((tab) => tab.getAttribute("aria-selected") === "true");
    expect(selected()?.getAttribute("data-state")).toBe("active");
    expect(selected()?.textContent).toContain("Избирате");
    fireEvent.click(screen.getByRole("button", { name: "Следваща стъпка" }));
    expect(selected()?.textContent).toContain("Попълвате");
    fireEvent.click(screen.getByRole("button", { name: "Следваща стъпка" }));
    expect(selected()?.textContent).toContain("Брандирате");
    expect(screen.getByRole("link", { name: /Настройте фирмен стил/ }).getAttribute("href")).toBe("/account?tab=branding");
    fireEvent.click(screen.getByRole("button", { name: "Следваща стъпка" }));
    expect(selected()?.textContent).toContain("Преглеждате");
    fireEvent.click(screen.getByRole("button", { name: "Следваща стъпка" }));
    expect(selected()?.textContent).toContain("Избирате");
    cleanup();
  });
  it("preserves scene nodes through navigation and synchronizes native swiping", () => {
    vi.useFakeTimers();
    const { container } = render(<MemoryRouter><DocumentWorkflowStage /></MemoryRouter>);
    const scenes = Array.from(container.querySelectorAll('[role="tabpanel"]'));
    fireEvent.click(screen.getByRole("button", { name: "Следваща стъпка" }));
    fireEvent.click(screen.getByRole("button", { name: "Следваща стъпка" }));
    expect(Array.from(container.querySelectorAll('[role="tabpanel"]'))).toEqual(scenes);
    const track = container.querySelector(".workflow-scene-viewport");
    if (!track) throw new Error("Missing workflow track");
    fireEvent.touchStart(track, { touches: [{ clientX: 300 }] });
    fireEvent.touchEnd(track, { changedTouches: [{ clientX: 100 }] });
    expect(screen.getByRole("tab", { name: /Преглеждате/ }).getAttribute("aria-selected")).toBe("true");
    cleanup();
    vi.useRealTimers();
  });
  it("keeps the actual creation destination rather than submitting demonstration values", () => {
    render(<MemoryRouter><DocumentWorkflowStage /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /Изгответе свой документ/ }).getAttribute("href")).toBe("/build");
    cleanup();
  });
});