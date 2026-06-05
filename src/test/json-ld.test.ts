import { describe, it, expect } from "vitest";
import {
  buildAiFeaturesSchemas,
  buildKartaSchemas,
  validateAll,
  validateJsonLd,
} from "@/lib/seo/schemas";
import { CATALOG } from "@/data/catalog";
import { SECTORS } from "@/data/sectors";
import { allTemplates } from "@/lib/templateIndex";

describe("JSON-LD schemas", () => {
  describe("/ai (AIFeatures)", () => {
    const blocks = buildAiFeaturesSchemas();

    it("contains SoftwareApplication, FAQPage, HowTo and BreadcrumbList", () => {
      const types = blocks.map((b) => b["@type"]).sort();
      expect(types).toEqual(["BreadcrumbList", "FAQPage", "HowTo", "SoftwareApplication"]);
    });

    it("validates without errors", () => {
      const errors = validateAll(blocks);
      expect(errors).toEqual([]);
    });

    it("SoftwareApplication advertises ≥3 offers in EUR", () => {
      const sw = blocks.find((b) => b["@type"] === "SoftwareApplication")!;
      expect(Array.isArray(sw.offers)).toBe(true);
      expect(sw.offers.length).toBeGreaterThanOrEqual(3);
      for (const o of sw.offers) expect(o.priceCurrency).toBe("EUR");
    });

    it("FAQPage has ≥5 well-formed questions", () => {
      const faq = blocks.find((b) => b["@type"] === "FAQPage")!;
      expect(faq.mainEntity.length).toBeGreaterThanOrEqual(5);
    });

    it("HowTo lists 5 ordered steps with non-empty text", () => {
      const how = blocks.find((b) => b["@type"] === "HowTo")!;
      expect(how.step).toHaveLength(5);
      how.step.forEach((s: any, i: number) => {
        expect(s.position).toBe(i + 1);
        expect(s.text.length).toBeGreaterThan(20);
      });
    });

    it("JSON.stringify round-trips without exceptions", () => {
      for (const b of blocks) {
        const json = JSON.stringify(b);
        expect(() => JSON.parse(json)).not.toThrow();
        expect(json.length).toBeGreaterThan(50);
      }
    });
  });

  describe("/karta (TemplateDirectory)", () => {
    const templates = allTemplates().map((t) => ({ slug: t.slug, name: t.doc.name }));
    const blocks = buildKartaSchemas({
      templates,
      categoryCount: CATALOG.length,
      sectorCount: SECTORS.length,
      categoryTitles: CATALOG.map((c) => c.title),
    });

    it("contains ItemList and CollectionPage", () => {
      const types = blocks.map((b) => b["@type"]).sort();
      expect(types).toEqual(["CollectionPage", "ItemList"]);
    });

    it("validates without errors", () => {
      const errors = validateAll(blocks);
      expect(errors).toEqual([]);
    });

    it("ItemList enumerates real templates with absolute URLs", () => {
      const list = blocks.find((b) => b["@type"] === "ItemList")!;
      expect(list.numberOfItems).toBe(templates.length);
      expect(list.itemListElement.length).toBeGreaterThan(0);
      for (const item of list.itemListElement) {
        expect(item.url).toMatch(/^https:\/\/dogovori\.net\/shablon\//);
        expect(typeof item.name).toBe("string");
        expect(item.name.length).toBeGreaterThan(0);
      }
    });
  });

  describe("validator self-tests", () => {
    it("rejects missing @context", () => {
      const errs = validateJsonLd({ "@type": "FAQPage", mainEntity: [] } as any);
      expect(errs.some((e) => e.message.includes("@context"))).toBe(true);
    });

    it("rejects FAQPage with malformed question", () => {
      const errs = validateJsonLd({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [{ "@type": "Question", name: "X" }],
      });
      expect(errs.some((e) => e.path.includes("acceptedAnswer"))).toBe(true);
    });

    it("rejects SoftwareApplication missing offers", () => {
      const errs = validateJsonLd({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "X",
        applicationCategory: "BusinessApplication",
        featureList: ["a"],
      });
      expect(errs.some((e) => e.path.endsWith(".offers"))).toBe(true);
    });
  });
});
