import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { taskRecommendation } from "@/lib/taskRecommendation";
import { TaskChooser } from "@/components/home/TaskChooser";
vi.mock("@/lib/metrics", () => ({ trackMetric: vi.fn() }));
afterEach(cleanup);
describe("task recommendations", () => {
  it.each([
    ["new", "template", "/catalog"], ["new", "tailored", "/build"],
    ["existing", "template", "/produkti/proverka-predi-podpis"], ["sequence", "template", "/komplekti"],
  ] as const)("%s/%s resolves to %s", (task, choice, destination) => {
    expect(taskRecommendation(task, choice).to).toBe(destination);
  });
  it("retains the actual check price without substituting a subscription", () => {
    expect(taskRecommendation("existing").price).toMatch(/2[.,]99/);
  });
  it("allows a second choice, recommendation and back to change intent", () => {
    render(<MemoryRouter><TaskChooser /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /Не знаете/ }));
    fireEvent.click(screen.getByRole("button", { name: "Трябва ми нов документ" }));
    fireEvent.click(screen.getByRole("button", { name: "Искам да задам свои условия" }));
    expect(screen.getByRole("link", { name: /Разгледайте избора/ })).toHaveAttribute("href", "/build");
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    fireEvent.click(screen.getByRole("button", { name: "Имам документ за проверка" }));
    expect(screen.getByRole("link", { name: /Разгледайте избора/ })).toHaveAttribute("href", "/produkti/proverka-predi-podpis");
  });
});