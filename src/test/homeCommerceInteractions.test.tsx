import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DocumentWorkflowStage } from "@/components/home/DocumentWorkflowStage";

describe("home demonstration navigation", () => {
  it("advances through all three steps and wraps back to selection", () => {
    render(<MemoryRouter><DocumentWorkflowStage /></MemoryRouter>);
    const selected = () => screen.getAllByRole("tab").find((tab) => tab.getAttribute("aria-selected") === "true");
    expect(selected()?.getAttribute("data-state")).toBe("active");
    expect(selected()?.textContent).toContain("Избирате");
    fireEvent.click(screen.getByRole("button", { name: "Следваща стъпка" }));
    expect(selected()?.textContent).toContain("Попълвате");
    fireEvent.click(screen.getByRole("button", { name: "Следваща стъпка" }));
    expect(selected()?.textContent).toContain("Преглеждате");
    fireEvent.click(screen.getByRole("button", { name: "Следваща стъпка" }));
    expect(selected()?.textContent).toContain("Избирате");
    cleanup();
  });
  it("keeps the actual creation destination rather than submitting demonstration values", () => {
    render(<MemoryRouter><DocumentWorkflowStage /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /Изгответе свой документ/ }).getAttribute("href")).toBe("/build");
    cleanup();
  });
});