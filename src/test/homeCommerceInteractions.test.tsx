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
    fireEvent.click(screen.getByRole("tab", { name: /Брандирате/ }));
    expect(Array.from(container.querySelectorAll('[role="tabpanel"]'))).toEqual(scenes);
    const track = container.querySelector(".workflow-scene-track");
    if (!track) throw new Error("Missing workflow track");
    Object.defineProperty(track, "clientWidth", { value: 390 });
    Object.defineProperty(track, "scrollLeft", { value: 1170 });
    fireEvent.scroll(track);
    fireEvent.click(screen.getByRole("button", { name: "Документ за услуги" }));
    fireEvent.scroll(track);
    // Scroll selection only commits once the manual swipe settles.
    act(() => { vi.advanceTimersByTime(120); });
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