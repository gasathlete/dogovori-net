import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DocumentWorkflowStage } from "@/components/home/DocumentWorkflowStage";

const setup = () => render(<MemoryRouter><DocumentWorkflowStage /></MemoryRouter>);
const selected = () => screen.getAllByRole("tab").find((t) => t.getAttribute("aria-selected") === "true")?.textContent;
const preview = () => screen.getByRole("article", { name: "Преглед на примерния документ" });
afterEach(cleanup);

describe("hero interactive workspace", () => {
  it("editing the company field updates the preview immediately", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Фирма"), { target: { value: "Ателие Роза" } });
    expect(preview().textContent).toContain("Ателие Роза");
    expect(preview().textContent).not.toContain("IM Development");
  });
  it("brand step applies monogram and selected accent to the same preview", () => {
    setup();
    expect(preview().getAttribute("data-branded")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Следваща стъпка" }));
    expect(selected()).toContain("Вашият бранд");
    expect(preview().getAttribute("data-branded")).toBe("true");
    expect(preview().textContent).toContain("ID");
    fireEvent.click(screen.getByRole("radio", { name: /Мастило/ }));
    expect(preview().getAttribute("style")).toContain("--brand-ink");
    fireEvent.click(screen.getByLabelText("Лого в бланката"));
    expect(preview().textContent).not.toMatch(/^ID/);
  });
  it("steps wrap, swipe advances and final step links to /build", () => {
    const { container } = setup();
    const body = container.querySelector(".workspace-body")!;
    fireEvent.touchStart(body, { touches: [{ clientX: 300 }] });
    fireEvent.touchEnd(body, { changedTouches: [{ clientX: 100 }] });
    expect(selected()).toContain("Вашият бранд");
    fireEvent.click(screen.getByRole("button", { name: "Следваща стъпка" }));
    expect(screen.getByRole("link", { name: /Изгответе свой документ/ }).getAttribute("href")).toBe("/build");
    fireEvent.click(screen.getByRole("button", { name: "Следваща стъпка" }));
    expect(selected()).toContain("Попълнете");
  });
});
