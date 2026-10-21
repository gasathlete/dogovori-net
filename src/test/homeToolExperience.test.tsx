import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect } from "vitest";
import { ToolExperience } from "@/components/home/ToolExperience";

describe("home uses the existing calculator computation", () => {
  it("updates the VAT output from entered values and links to that exact tool", () => {
    render(<MemoryRouter><ToolExperience /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText("Сума (EUR)"), { target: { value: "100" } });
    expect(screen.getByTestId("home-calculator-result").textContent?.replace(/\s/g, "")).toBe("120,00€");
    expect(screen.getByRole("link", { name: "Пълен калкулатор и основания" })).toHaveAttribute("href", "/tools/dds-kalkulator");
  });
});