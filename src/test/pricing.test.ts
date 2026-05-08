import { describe, it, expect } from "vitest";

// Mirrors VAT-inclusive pricing helper used in pricing copy.
function formatBgnVat(net: number, vatRate = 0.2) {
  const gross = Math.round(net * (1 + vatRate) * 100) / 100;
  return { net, gross, vat: Math.round((gross - net) * 100) / 100 };
}

describe("VAT formatting", () => {
  it("adds 20% VAT to 10 BGN", () => {
    const r = formatBgnVat(10);
    expect(r.gross).toBe(12);
    expect(r.vat).toBe(2);
  });
  it("works on 19.99", () => {
    const r = formatBgnVat(19.99);
    expect(r.gross).toBeCloseTo(23.99, 2);
  });
});
