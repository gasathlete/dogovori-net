/**
 * P1 legal trust guard.
 *
 * Проверява, че генерираното (неревизирано) AI съдържание не може да върне
 * договорни или абсолютни правни твърдения в правните раздели на НЕдоговорните
 * страници `/shablon/:slug`, и че за договор/споразумение/анекс поведението
 * остава непроменено.
 *
 * Фикстурите са in-memory (умишлено „зловредни“/остарели) — тестът НЕ импортира
 * генерираните файлове от `src/data/templateContent/`.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { TemplateContent } from "@/data/templateContentTypes";
import { buildTemplateFallbackContent } from "@/lib/templateFallbackContent";
import {
  PROTECTED_DOCUMENT_TYPES,
  buildTemplatePageDescription,
  isProtectedFallback,
  resolveTemplatePresentation,
} from "@/lib/resolveTemplatePresentation";
import type { DocumentTypeId } from "@/lib/documentReferences";

const ai = (over: Partial<TemplateContent>): TemplateContent => ({
  intro: "Специфично въведение за конкретния документ.",
  usageCases: ["Конкретен случай на употреба 1.", "Конкретен случай 2."],
  requirements: ["Реквизит от AI."],
  mistakes: ["Грешка от AI."],
  faq: [{ q: "Въпрос от AI?", a: "Отговор от AI." }],
  ...over,
});

const joined = (r: { requirements: string[]; mistakes: string[]; faq: { q: string; a: string }[] }) =>
  [...r.requirements, ...r.mistakes, ...r.faq.flatMap((f) => [f.q, f.a])].join(" \n ");

describe("resolveTemplatePresentation — фактура", () => {
  const fallback = buildTemplateFallbackContent({ docName: "Фактура (образец)" });
  const malicious = ai({
    requirements: [
      "Подпис и печат на издателя (ако не е електронна фактура със защитен електронен подпис).",
      "Данни за получателя.",
    ],
    mistakes: ["Липса на подпис от отговорно лице или печат на издателя."],
    faq: [
      {
        q: "Задължителна ли е фактура?",
        a: "Да, всяко данъчно задължено лице е длъжно да издаде фактура за всяка доставка, без изключения.",
      },
    ],
  });

  it("класифицира фактурата като защитена", () => {
    expect(fallback.documentType).toBe("invoice");
    expect(isProtectedFallback(fallback)).toBe(true);
  });

  it("изхвърля твърденията за подпис/печат и „всяка доставка“", () => {
    const r = resolveTemplatePresentation(malicious, fallback);
    const text = joined(r);
    expect(text).not.toMatch(/печат на издателя/i);
    expect(text).not.toMatch(/Подпис и печат/i);
    expect(text).not.toMatch(/за всяка доставка, без изключения/i);
  });

  it("ползва ревизирания fallback с разграничението чл. 115/116 ЗДДС", () => {
    const r = resolveTemplatePresentation(malicious, fallback);
    expect(r.requirements).toBe(fallback.requirements);
    expect(r.mistakes).toBe(fallback.mistakes);
    expect(r.faq).toBe(fallback.faq);
    const text = joined(r);
    expect(text).toMatch(/чл\.\s*116\s*ЗДДС/);
    expect(text).toMatch(/чл\.\s*115\s*ЗДДС/);
  });
});

describe("resolveTemplatePresentation — предизвестие за прекратяване на наем", () => {
  const fallback = buildTemplateFallbackContent({
    docName: "Предизвестие за прекратяване на наем",
  });
  const stale = ai({
    requirements: ["Позоваване на чл. 228 КТ."],
    mistakes: ["Непосочване на срока по чл. 36 ЗЗД."],
    faq: [
      { q: "Кой срок важи?", a: "Срокът за предизвестие се определя от чл. 228 КТ и чл. 36 ЗЗД." },
    ],
  });

  it("е едностранен акт и е защитен", () => {
    expect(fallback.unilateral).toBe(true);
    expect(isProtectedFallback(fallback)).toBe(true);
  });

  it("изхвърля остарелите позовавания на чл. 228 и чл. 36", () => {
    const r = resolveTemplatePresentation(stale, fallback);
    const text = joined(r);
    expect(text).not.toMatch(/чл\.\s*228/);
    expect(text).not.toMatch(/чл\.\s*36\s*ЗЗД/);
    expect(r.requirements).toBe(fallback.requirements);
    expect(r.faq).toBe(fallback.faq);
  });
});

describe("resolveTemplatePresentation — Акт обр. 19", () => {
  const fallback = buildTemplateFallbackContent({ docName: "Акт обр. 19 — приемане на СМР" });
  const absolute = ai({
    requirements: ["Задължителен по Наредба № 3 за всички строежи."],
    mistakes: ["Липса на подписи — всички актове се подписват от едни и същи лица."],
    faq: [
      {
        q: "Задължителен ли е актът?",
        a: "Да, Наредба № 3 прави акта задължителен винаги и всички строителни актове имат едни и същи подписващи лица.",
      },
    ],
  });

  it("е защитен строителен вид документ", () => {
    expect(fallback.documentType).toBe("smr");
    expect(isProtectedFallback(fallback)).toBe(true);
  });

  it("изхвърля универсалните твърдения за задължителност и подписващи", () => {
    const r = resolveTemplatePresentation(absolute, fallback);
    const text = joined(r);
    expect(text).not.toMatch(/задължителен винаги/i);
    expect(text).not.toMatch(/всички актове се подписват/i);
    expect(text).not.toMatch(/едни и същи подписващи/i);
    expect(r.mistakes).toBe(fallback.mistakes);
  });
});

describe("resolveTemplatePresentation — договор/споразумение/анекс без промяна", () => {
  it("договорът за наем ползва AI реквизити/грешки/ЧЗВ дословно", () => {
    const fallback = buildTemplateFallbackContent({ docName: "Договор за наем на жилище" });
    const content = ai({});
    const r = resolveTemplatePresentation(content, fallback);
    expect(fallback.unilateral).toBe(false);
    expect(isProtectedFallback(fallback)).toBe(false);
    expect(r.requirements).toBe(content.requirements);
    expect(r.mistakes).toBe(content.mistakes);
    expect(r.faq).toBe(content.faq);
    expect(r.intro).toBe(content.intro);
    expect(r.usageCases).toBe(content.usageCases);
  });

  it("споразумение и анекс също запазват AI поведението", () => {
    for (const name of ["Споразумение за поверителност (NDA)", "Анекс към договор за наем"]) {
      const fallback = buildTemplateFallbackContent({ docName: name });
      const content = ai({});
      const r = resolveTemplatePresentation(content, fallback);
      expect(isProtectedFallback(fallback)).toBe(false);
      expect(r.faq).toBe(content.faq);
    }
  });
});

describe("resolveTemplatePresentation — intro/usageCases и fallback при липса на AI", () => {
  it("НЕ пропуска AI intro и usageCases при защитените видове", () => {
    const fallback = buildTemplateFallbackContent({ docName: "Пълномощно за КАТ" });
    const content = ai({});
    const r = resolveTemplatePresentation(content, fallback);
    expect(r.guarded).toBe(true);
    expect(r.intro).toBeUndefined();
    expect(r.usageCases).toBe(fallback.usageCases);
    expect(r.usageCases).not.toBe(content.usageCases);
  });


  it("без AI съдържание всичко идва от fallback-а", () => {
    const fallback = buildTemplateFallbackContent({ docName: "Разписка за получена сума" });
    const r = resolveTemplatePresentation(undefined, fallback);
    expect(r.intro).toBeUndefined();
    expect(r.usageCases).toBe(fallback.usageCases);
    expect(r.requirements).toBe(fallback.requirements);
    expect(r.faq).toBe(fallback.faq);
  });

  it("празни AI стойности се запазват (legacy nullish семантика)", () => {
    const fallback = buildTemplateFallbackContent({ docName: "Договор за наем на жилище" });
    const empty = ai({ intro: "   ", usageCases: [], requirements: [] });
    const r = resolveTemplatePresentation(empty, fallback);
    expect(r.intro).toBe("   ");
    expect(r.usageCases).toBe(empty.usageCases);
    expect(r.requirements).toEqual([]);
  });
});

describe("тип-матрица (компактен инвариант, без импорт на генерирани файлове)", () => {
  const PROBE_NAME = "Тестов документ";

  it("всеки защитен вид връща правните раздели от fallback-а", () => {
    for (const t of PROTECTED_DOCUMENT_TYPES) {
      const fallback = buildTemplateFallbackContent({
        docName: PROBE_NAME,
        documentType: t as DocumentTypeId,
      });
      const content = ai({});
      const r = resolveTemplatePresentation(content, fallback);
      expect(isProtectedFallback(fallback), t).toBe(true);
      expect(r.requirements, t).toBe(fallback.requirements);
      expect(r.mistakes, t).toBe(fallback.mistakes);
      expect(r.faq, t).toBe(fallback.faq);
      expect(r.intro, t).toBeUndefined();
      expect(r.usageCases, t).toBe(fallback.usageCases);

    }
  });

  it("незащитените видове (contract/agreement/annex) запазват AI предимството", () => {
    for (const t of ["contract", "agreement", "annex"] as DocumentTypeId[]) {
      const fallback = buildTemplateFallbackContent({ docName: PROBE_NAME, documentType: t });
      const content = ai({});
      const r = resolveTemplatePresentation(content, fallback);
      expect(isProtectedFallback(fallback), t).toBe(false);
      expect(r.faq, t).toBe(content.faq);
    }
  });

  it("защитеният списък е точно договореният набор", () => {
    expect([...PROTECTED_DOCUMENT_TYPES].sort()).toEqual(
      [
        "appendix",
        "claim",
        "complaint",
        "declaration",
        "invoice",
        "kss",
        "notary_invitation",
        "offer",
        "power_of_attorney",
        "protocol",
        "receipt",
        "smr",
      ].sort(),
    );
  });
});

describe("Template.tsx wiring", () => {
  const src = fs.readFileSync(path.resolve(__dirname, "../pages/Template.tsx"), "utf8");

  it("минава през резолвера и не дублира резолюцията", () => {
    expect(src).toContain('from "@/lib/resolveTemplatePresentation"');
    expect(src).toContain("resolveTemplatePresentation(aiContent, fallback)");
    expect(src).not.toMatch(/aiContent\?\.requirements/);
    expect(src).not.toMatch(/aiContent\?\.mistakes/);
    expect(src).not.toMatch(/aiContent\?\.faq/);
    expect(src).not.toMatch(/aiContent\?\.usageCases/);
  });

  it("FAQPage JSON-LD ползва резолвирания faq", () => {
    expect(src).toContain("const faq = resolved.faq;");
    expect(src).toContain("mainEntity: faq.map(");
  });

  it("CTA/фунията и ценовото ЧЗВ остават непроменени", () => {
    expect(src).toContain('trackFunnelEvent("template_create_cta_clicked"');
    expect(src).toContain('trackFunnelEvent("template_blank_cta_clicked"');
    expect(src).toContain("&blank=1&returnTo=");
  });
});

describe("legacy nullish семантика (незащитени видове)", () => {
  const fallback = buildTemplateFallbackContent({ docName: "Договор за наем на жилище" });
  const empty: TemplateContent = {
    intro: "",
    usageCases: [],
    requirements: [],
    mistakes: [],
    faq: [],
  };

  it("празни AI стойности се запазват байт-по-байт", () => {
    const r = resolveTemplatePresentation(empty, fallback);
    expect(r.guarded).toBe(false);
    expect(r.intro).toBe("");
    expect(r.usageCases).toBe(empty.usageCases);
    expect(r.requirements).toBe(empty.requirements);
    expect(r.mistakes).toBe(empty.mistakes);
    expect(r.faq).toBe(empty.faq);
  });

  it("липсващо AI съдържание пада към fallback", () => {
    const r = resolveTemplatePresentation(undefined, fallback);
    expect(r.intro).toBeUndefined();
    expect(r.usageCases).toBe(fallback.usageCases);
    expect(r.requirements).toBe(fallback.requirements);
  });
});

describe("buildTemplatePageDescription", () => {
  const legacyDesc = (docName: string, metaExcerpt: string | undefined, f: ReturnType<typeof buildTemplateFallbackContent>) =>
    metaExcerpt
      ? `${metaExcerpt.slice(0, 110)} Безплатен образец на ${docName.toLowerCase()} – ${f.labels.metaLawSuffix}`.slice(0, 160)
      : `Безплатен образец на ${docName.toLowerCase()} на български – ${f.labels.metaFallbackLaw}. Попълни и изтегли PDF или DOCX за 2 минути.`.slice(0, 160);

  it("защитен вид игнорира зловреден meta excerpt", () => {
    const docName = "Фактура (образец)";
    const f = buildTemplateFallbackContent({ docName });
    const desc = buildTemplatePageDescription({
      guarded: true,
      docName,
      metaExcerpt: "Задължителен документ, който узаконява сделката и гарантира законосъобразност.",
      metaLawSuffix: f.labels.metaLawSuffix,
      metaFallbackLaw: f.labels.metaFallbackLaw,
    });
    expect(desc).not.toMatch(/задължителен документ/i);
    expect(desc).not.toMatch(/гарантира законосъобразност/i);
    expect(desc).not.toMatch(/узаконява/i);
    expect(desc).toBe(legacyDesc(docName, undefined, f));
  });

  it("договор запазва стария низ байт-по-байт", () => {
    const docName = "Договор за наем на жилище";
    const f = buildTemplateFallbackContent({ docName });
    const excerpt = "Договорът за наем урежда отношенията между наемодател и наемател при предоставяне на жилище срещу наемна цена.";
    expect(
      buildTemplatePageDescription({
        guarded: false,
        docName,
        metaExcerpt: excerpt,
        metaLawSuffix: f.labels.metaLawSuffix,
        metaFallbackLaw: f.labels.metaFallbackLaw,
      }),
    ).toBe(legacyDesc(docName, excerpt, f));
    expect(
      buildTemplatePageDescription({
        guarded: false,
        docName,
        metaExcerpt: undefined,
        metaLawSuffix: f.labels.metaLawSuffix,
        metaFallbackLaw: f.labels.metaFallbackLaw,
      }),
    ).toBe(legacyDesc(docName, undefined, f));
  });

  it("Template.tsx ползва helper-а и resolved.guarded", () => {
    const src = fs.readFileSync(path.resolve("src/pages/Template.tsx"), "utf8");
    expect(src).toMatch(/buildTemplatePageDescription\(\{\s*\n\s*guarded: resolved\.guarded/);
    expect(src).not.toMatch(/const pageDesc = meta\?\.introExcerpt/);
  });
});

describe("Template.tsx wiring — intro и структурирани данни", () => {
  const src = fs.readFileSync(path.resolve("src/pages/Template.tsx"), "utf8");

  it("Article/Product описанието е безопасно при защитените, doc.purpose при останалите", () => {
    expect(src).toMatch(
      /const structuredDataDesc = resolved\.guarded \? pageDesc : doc\.purpose;/,
    );
    expect(src).not.toMatch(/description: doc\.purpose,/);
    expect((src.match(/description: structuredDataDesc,/g) ?? []).length).toBe(2);
  });

  it("видимото intro не ползва meta excerpt при защитените страници", () => {
    expect(src).toMatch(
      /const intro = resolved\.guarded \? resolved\.intro : resolved\.intro \?\? meta\?\.introExcerpt;/,
    );
  });

  it("логиката на intro: защитен винаги undefined; договор → legacy meta excerpt", () => {
    const metaExcerpt = "Задължителен документ, който гарантира законосъобразност.";
    const pick = (guarded: boolean, aiIntro: string | undefined) =>
      guarded ? aiIntro : aiIntro ?? metaExcerpt;

    const protectedFallback = buildTemplateFallbackContent({ docName: "Фактура (образец)" });
    const protectedResolved = resolveTemplatePresentation(undefined, protectedFallback);
    expect(protectedResolved.guarded).toBe(true);
    expect(pick(protectedResolved.guarded, protectedResolved.intro)).toBeUndefined();

    // AI intro никога не се показва при защитените видове.
    const protectedWithAi = resolveTemplatePresentation(ai({ intro: "AI въведение." }), protectedFallback);
    expect(pick(protectedWithAi.guarded, protectedWithAi.intro)).toBeUndefined();

    const rentFallback = buildTemplateFallbackContent({ docName: "Договор за наем на жилище" });
    const rent = resolveTemplatePresentation(undefined, rentFallback);
    expect(rent.guarded).toBe(false);
    expect(pick(rent.guarded, rent.intro)).toBe(metaExcerpt);
  });

});
