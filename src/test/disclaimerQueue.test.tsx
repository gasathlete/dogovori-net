import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AIDisclaimerModal } from "@/components/AIDisclaimerModal";
import { ensureFeatureDisclaimer } from "@/lib/aiDisclaimerGate";

describe("AIDisclaimerModal опашка", () => {
  beforeEach(() => sessionStorage.clear());
  it("две различни функции едновременно: и двете обещания се решават, нищо не виси", async () => {
    render(<MemoryRouter><AIDisclaimerModal /></MemoryRouter>);
    const out: string[] = [];
    let a!: Promise<void>, b!: Promise<void>;
    await act(async () => {
      a = ensureFeatureDisclaimer("analysis").then(() => { out.push("analysis:ok"); }, () => { out.push("analysis:cancel"); });
      b = ensureFeatureDisclaimer("assistant").then(() => { out.push("assistant:ok"); }, () => { out.push("assistant:cancel"); });
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(await screen.findByText("Преди проверката на текста")).toBeTruthy();
    const accept = () => screen.getByRole("button", { name: "Разбрах и продължавам" }) as HTMLButtonElement;
    expect(accept().disabled).toBe(true);
    await act(async () => { fireEvent.click(screen.getByRole("checkbox")); });
    await act(async () => { fireEvent.click(accept()); });
    expect(await screen.findByText("Преди да питате DogovaryAI")).toBeTruthy();
    expect(accept().disabled).toBe(true); // отметката не се пренася
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Отказ" })); });
    await Promise.all([a, b]);
    expect(out).toEqual(["analysis:ok", "assistant:cancel"]);
  });
});
