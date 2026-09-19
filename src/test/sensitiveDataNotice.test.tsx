import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SensitiveDataNotice } from "@/components/wizard/SensitiveDataNotice";

vi.mock("@/lib/metrics", () => ({ trackMetric: vi.fn() }));

describe("SensitiveDataNotice", () => {
  it("показва само категориите, без подадени стойности", () => {
    render(<SensitiveDataNotice classification={{
      risk_level: "high",
      pii_counts: { egn: 1, email: 2 },
      reasons: ["egn:example-value"],
    }} />);
    expect(screen.getByText(/ЕГН/)).toBeInTheDocument();
    expect(screen.getByText(/Имейл адрес/)).toBeInTheDocument();
    expect(screen.queryByText(/example-value/)).not.toBeInTheDocument();
  });

  it("иска едно изрично действие и обяснява за какво е съгласието", () => {
    const onConfirm = vi.fn();
    render(<SensitiveDataNotice classification={null} onConfirm={onConfirm} />);
    expect(screen.getByText(/давате съгласие тези данни да бъдат обработени/)).toBeInTheDocument();
    const action = screen.getByRole("button", { name: "Съгласявам се и продължавам" });
    expect(action).toBeEnabled();
    fireEvent.click(action);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("не предлага заобикаляне при специална категория", () => {
    render(<SensitiveDataNotice classification={{ risk_level: "blocked", reasons: ["special:health_diagnosis"] }} blocked />);
    expect(screen.getByText(/Здравна информация или диагноза/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Съгласявам се и продължавам")).not.toBeInTheDocument();
  });
});