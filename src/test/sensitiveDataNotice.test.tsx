import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SensitiveDataNotice, sensitiveDataLabels } from "@/components/wizard/SensitiveDataNotice";

vi.mock("@/lib/metrics", () => ({ trackMetric: vi.fn() }));

describe("SensitiveDataNotice", () => {
  it("показва само категориите, без подадени стойности", () => {
    expect(sensitiveDataLabels({
      risk_level: "high",
      pii_counts: { egn: 1, email: 2 },
      reasons: ["egn:example-value"],
    })).toEqual(["ЕГН", "Имейл адрес"]);
  });

  it("изисква отделно изрично потвърждение", () => {
    const onConfirm = vi.fn();
    render(<SensitiveDataNotice classification={null} onConfirm={onConfirm} />);
    const action = screen.getByRole("button", { name: "Потвърждавам данните и продължавам" });
    expect(action).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(action).toBeEnabled();
    fireEvent.click(action);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("не предлага заобикаляне при специална категория", () => {
    render(<SensitiveDataNotice classification={{ risk_level: "blocked", reasons: ["special:health_diagnosis"] }} blocked />);
    expect(screen.getByText("Здравна информация или диагноза")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Потвърждавам данните и продължавам")).not.toBeInTheDocument();
  });
});