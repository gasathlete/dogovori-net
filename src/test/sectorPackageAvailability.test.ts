import { describe, expect, it } from "vitest";
import { allTemplates } from "@/lib/templateIndex";
import { getDeclaredSectorPackageAvailability, getSectorPackageAvailability, SECTOR_PACKAGES } from "@/data/sectorPackages";

// Началната страница брои декларираните позиции без да зарежда каталога.
// Този тест пази броя от тихо разминаване с каноничния каталог.
describe("sector package availability without catalog", () => {
  const names = new Set(allTemplates().map((entry) => entry.doc.name));
  it.each(SECTOR_PACKAGES.map((p) => [p.slug, p] as const))("%s declared counts equal catalog-verified counts", (_slug, item) => {
    expect(getDeclaredSectorPackageAvailability(item)).toEqual(getSectorPackageAvailability(item, names));
  });
  it("every browseable document name resolves in the catalog", () => {
    const missing = SECTOR_PACKAGES.flatMap((p) => p.documents).filter((d) => d.status === "browseable" && !names.has(d.docName ?? ""));
    expect(missing).toEqual([]);
  });
});
