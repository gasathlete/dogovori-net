/**
 * „SEO template intent v1" — тесен конверсионен експеримент за точно три
 * канонични SEO шаблона.
 *
 * Инварианти, които тестът пази:
 *  - allowlist-ът е точно трите slug-а и копието е точно като одобреното;
 *  - eligible страниците ползват конфигурирания primary label и intent панел,
 *    който се рендира и когато има `draftText`;
 *  - импресията е дедупликирана през `dedupKey`;
 *  - `template_create_cta_clicked` се запазва и получава low-cardinality
 *    `variant`;
 *  - preview-first линкът води към уизарда БЕЗ `blank=1` и не минава през
 *    `requireAuth`;
 *  - baseline шаблоните запазват стария hero линк с `blank=1`;
 *  - каноничните slug-ове/маршрути са байт-идентични;
 *  - противоречието „2 срещу 3 минути" не може да се върне.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SEO_INTENT_BASELINE,
  SEO_INTENT_BLANK_LINK_LABEL,
  SEO_INTENT_SLUGS,
  SEO_INTENT_SUPPORT_LINE,
  SEO_INTENT_VERSION,
  getSeoTemplateIntent,
  isSeoIntentSlug,
  seoIntentVariant,
} from "@/lib/seoTemplateIntent";
import { getTemplateBySlug } from "@/lib/templateIndex";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const src = read("src/pages/Template.tsx");

const PROTOCOL = "priemo-predavatelen-protokol";
const PARKING = "dogovor-za-naem-na-parkomyasto-garazh";
const RESIGNATION = "molba-za-napuskane-chl-326-al-1-kt";

describe("seoTemplateIntent — allowlist и копие", () => {
  it("allowlist-ът е точно трите slug-а", () => {
    expect([...SEO_INTENT_SLUGS]).toEqual([PROTOCOL, PARKING, RESIGNATION]);
  });

  it("непопадащите slug-ове не са eligible", () => {
    for (const s of ["dogovor-za-naem-na-zhilishte", "trudov-dogovor", "", undefined]) {
      expect(isSeoIntentSlug(s as string | undefined)).toBe(false);
      expect(getSeoTemplateIntent(s as string | undefined)).toBeUndefined();
    }
  });

  it("вариантът е low-cardinality: seo_intent_v1 / baseline", () => {
    expect(SEO_INTENT_VERSION).toBe("seo_intent_v1");
    expect(SEO_INTENT_BASELINE).toBe("baseline");
    for (const s of SEO_INTENT_SLUGS) expect(seoIntentVariant(s)).toBe("seo_intent_v1");
    expect(seoIntentVariant("trudov-dogovor")).toBe("baseline");
  });

  it("протоколът има точния етикет и точните три доказателствени точки", () => {
    const c = getSeoTemplateIntent(PROTOCOL)!;
    expect(c.primaryLabel).toBe("Попълни протокола");
    expect([...c.proofPoints]).toEqual([
      "Състояние, ключове, вещи и показания",
      "Място за забележки и подписи",
      "Редактирате преди сваляне",
    ]);
  });

  it("паркомястото има точния етикет и точните три доказателствени точки", () => {
    const c = getSeoTemplateIntent(PARKING)!;
    expect(c.primaryLabel).toBe("Изготви договора");
    expect([...c.proofPoints]).toEqual([
      "Наем, депозит и срок",
      "Достъп, предназначение и правила",
      "Редактирате преди сваляне",
    ]);
  });

  it("молбата за напускане има точния етикет и точните три доказателствени точки", () => {
    const c = getSeoTemplateIntent(RESIGNATION)!;
    expect(c.primaryLabel).toBe("Подготви предизвестието");
    expect([...c.proofPoints]).toEqual([
      "Дата на получаване и срок на предизвестието",
      "Данни за работодателя и длъжността",
      "Редактирате преди сваляне",
    ]);
  });

  it("подкрепящата линия и текстовият линк са точните честни формулировки", () => {
    expect(SEO_INTENT_SUPPORT_LINE).toBe("Старт и работен преглед без регистрация.");
    expect(SEO_INTENT_BLANK_LINK_LABEL).toBe("Търсите празна бланка? Отворете редактора");
  });

  it("копието не съдържа правни гаранции, юрист-ревю, дефицит, отзиви или цени", () => {
    const all = [
      SEO_INTENT_SUPPORT_LINE,
      SEO_INTENT_BLANK_LINK_LABEL,
      ...SEO_INTENT_SLUGS.flatMap((s) => {
        const c = getSeoTemplateIntent(s)!;
        return [c.primaryLabel, ...c.proofPoints];
      }),
    ].join(" ");
    for (const banned of [
      /гарант/i,
      /юрист/i,
      /адвокат/i,
      /провер(ен|ено) от/i,
      /последн[ии]\s+мест/i,
      /само днес/i,
      /отзив/i,
      /€|EUR|лв/,
      /\d+\s*минут/i,
    ]) {
      expect(all, `забранена формулировка: ${banned}`).not.toMatch(banned);
    }
  });
});

describe("Template.tsx — eligible поведение", () => {
  it("hero CTA ползва конфигурирания етикет, а baseline запазва стария", () => {
    expect(src).toContain('{intent ? intent.primaryLabel : "Изготви за 3 минути"}');
  });

  it("intent панелът се рендира веднага след intro и НЕ зависи от draftText", () => {
    const introIdx = src.indexOf("{intro && (");
    const panelIdx = src.indexOf("{intent && (");
    const draftIdx = src.indexOf("{!draftText && (");
    expect(introIdx).toBeGreaterThan(-1);
    expect(panelIdx).toBeGreaterThan(introIdx);
    expect(panelIdx).toBeLessThan(draftIdx);
    const panel = src.slice(panelIdx, draftIdx);
    expect(panel).not.toContain("draftText");
    expect(panel).toContain("intent.proofPoints.map");
    expect(panel).toContain("SEO_INTENT_SUPPORT_LINE");
    expect(panel).toContain('aria-labelledby="intent-panel-title"');
    // Един визуално доминиращ златен CTA в панела.
    expect(panel.match(/btn-gold/g) ?? []).toHaveLength(1);
  });

  it("генеричният content CTA не се дублира за eligible страница", () => {
    expect(src).toContain("{intent ? null : (");
    const dup = src.slice(src.indexOf("{!draftText && ("));
    expect(dup.slice(0, dup.indexOf("Изготви документа сега"))).toContain("{intent ? null : (");
  });

  it("импресията е веднъж на сесия × slug × версия през dedupKey", () => {
    expect(src).toContain('"template_intent_panel_viewed"');
    const start = src.indexOf('"template_intent_panel_viewed"');
    const eff = src.slice(start, src.indexOf("}, [entry?.slug]);", start));
    expect(eff).toContain("dedupKey: `${s}|${SEO_INTENT_VERSION}`");
    expect(eff).toContain("variant: SEO_INTENT_VERSION");
    expect(eff).not.toContain("doc.name");
  });

  it("template_create_cta_clicked е запазено и добавя variant", () => {
    expect(src).toContain('trackFunnelEvent("template_create_cta_clicked"');
    const fn = src.slice(src.indexOf("const trackCreateCta"), src.indexOf("const trackBlankCta"));
    expect(fn).toContain("variant: intentVariant");
    expect(fn).toContain("slug: entry.slug");
    expect(fn).toContain("doc_key: journeyDocKey");
    expect(fn).toContain("startDocumentJourney(journeyDocKey)");
    expect(fn).toContain("authenticated: Boolean(user)");
    expect(fn).not.toContain("doc.name");
  });

  it("preview-first линкът е отделно събитие с position content и variant seo_intent_v1", () => {
    expect(src).toContain('trackFunnelEvent("template_blank_preview_clicked"');
    const fn = src.slice(src.indexOf("const trackBlankPreview"), src.indexOf("const pageTitle"));
    expect(fn).toContain('position: "content"');
    expect(fn).toContain("variant: SEO_INTENT_VERSION");
    expect(fn).toContain("slug: entry.slug");
    expect(fn).toContain("doc_key: journeyDocKey");
    expect(fn).toContain("startDocumentJourney(journeyDocKey)");
    expect(fn).not.toContain("doc.name");
  });

  it("историческите имена на събития са запазени", () => {
    expect(src).toContain('trackFunnelEvent("template_blank_cta_clicked"');
    expect(src).toContain("template_view");
  });

  it("preview-first линкът сочи към wizardHref БЕЗ blank=1", () => {
    const panel = src.slice(src.indexOf("{intent && ("), src.indexOf("{!draftText && ("));
    const link = panel.slice(panel.indexOf("onClick={trackBlankPreview}") - 200, panel.indexOf(SEO_INTENT_BLANK_LINK_LABEL));
    expect(link).toContain("to={wizardHref}");
    expect(link).not.toContain("blankWizardHref");
    expect(panel).not.toContain("blank=1");
  });

  it("нито създаването, нито preview линкът минават през requireAuth", () => {
    const panel = src.slice(src.indexOf("{intent && ("), src.indexOf("{!draftText && ("));
    expect(panel).not.toContain("requireAuth");
    const hero = src.slice(src.indexOf("<header"), src.indexOf("</header>"));
    expect(hero).not.toContain("requireAuth");
  });

  it("baseline шаблоните запазват hero линка за празна бланка с blank=1", () => {
    expect(src).toContain("&blank=1&returnTo=");
    const heroBlank = src.slice(src.indexOf("{intent ? null : ("), src.lastIndexOf("Свали само бланка"));
    expect(heroBlank).toContain("to={blankWizardHref}");
    expect(heroBlank).toContain('trackBlankCta("hero")');
  });
});

describe("Template.tsx — без противоречие за времето", () => {
  it("няма обещание „2 минути“ в копието", () => {
    expect(src).not.toMatch(/Готов за 2 минути/);
    expect(src).toContain("Кратък, насочван въпросник");
  });

  it("има най-много едно времево обещание в видимото копие", () => {
    const claims = src.match(/за\s\d+\sминути/g) ?? [];
    expect(new Set(claims).size).toBeLessThanOrEqual(1);
  });
});

describe("канонични инварианти", () => {
  it("трите slug-а резолват непроменени и с непроменен canonical", () => {
    for (const slug of SEO_INTENT_SLUGS) {
      const e = getTemplateBySlug(slug);
      expect(e, slug).toBeTruthy();
      expect(e!.slug).toBe(slug);
    }
    expect(getTemplateBySlug(PROTOCOL)!.doc.name).toBe("Приемно-предавателен протокол");
    expect(getTemplateBySlug(PROTOCOL)!.slug).toBe("priemo-predavatelen-protokol");
  });

  it("canonical и wizardHref конструкцията са непроменени", () => {
    expect(src).toContain("const canonical = `/shablon/${entry.slug}`");
    expect(src).toContain("`/wizard/${category.sectorId}?doc=${encodeURIComponent(doc.name)}`");
    expect(src).toContain("`/wizard-bilingual/${category.sectorId}?doc=${encodeURIComponent(doc.name)}`");
  });
});
