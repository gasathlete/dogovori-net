import { describe, it, expect } from "vitest";
import { SECTORS, getSubWizard } from "@/data/sectors";
import { REGISTRY } from "@/data/subWizardsGenerated";
import { inferPartyRoles, partiesAreCompatible } from "@/data/partyRoles";

describe("party roles inference", () => {
  it("infers Продавач/Купувач for purchase-sale contracts", () => {
    expect(inferPartyRoles("Договор за покупко-продажба на недвижим имот")).toEqual({
      a: "Продавач", b: "Купувач",
    });
    expect(inferPartyRoles("Окончателен договор за покупко-продажба")).toEqual({
      a: "Продавач", b: "Купувач",
    });
    expect(inferPartyRoles("Предварителен договор за покупко-продажба на МПС")).toEqual({
      a: "Продавач", b: "Купувач",
    });
  });

  it("infers Наемодател/Наемател for rental contracts", () => {
    expect(inferPartyRoles("Договор за наем на жилище")).toEqual({
      a: "Наемодател", b: "Наемател",
    });
  });

  it("infers Възложител/Изпълнител for service/works contracts", () => {
    expect(inferPartyRoles("Договор за изработка")).toEqual({
      a: "Възложител", b: "Изпълнител",
    });
  });

  it("infers Лицензодател/Лицензополучател for licence contracts", () => {
    expect(inferPartyRoles("Лицензионен договор за софтуер (EULA)")).toEqual({
      a: "Лицензодател", b: "Лицензополучател",
    });
  });

  it("flags incompatible party pairs", () => {
    expect(partiesAreCompatible("Договор за покупко-продажба", {
      a: "Наемодател", b: "Наемател",
    })).toBe(false);
    expect(partiesAreCompatible("Договор за покупко-продажба", {
      a: "Продавач", b: "Купувач",
    })).toBe(true);
  });
});

describe("getSubWizard enforces correct roles", () => {
  // The critical regression the user reported: a sale contract under the
  // "real-estate" sector must NOT inherit "Наемодател/Наемател".
  it("does not leak rental roles into a sale contract under real-estate", () => {
    const sector = SECTORS.find((s) => s.id === "real-estate")!;
    const sw = getSubWizard(sector, "Договор за покупко-продажба на недвижим имот");
    expect(sw).toBeTruthy();
    const parties = sw!.parties!;
    expect(parties.a.toLowerCase()).toMatch(/продав/);
    expect(parties.b.toLowerCase()).toMatch(/купув/);
  });

  it("does not leak Продавач/Купувач into a rental contract under vehicles", () => {
    const sector = SECTORS.find((s) => s.id === "vehicles");
    if (!sector) return;
    const sw = getSubWizard(sector, "Договор за наем на МПС");
    expect(sw).toBeTruthy();
    const parties = sw!.parties!;
    expect(parties.a.toLowerCase()).toMatch(/наемодат/);
    expect(parties.b.toLowerCase()).toMatch(/наемат/);
  });
});

describe("registry-wide invariant", () => {
  it("every REGISTRY entry has parties compatible with its name", () => {
    const offenders: string[] = [];
    for (const [docName, entry] of Object.entries(REGISTRY)) {
      const e: any = entry;
      const expected = inferPartyRoles(e.contractName || docName);
      if (!expected || !e.parties) continue;
      if (!partiesAreCompatible(e.contractName || docName, e.parties)) {
        offenders.push(`${docName} — got {${e.parties.a}, ${e.parties.b}}, expected {${expected.a}, ${expected.b}}`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("every (sector, sub-wizard) pair resolves to compatible parties", () => {
    const offenders: string[] = [];
    for (const sector of SECTORS) {
      for (const sw of sector.subWizards ?? []) {
        const docName = sw.contractName || sw.documentName;
        const resolved = getSubWizard(sector, sw.documentName);
        const parties = resolved?.parties ?? sector.parties;
        if (!partiesAreCompatible(docName, parties)) {
          offenders.push(`[${sector.id}] ${docName} — got {${parties.a}, ${parties.b}}`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
