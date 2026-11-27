import { describe, it, expect } from "vitest";

// Mirrors VAT-inclusive pricing helper used in pricing copy (EUR only).
function formatEurVat(net: number, vatRate = 0.2) {
  const gross = Math.round(net * (1 + vatRate) * 100) / 100;
  return { net, gross, vat: Math.round((gross - net) * 100) / 100 };
}

describe("VAT formatting (EUR)", () => {
  it("adds 20% VAT to 10 EUR", () => {
    const r = formatEurVat(10);
    expect(r.gross).toBe(12);
    expect(r.vat).toBe(2);
  });
  it("works on 19.99", () => {
    const r = formatEurVat(19.99);
    expect(r.gross).toBeCloseTo(23.99, 2);
  });
});
