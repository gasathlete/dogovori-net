import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildTemplatePageDescription,
  truncateOnWordBoundary,
  TEMPLATE_META_MAX,
} from "@/lib/resolveTemplatePresentation";
import {
  getSeoTemplateMeta,
  SEO_TEMPLATE_META_MATCHES_INTENT,
  SEO_TEMPLATE_META_SLUGS,
} from "@/lib/seoTemplateMeta";
import { SEO_INTENT_SLUGS } from "@/lib/seoTemplateIntent";
import { CATALOG } from "@/data/catalog";
import { slugify } from "@/lib/slugify";

const len = (s: string) => [...s].length;
const templateSrc = fs.readFileSync(path.resolve("src/pages/Template.tsx"), "utf8");

describe("Organic 2 — точни overrides за трите high-intent slug-а", () => {
  it("allowlist-ът е точно трите slug-а и съвпада със seo_intent_v1", () => {
    expect([...SEO_TEMPLATE_META_SLUGS]).toEqual([
      "priemo-predavatelen-protokol",
      "dogovor-za-naem-na-parkomyasto-garazh",
      "molba-za-napuskane-chl-326-al-1-kt",
    ]);
    expect([...SEO_TEMPLATE_META_SLUGS].sort()).toEqual([...SEO_INTENT_SLUGS].sort());
    expect(SEO_TEMPLATE_META_MATCHES_INTENT).toBe(true);
    expect(getSeoTemplateMeta("dogovor-za-naem-na-zhilishte")).toBeUndefined();
    expect(getSeoTemplateMeta(undefined)).toBeUndefined();
  });

  it("низовете са точно зададените", () => {
    expect(getSeoTemplateMeta("priemo-predavatelen-protokol")).toEqual({
      slug: "priemo-predavatelen-protokol",
      title: "Приемно-предавателен протокол — Word/PDF образец",
      description:
        "Приемно-предавателен протокол — онлайн образец на български. Попълнете и прегледайте без регистрация; PDF/DOCX след вход според плана.",
    });
    expect(getSeoTemplateMeta("dogovor-za-naem-na-parkomyasto-garazh")).toEqual({
      slug: "dogovor-za-naem-na-parkomyasto-garazh",
      title: "Договор за наем на паркомясто/гараж — Word/PDF образец",
      description:
        "Договор за наем на паркомясто или гараж — онлайн образец. Попълнете и прегледайте без регистрация; PDF/DOCX след вход според плана.",
    });
    expect(getSeoTemplateMeta("molba-za-napuskane-chl-326-al-1-kt")).toEqual({
      slug: "molba-za-napuskane-chl-326-al-1-kt",
      title: "Молба за напускане по чл. 326 — Word/PDF образец",
      description:
        "Молба за напускане по чл. 326, ал. 1 КТ — онлайн образец. Попълнете и прегледайте без регистрация; PDF/DOCX след вход според плана.",
    });
  });

  it("дължините са в рамките на SEO бюджета", () => {
    const expectedTitles = [48, 54, 48];
    const expectedDescs = [134, 131, 131];
    SEO_TEMPLATE_META_SLUGS.forEach((slug, i) => {
      const m = getSeoTemplateMeta(slug)!;
      expect(len(m.title)).toBe(expectedTitles[i]);
      expect(len(m.description)).toBe(expectedDescs[i]);
      expect(len(m.description)).toBeLessThanOrEqual(TEMPLATE_META_MAX);
    });
  });

  it("overrides се прилагат в Template.tsx за title и description, без да пипат H1", () => {
    expect(templateSrc).toMatch(/const metaOverride = getSeoTemplateMeta\(entry\.slug\) \?\? discovery;/);
    expect(templateSrc).toMatch(
      /const pageTitle = metaOverride\?\.title \?\? `\$\{doc\.name\} — образец на български`;/,
    );
    expect(templateSrc).toMatch(
      /const pageDesc = metaOverride\?\.description \?\? buildTemplatePageDescription\(\{ docName: doc\.name \}\);/,
    );
    // H1 остава каноничното име на документа.
    expect(templateSrc).toMatch(/<h1[^>]*>\s*\n\s*\{doc\.name\}/);
    expect(templateSrc).not.toMatch(/<h1[^>]*>\s*\n\s*\{(metaOverride|pageTitle)/);
  });
});

describe("Organic 2 — честно генерично описание", () => {
  it("никога не обещава безплатно изтегляне или време", () => {
    for (const cat of CATALOG) {
      for (const doc of cat.documents.slice(0, 12)) {
        const d = buildTemplatePageDescription({ docName: doc.name });
        expect(len(d)).toBeLessThanOrEqual(TEMPLATE_META_MAX);
        expect(d).not.toMatch(/безплат/i);
        expect(d).not.toMatch(/за 2 минути/i);
        expect(d).not.toMatch(/изтегли\b/i);
        expect(d).toContain("след вход според плана");
      }
    }
  });

  it("къси имена минават без отрязване", () => {
    const d = buildTemplatePageDescription({ docName: "Разписка" });
    expect(d).toBe(
      "Разписка — онлайн образец на български. Попълнете и прегледайте без регистрация; PDF/DOCX след вход според плана.",
    );
    expect(d).not.toContain("…");
  });

  it("много дълго име се отрязва по граница на дума, не в средата", () => {
    const longName =
      "Договор за наем на недвижим имот с опция за изкупуване и допълнителни клаузи за поддръжка";
    const d = buildTemplatePageDescription({ docName: longName });
    expect(len(d)).toBeLessThanOrEqual(TEMPLATE_META_MAX);
    expect(d).toContain("…");
    const namePart = d.split(" — онлайн образец")[0].replace(/…$/, "");
    // Отрязаната част завършва на цяла дума от оригинала.
    const words = longName.split(" ");
    const lastWord = namePart.split(" ").pop()!;
    expect(words).toContain(lastWord);
    expect(longName.startsWith(namePart)).toBe(true);
    expect(d.endsWith("след вход според плана.")).toBe(true);
  });

  it("truncateOnWordBoundary не среже в средата на дума", () => {
    expect(truncateOnWordBoundary("едно две три", 100)).toBe("едно две три");
    const t = truncateOnWordBoundary("едно две три четири", 12);
    expect(len(t)).toBeLessThanOrEqual(12);
    expect(t.endsWith("…")).toBe(true);
    expect("едно две три четири".startsWith(t.replace(/…$/, ""))).toBe(true);
  });
});

describe("Organic 2 — структурирани данни на /shablon", () => {
  it("масивът съдържа BreadcrumbList, Article и FAQPage (FAQPage — след settle)", () => {
    expect(templateSrc).toMatch(
      /const jsonLd = contentSettled\s*\?\s*\[breadcrumbsLd, articleLd, faqLd\]\s*:\s*\[breadcrumbsLd, articleLd\];/,
    );
    expect(templateSrc).toMatch(/jsonLd=\{jsonLd\}/);
    expect(templateSrc).toMatch(/"@type": "BreadcrumbList"/);
    expect(templateSrc).toMatch(/"@type": "Article"/);
    expect(templateSrc).toMatch(/"@type": "FAQPage"/);
  });


  it("няма Product / HowTo / нулева цена", () => {
    expect(templateSrc).not.toMatch(/"@type": "Product"/);
    expect(templateSrc).not.toMatch(/"@type": "HowTo/);
    expect(templateSrc).not.toMatch(/productLd/);
    expect(templateSrc).not.toMatch(/howToLd/);
    expect(templateSrc).not.toMatch(/price: "0"/);
    expect(templateSrc).not.toMatch(/priceCurrency/);
    expect(templateSrc).not.toMatch(/AggregateOffer/);
  });
});

describe("Organic 2 — непроменени инварианти", () => {
  it("каноничният slug и wizardHref остават байт-идентични", () => {
    expect(slugify("Приемно-предавателен протокол")).toBe("priemo-predavatelen-protokol");
    expect(templateSrc).toMatch(/canonical = `\/shablon\/\$\{entry\.slug\}`/);
    expect(templateSrc).not.toMatch(/priemno-predavatelen-protokol/);
  });

  it("конверсионният seo_intent_v1 UI и събитията са непроменени", () => {
    expect(templateSrc).toMatch(/template_intent_panel_viewed/);
    expect(templateSrc).toMatch(/template_create_cta_clicked/);
    expect(templateSrc).toMatch(/template_blank_preview_clicked/);
    expect(templateSrc).toMatch(/getSeoTemplateIntent/);
    expect(templateSrc).toMatch(/SEO_INTENT_SUPPORT_LINE/);
    expect(templateSrc).toMatch(/SEO_INTENT_BLANK_LINK_LABEL/);
  });
});

const prerenderSrc = fs.readFileSync(path.resolve("scripts/prerender.ts"), "utf8");

/** Извлича точния title израз от prerender и го изчислява като функция. */
function prerenderTitle(metaOverride: { title: string } | undefined, doc: { name: string }): string {
  const m = prerenderSrc.match(
    /path: `\/shablon\/\$\{slug\}`,\n(?:\s*\/\/[^\n]*\n)*\s*title: ([\s\S]*?),\n\n/,
  );
  if (!m) throw new Error("prerender title израз не е намерен");
  const fn = new Function("metaOverride", "doc", `return (${m[1]});`) as (
    o: unknown,
    d: unknown,
  ) => string;
  return fn(metaOverride, doc);
}

describe("Organic 2 — prerender заглавия", () => {
  it("трите override заглавия се емитират точно, без брандов суфикс", () => {
    for (const slug of SEO_TEMPLATE_META_SLUGS) {
      const meta = getSeoTemplateMeta(slug)!;
      const emitted = prerenderTitle(meta, { name: "Име на документа" });
      expect(emitted).toBe(meta.title);
      expect(emitted).not.toMatch(/Dogovori\.net/);
    }
    expect(prerenderTitle(getSeoTemplateMeta("priemo-predavatelen-protokol"), { name: "x" })).toBe(
      "Приемно-предавателен протокол — Word/PDF образец",
    );
    expect(
      prerenderTitle(getSeoTemplateMeta("dogovor-za-naem-na-parkomyasto-garazh"), { name: "x" }),
    ).toBe("Договор за наем на паркомясто/гараж — Word/PDF образец");
    expect(
      prerenderTitle(getSeoTemplateMeta("molba-za-napuskane-chl-326-al-1-kt"), { name: "x" }),
    ).toBe("Молба за напускане по чл. 326 — Word/PDF образец");
  });

  it("генеричните заглавия съвпадат с runtime без допълнителен брандов суфикс", () => {
    expect(prerenderTitle(undefined, { name: "Разписка" })).toBe(
      "Разписка — образец на български",
    );
    expect(templateSrc).toContain('`${doc.name} — образец на български`');
  });
});

describe("Organic 2 — един свръхдълъг токен не се реже", () => {
  it("не се емитира частичен фрагмент от токена", () => {
    const token = "Д".repeat(210);
    const d = buildTemplatePageDescription({ docName: token });
    expect(len(d)).toBeLessThanOrEqual(TEMPLATE_META_MAX);
    expect(d).not.toContain("ДД");
    expect(d.startsWith("Документ…")).toBe(true);
    expect(d.endsWith("след вход според плана.")).toBe(true);
    expect(truncateOnWordBoundary(token, 20)).toBe("Документ…");
  });
});
