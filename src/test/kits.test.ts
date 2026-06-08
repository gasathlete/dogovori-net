import { describe, it, expect } from "vitest";
import { DOCUMENT_KITS } from "@/data/documentKits";
import { CATALOG } from "@/data/catalog";
import { LIFE_SCENARIOS } from "@/data/lifeScenarios";

describe("Document kits integrity", () => {
  const docNames = new Set<string>();
  for (const cat of CATALOG) for (const d of cat.documents) docNames.add(d.name);

  it("every kit item references an existing catalog document", () => {
    const missing: Array<{ kitId: string; docName: string }> = [];
    for (const k of DOCUMENT_KITS) {
      for (const it of k.items) {
        if (!docNames.has(it.docName)) {
          missing.push({ kitId: k.id, docName: it.docName });
        }
      }
    }
    expect(missing, `Missing docs:\n${missing.map((m) => ` - ${m.kitId}: ${m.docName}`).join("\n")}`).toEqual([]);
  });

  it("every life scenario points to an existing kit or has an href", () => {
    const kitIds = new Set(DOCUMENT_KITS.map((k) => k.id));
    for (const s of LIFE_SCENARIOS) {
      if (s.kitId) expect(kitIds.has(s.kitId), `scenario ${s.id} -> kit ${s.kitId}`).toBe(true);
      else expect(s.href, `scenario ${s.id} needs href when kitId is missing`).toBeTruthy();
    }
  });

  it("each kit has at least one primary item", () => {
    for (const k of DOCUMENT_KITS) {
      const hasPrimary = k.items.some((i) => i.role === "primary");
      expect(hasPrimary, `kit ${k.id} missing primary`).toBe(true);
    }
  });
});
