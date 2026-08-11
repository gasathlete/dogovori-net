import { describe, it, expect } from "vitest";
import { SECTORS, buildQuestions, flattenQuestions } from "@/data/sectors";

const find = (sectorId: string, docName: string) => {
  const sector = SECTORS.find((s) => s.id === sectorId)!;
  const sub = sector.subWizards?.find((w) => w.documentName === docName)!;
  return flattenQuestions(buildQuestions(sector, sub)).map((q) => q.label.toLowerCase());
};

describe("тематична релевантност на секторните въпроси", () => {
  it("договор за заем не показва счетоводни секторни въпроси", () => {
    const labels = find("accounting", "Договор за заем на парични средства");
    expect(labels.some((l) => l.includes("обем документи"))).toBe(false);
    expect(labels.some((l) => l.includes("месечна такса"))).toBe(false);
  });

  it("основният документ на сектора запазва всички секторни въпроси", () => {
    const labels = find("real-estate", "Договор за наем на жилище");
    expect(labels.some((l) => l.includes("месечен наем"))).toBe(true);
    expect(labels.some((l) => l.includes("депозит"))).toBe(true);
  });

  it("универсалните условия (стойност/срок) не се изрязват", () => {
    const labels = find("it", "Data Processing Agreement (DPA по GDPR)").concat(
      find("services", "Договор за консултантски услуги"),
    );
    expect(labels.length).toBeGreaterThan(0);
  });
});
