import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { BrandMark } from "@/components/BrandLogo";
import {
  BRAND_FRAME_PATHS,
  BRAND_MONOGRAM_TRANSFORM,
  BRAND_MONOGRAM_PATHS,
  BRAND_SCALE_PATHS,
  BRAND_WORDMARK_TRANSFORM,
  BRAND_WORDMARK_PATHS,
} from "@/lib/brandGeometry";

describe("Logo", () => {
  it("renders brand name", () => {
    render(<MemoryRouter><Logo /></MemoryRouter>);
    expect(screen.getByLabelText("Договори.нет")).toBeInTheDocument();
  });

  it("renders the approved Cyrillic framed monogram from canonical geometry", () => {
    const { container } = render(<BrandMark />);
    const mark = container.querySelector("svg");

    expect(mark).toHaveAttribute("viewBox", "0 0 320 270");
    expect(mark?.querySelector(`g[transform="${BRAND_MONOGRAM_TRANSFORM}"]`)).toBeInTheDocument();
    expect(mark?.querySelectorAll("path")).toHaveLength(
      BRAND_FRAME_PATHS.length + BRAND_MONOGRAM_PATHS.length + BRAND_SCALE_PATHS.length,
    );
  });

  it("renders the horizontal lockup from the canonical vector paths", () => {
    const { container } = render(<MemoryRouter><Logo /></MemoryRouter>);
    const logo = container.querySelector("svg");

    expect(logo).toHaveAttribute("viewBox", "0 0 1408 280");
    expect(logo).toHaveAttribute("width", "1408");
    expect(logo?.querySelector(`g[transform="${BRAND_WORDMARK_TRANSFORM}"]`)).toBeInTheDocument();
    expect(logo?.querySelectorAll(`g[transform="${BRAND_WORDMARK_TRANSFORM}"] path[fill="currentColor"]`)).toHaveLength(
      BRAND_WORDMARK_PATHS.length,
    );
    expect(logo?.querySelectorAll("path")).toHaveLength(
      BRAND_FRAME_PATHS.length + BRAND_MONOGRAM_PATHS.length + BRAND_SCALE_PATHS.length + BRAND_WORDMARK_PATHS.length,
    );
  });
});
