/**
 * P0 trust + SEO инварианти за статичното предварително рендиране.
 *
 * 1) `scripts/prerender.ts` минава през същия правен guard като runtime-а —
 *    за защитените (недоговорни) видове генерираното AI съдържание не влиза
 *    в статичния HTML.
 * 2) Маркирането `data-prerendered="true"` покрива route-specific head тагове,
 *    а `src/main.tsx` ги маха преди Helmet да монтира своите — така hydrated
 *    DOM има точно по един набор.
 * 3) Няма фалшиви търговски/правни твърдения в статичното копие.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.resolve(p), "utf8");

const prerender = read("scripts/prerender.ts");
const mainTsx = read("src/main.tsx");
const indexHtml = read("index.html");

describe("scripts/prerender.ts — правен guard", () => {
  it("ползва общия резолвер вместо собствена логика", () => {
    expect(prerender).toContain("resolveTemplatePresentation");
    expect(prerender).toContain("buildTemplateFallbackContent");
    expect(prerender).toContain("buildTemplatePageDescription");
  });

  it("защитените шаблони не публикуват AI intro/реквизити/ЧЗВ", () => {
    expect(prerender).toContain("const intro = resolved.guarded ? doc.purpose : legacyIntro;");
    expect(prerender).toMatch(/resolved\.guarded \? resolved\.requirements : legacyRequirements/);
    expect(prerender).toMatch(/resolved\.guarded \? resolved\.faq : legacyFaq/);
    expect(prerender).toMatch(/resolved\.guarded\s*\?\s*resolved\.usageCases/);
    expect(prerender).toMatch(/resolved\.guarded\s*\?\s*resolved\.mistakes/);
  });

  it("meta и Article описанието са неутрални при защитените", () => {
    expect(prerender).toMatch(/description: resolved\.guarded \? guardedDesc : doc\.purpose/);
    expect(prerender).toMatch(/resolved\.guarded\s*\?\s*guardedDesc/);
  });

  it("няма фалшиви твърдения за юристи, безусловна безплатност и eIDAS", () => {
    expect(prerender).not.toContain("подготвен от юристи");
    expect(prerender).not.toContain("първият документ е безплатен");
    expect(prerender).not.toContain("неограничено теглене");
    expect(prerender).not.toContain("признат от ЗЕДЕУУ и eIDAS");
    expect(prerender).toContain("FREE_OFFER_RULE");
  });
});

describe("route-specific head тагове", () => {
  it("prerender маркира description/canonical/og/twitter", () => {
    for (const attr of [
      'name="description"',
      'rel="canonical"',
      'property="og:url"',
      'property="og:title"',
      'property="og:description"',
      'property="og:type"',
      'name="twitter:title"',
      'name="twitter:description"',
    ]) {
      const re = new RegExp(`${attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\`]*data-prerendered="true"`);
      expect(prerender, attr).toMatch(re);
    }
  });


  it("index.html маркира същите route-specific тагове", () => {
    const marked = indexHtml.match(/data-prerendered="true"/g) ?? [];
    expect(marked.length).toBeGreaterThanOrEqual(8);
    expect(indexHtml).toMatch(/<meta name="robots"[^>]*data-prerendered="true"/);
    expect(indexHtml).toMatch(/<meta name="description"[^>]*data-prerendered="true"/);
  });

  it("main.tsx маха всички маркирани елементи, не само JSON-LD", () => {
    expect(mainTsx).toContain(`document.querySelectorAll("[data-prerendered='true']")`);
    expect(mainTsx).not.toContain('script[type="application/ld+json"][data-prerendered="true"]');
  });
});

describe("index.html — без остарели ценови/рейтинг твърдения", () => {
  it("SoftwareApplication няма стари offers и измислен aggregateRating", () => {
    expect(indexHtml).not.toContain("aggregateRating");
    expect(indexHtml).not.toContain("1.90");
    expect(indexHtml).not.toContain("10.90");
  });
});
