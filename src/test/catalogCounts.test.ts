import { describe, it, expect } from "vitest";
import { CATALOG } from "@/data/catalog";
import { SECTORS } from "@/data/sectors";
import { TEMPLATES_COUNT, SECTORS_COUNT } from "@/data/catalogCounts";

/**
 * Пази статичните броячи (използвани в landing entry chunk-а) синхронизирани
 * с реалните данни, без да ги вкарва в production bundle-а.
 */
describe("catalogCounts", () => {
  it("TEMPLATES_COUNT съответства на каталога", () => {
    const actual = CATALOG.reduce((sum, c) => sum + (c.documents?.length ?? 0), 0);
    expect(TEMPLATES_COUNT).toBe(actual);
  });

  it("SECTORS_COUNT съответства на секторите", () => {
    expect(SECTORS_COUNT).toBe(SECTORS.length);
  });
});
