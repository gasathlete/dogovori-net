import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { formatSeoTitle, formatSeoDescription, hasBulgarianPrimaryContent } from "../lib/seoText";
import { PRODUCTS_SEO, ONE_TIME_PRODUCTS } from "../lib/products";
import { SECTOR_PACKAGES } from "../data/sectorPackages";

describe("meaning-preserving shared SEO metadata", () => {
  it("leaves a short title intact", () => {
    expect(formatSeoTitle("Общи условия · Dogovori.net")).toBe("Общи условия · Dogovori.net");
  });
  it("removes optional boilerplate but never cuts a precise document name", () => {
    const name = "Допълнително споразумение за преминаване от срочен в безсрочен трудов договор";
    expect(formatSeoTitle(`${name} — образец на български | Dogovori.net`)).toBe(name);
    expect(formatSeoTitle(`${name} — образец на български`)).toBe(name);
  });
  it("keeps qualifications at the end of a long description", () => {
    const description = `${"Описание ".repeat(22)}след вход и според плана.`;
    expect(formatSeoDescription(description)).toBe(description);
  });
  it("uses the same formatter for React and the initial HTML", () => {
    for (const file of ["src/components/Seo.tsx", "scripts/prerender.ts"]) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain("formatSeoTitle(");
      expect(source).toContain("formatSeoDescription(");
    }
  });
  it("keeps product and package descriptions concise without chopping sentences", () => {
    for (const description of [PRODUCTS_SEO.description, ...ONE_TIME_PRODUCTS.map(p => p.page.metaDescription), ...SECTOR_PACKAGES.map(p => p.seoDescription ?? `${p.audience} ${p.outcome}`)]) {
      expect(description.length).toBeLessThanOrEqual(160);
      expect(description).not.toContain("…");
    }
  });
  it("identifies only public Bulgarian content aliases, never private flows", () => {
    for (const path of ["/catalog", "/shablon/example", "/blog", "/blog/example", "/en/shablon/example", "/en/blog/example"]) expect(hasBulgarianPrimaryContent(path)).toBe(true);
    for (const path of ["/account", "/wizard/example", "/produkti/example/start", "/", "/enough/blog"]) expect(hasBulgarianPrimaryContent(path)).toBe(false);
  });
});
