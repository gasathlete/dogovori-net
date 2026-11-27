/**
 * Входният пакет: дестинации на CTA и allowlist за `?checkout=`.
 * Тестовете са детерминистични — само чиста логика, без мрежа.
 */
import { describe, it, expect } from "vitest";
import { ENTRY_PACK_CONFIG } from "@/lib/pricing";
import {
  entryPackCheckoutTarget,
  entryPackCtaHref,
  isAllowedCheckoutPrice,
} from "@/lib/entryPack";

describe("входен пакет — конфигурация", () => {
  it("е 5 операции за 2.90 €, над минимума на Stripe", () => {
    expect(ENTRY_PACK_CONFIG.ops).toBe(5);
    expect(ENTRY_PACK_CONFIG.eur).toBe(2.9);
    expect(Math.round(ENTRY_PACK_CONFIG.eur * 100)).toBeGreaterThanOrEqual(50);
  });
});

describe("входен пакет — дестинация на CTA", () => {
  it("влезлият потребител отива директно към плащането", () => {
    expect(entryPackCtaHref(true)).toBe(entryPackCheckoutTarget());
    expect(entryPackCtaHref(true)).toContain(`checkout=${ENTRY_PACK_CONFIG.priceId}`);
  });

  it("анонимният минава през регистрация, но пази точната дестинация", () => {
    const href = entryPackCtaHref(false);
    expect(href.startsWith("/auth?tab=signup")).toBe(true);
    expect(decodeURIComponent(href)).toContain(entryPackCheckoutTarget());
    expect(href).toContain(`intent=one_off_${ENTRY_PACK_CONFIG.priceId}`);
  });
});

describe("allowlist за ?checkout=", () => {
  it("приема входния пакет и абонаментните цени", () => {
    expect(isAllowedCheckoutPrice(ENTRY_PACK_CONFIG.priceId)).toBe(true);
    expect(isAllowedCheckoutPrice("professional_monthly")).toBe(true);
    expect(isAllowedCheckoutPrice("entrepreneur_yearly")).toBe(true);
  });

  it("отхвърля непознати или празни стойности", () => {
    for (const bad of [null, undefined, "", "strict_doc_unlock", "team_seat_yearly", "'; drop"]) {
      expect(isAllowedCheckoutPrice(bad as string | null)).toBe(false);
    }
  });
});
