import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Logo } from "@/components/Logo";

describe("Logo", () => {
  it("renders brand name", () => {
    render(<MemoryRouter><Logo /></MemoryRouter>);
    expect(screen.getByText(/dogovori/i)).toBeInTheDocument();
  });
});
