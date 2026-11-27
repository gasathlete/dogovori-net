import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DOCUMENT_KITS } from "../data/documentKits";
import { SECTOR_PACKAGES } from "../data/sectorPackages";
import { getKitSections } from "../data/featuredKitStages";
import { allTemplates } from "../lib/templateIndex";
import { getPackageGuides, getSectorPackagesForArticle, getSectorPackagesForDocument } from "../lib/seoCollections";
import { buildCollectionPages } from "../../scripts/lib/collectionPages";

describe("SEO growth: canonical collections and truthful static content", () => {
  const templates = allTemplates();
  const pages = buildCollectionPages(templates);
  const catalogPaths = new Set(templates.map((entry) => `/shablon/${entry.slug}`));

  it("gives every existing kit and package a distinct static page", () => {
    const paths = pages.map((page) => page.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const kit of DOCUMENT_KITS) expect(paths).toContain(`/komplekti/${kit.id}`);
    for (const item of SECTOR_PACKAGES) expect(paths).toContain(`/paketi/${item.slug}`);
    expect(paths).toContain("/komplekti");
    expect(paths).toContain("/paketi");
    for (const page of pages) {
      expect(page.bodyHtml.match(/<h1>/g)).toHaveLength(1);
      expect(page.jsonLd.some((schema) => schema["@type"] === "BreadcrumbList")).toBe(true);
      expect(page.bodyHtml).toContain("покупката остават затворени");
      for (const link of page.bodyHtml.matchAll(/href="(\/shablon\/[^\"]+)"/g)) expect(catalogPaths.has(link[1]), link[1]).toBe(true);
    }
  });

  it("keeps kit lifecycle order and all items exactly once", () => {
    for (const kit of DOCUMENT_KITS) {
      const sections = getKitSections(kit);
      expect(sections.flatMap((section) => section.items).map((item) => item.docName).sort()).toEqual(kit.items.map((item) => item.docName).sort());
      const html = pages.find((page) => page.path === `/komplekti/${kit.id}`)!.bodyHtml;
      const offsets = sections.filter(({ items, stage }) => items.length || stage.plannedItem).map(({ stage }) => html.indexOf(`<h3>${stage.label}</h3>`));
      expect(offsets.every((offset) => offset >= 0)).toBe(true);
      expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
      for (const { stage } of sections) if (stage.plannedItem) {
        expect(html).toContain(`<li>Планирано: ${stage.plannedItem}</li>`);
        expect(html).not.toContain(`>${stage.plannedItem}</a>`);
      }
    }
  });

  it("does not fabricate links for absent documents", () => {
    const withoutDocuments = buildCollectionPages([]);
    for (const page of withoutDocuments) expect(page.bodyHtml).not.toContain('href="/shablon/');
  });

  it("escapes canonical slugs before putting them into HTML attributes", () => {
    const name = SECTOR_PACKAGES[0].documents[0].docName!;
    const html = buildCollectionPages([{ doc: { name }, slug: 'x\" onclick=\"alert(1)' }]).find((page) => page.path === "/paketi/naemi")!.bodyHtml;
    expect(html).toContain('x&quot; onclick=&quot;alert(1)');
    expect(html).not.toContain('x" onclick="');
  });

  it("connects published guides and existing documents to their actual packages", () => {
    for (const item of SECTOR_PACKAGES) {
      const guides = getPackageGuides(item.id);
      expect(guides.length).toBeGreaterThanOrEqual(2);
      for (const guide of guides) expect(getSectorPackagesForArticle(guide.slug)).toContain(item);
      for (const document of item.documents.filter((entry) => entry.status === "browseable")) {
        expect(templates.some((entry) => entry.doc.name === document.docName), document.docName).toBe(true);
        expect(getSectorPackagesForDocument(document.docName!)).toContain(item);
      }
    }
    expect(getSectorPackagesForArticle("unpublished-or-unknown")).toEqual([]);
    expect(getSectorPackagesForDocument("not-in-catalog")).toEqual([]);
  });
});

describe("Search crawler privacy boundary", () => {
  it("allows OAI search with every existing private exclusion, while training stays blocked", () => {
    const robots = readFileSync("public/robots.txt", "utf8");
    const groups = new Map(robots.split(/User-agent:\s*/i).slice(1).map((group) => {
      const [agent, ...lines] = group.split(/\r?\n/);
      return [agent.trim(), lines.map((line) => line.replace(/#.*/, "").trim()).filter(Boolean)] as const;
    }));
    const search = groups.get("OAI-SearchBot")!;
    expect(search).toContain("Allow: /");
    expect(search).not.toContain("Disallow: /");
    expect(search.filter((line) => line.startsWith("Disallow:"))).toEqual(groups.get("*")!.filter((line) => line.startsWith("Disallow:")));
    expect(groups.get("GPTBot")).toContain("Disallow: /");
  });
});
