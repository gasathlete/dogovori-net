import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { resolvePurchaseState, refusalMessage, PRODUCT_CHECKOUT_TECHNICAL_FAILURE } from "@/lib/productPurchaseStatus";
import { isWelcomeSuppressedPath } from "@/lib/welcomeSuppression";

const openWaitlist = vi.fn();
vi.mock("@/lib/prelaunchWaitlist", () => ({ openPrelaunchWaitlist: (...a: unknown[]) => openWaitlist(...a) }));
import { ProductPurchaseClosed } from "@/components/products/ProductPurchaseClosed";

describe("наличност на покупка от сървъра", () => {
  it("затворен LIVE ред → Скоро, дори ако клиентският флаг е отворен", () => {
    expect(resolvePurchaseState(true, { available: false, reason: "live_closed" })).toEqual({ status: "closed", reason: "live_closed" });
  });
  it("не-staff в sandbox → Скоро", () => {
    expect(resolvePurchaseState(true, { available: false, reason: "sandbox_staff_only" })).toEqual({ status: "closed", reason: "sandbox_staff_only" });
  });
  it("грешка/липсващ отговор → затворено (fail-closed)", () => {
    expect(resolvePurchaseState(true, null).status).toBe("closed");
    expect(resolvePurchaseState(true, { available: "yes" }).status).toBe("closed");
  });
  it("prelaunch флагът затваря независимо от сървъра", () => {
    expect(resolvePurchaseState(false, { available: true })).toEqual({ status: "closed", reason: "prelaunch" });
  });
  it("само изрично available:true отваря формуляра", () => {
    expect(resolvePurchaseState(true, { available: true, reason: null })).toEqual({ status: "available" });
  });
});

describe("точни съобщения при отказ", () => {
  it("кодовете на сървъра дават точен текст без „Опитайте отново“", () => {
    for (const code of ["public_product_launch_closed", "sandbox_forbidden"]) {
      const m = refusalMessage(code)!;
      expect(m).toContain("Не е извършено плащане");
      expect(m).not.toMatch(/Опитайте отново/);
    }
    expect(PRODUCT_CHECKOUT_TECHNICAL_FAILURE).not.toMatch(/Опитайте отново/);
    expect(refusalMessage("something_else")).toBeNull();
  });
});

describe("приветственият прозорец", () => {
  it("не се отваря върху формуляра за покупка, плащането и резултата", () => {
    expect(isWelcomeSuppressedPath("/produkti/proverka-predi-podpis/start")).toBe(true);
    expect(isWelcomeSuppressedPath("/produkti/rezultat")).toBe(true);
    expect(isWelcomeSuppressedPath("/checkout/return")).toBe(true);
    expect(isWelcomeSuppressedPath("/catalog")).toBe(false);
    expect(isWelcomeSuppressedPath("/produkti/proverka-predi-podpis")).toBe(false);
  });
});

describe("статус „Скоро“ на продуктовата страница", () => {
  it("показва „Извести ме при пускане“ през съществуващия механизъм", () => {
    render(<ProductPurchaseClosed reason="live_closed" productId="contract_check" source="product_detail" />);
    expect(screen.getByText("Скоро")).toBeTruthy();
    screen.getByRole("button", { name: "Извести ме при пускане" }).click();
    expect(openWaitlist).toHaveBeenCalledWith("one_time_product", { source: "product_detail", productId: "contract_check" });
  });
});
