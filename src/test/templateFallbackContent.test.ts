import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildTemplateFallbackContent } from "@/lib/templateFallbackContent";
import type { DocumentTypeId } from "@/lib/documentReferences";
import { inferDocumentType } from "@/lib/documentTypeInference";
import { CATALOG } from "@/data/catalog";
import { NEW_TEMPLATES } from "@/data/newTemplates";

function allText(c: ReturnType<typeof buildTemplateFallbackContent>) {
  return [
    ...c.usageCases,
    ...c.requirements,
    ...c.mistakes,
    ...c.faq.map((f) => `${f.q} ${f.a}`),
    ...c.sectionCards.map((s) => `${s.t} ${s.d}`),
    ...Object.values(c.labels),
  ].join("\n");
}

/** Всичко освен цените (FREE_OFFER_RULE/плановете) трябва да е без договорни клаузи. */
function nonPricingText(c: ReturnType<typeof buildTemplateFallbackContent>) {
  return [
    ...c.usageCases,
    ...c.requirements,
    ...c.mistakes,
    ...c.faq.filter((f) => !/Колко струва/.test(f.q)).map((f) => `${f.q} ${f.a}`),
    ...c.sectionCards.map((s) => `${s.t} ${s.d}`),
    ...Object.values(c.labels),
  ].join("\n");
}

const FORBIDDEN_UNILATERAL = [
  "Цена/възнаграждение",
  "ДДС",
  "плащане",
  "двете страни",
  "форсмажор",
  "неустойк",
  "арбитраж",
  "готов договор",
  "този договор",
  "чл. 62",
];

describe("unilateral template fallback content", () => {
  const resignation = buildTemplateFallbackContent({
    docName: "Молба за напускане (чл. 326, ал. 1 КТ)",
    categoryId: "employment",
  });

  it("classifies the resignation application as unilateral", () => {
    expect(resignation.unilateral).toBe(true);
  });

  it("covers the unilateral concepts", () => {
    const t = allText(resignation);
    expect(t).toMatch(/Адресат/);
    expect(t).toMatch(/Подател/);
    expect(t).toMatch(/Предмет и факти|относими факти/i);
    expect(t).toMatch(/искане|изявление|уведомление/i);
    expect(t).toMatch(/правно основание/i);
    expect(t).toMatch(/приложени/i);
    expect(t).toMatch(/подпис/i);
    expect(t).toMatch(/обратна разписка|входящ номер/);
  });

  it("excludes bilateral contract claims", () => {
    const t = nonPricingText(resignation).toLowerCase();
    for (const bad of FORBIDDEN_UNILATERAL) {
      expect(t, bad).not.toContain(bad.toLowerCase());
    }
  });

  it("replaces the 'other party refuses to sign' FAQ with proof of submission", () => {
    const qs = resignation.faq.map((f) => f.q).join("\n");
    expect(qs).not.toMatch(/откаже да подпише/);
    expect(qs).toMatch(/подаден и получен/);
  });

  it("keeps notarization and written-form answers cautious", () => {
    const form = resignation.faq.find((f) => /писмена форма/.test(f.q))!;
    expect(form.a).not.toMatch(/чл\. 62/);
    expect(form.a).toMatch(/Зависи от конкретния вид документ/);
    const notary = resignation.faq.find((f) => /нотариална заверка/.test(f.q))!;
    expect(notary.a).toMatch(/Зависи от конкретния вид документ/);
  });

  it("uses unilateral-safe labels", () => {
    expect(resignation.labels.usageTitle).toBe("Кога се използва този документ");
    expect(resignation.labels.footerPromise).toMatch(/готов документ/);
    expect(resignation.labels.heroLegalFit).not.toMatch(/ЗЗД|ТЗ|КТ/);
    expect(resignation.labels.requirementsFootnote).not.toMatch(/Търговски закон/);
    expect(resignation.labels.howToAnalysisText).not.toMatch(/клаузите по ЗЗД/);
    expect(resignation.labels.metaFallbackLaw).not.toMatch(/ЗЗД/);
  });

  it("keeps the exact pricing copy untouched", () => {
    const pricing = resignation.faq.find((f) => /Колко струва/.test(f.q))!;
    const bilateral = buildTemplateFallbackContent({ docName: "Договор за наем на жилище" });
    const bilateralPricing = bilateral.faq.find((f) => /Колко струва/.test(f.q))!;
    expect(pricing.a.replace(/молба[^.]*/, "")).toBeTruthy();
    expect(pricing.a.split("Безплатно:")[1]).toBe(bilateralPricing.a.split("Безплатно:")[1]);
  });

  it("treats generic declarations / applications / notifications as unilateral", () => {
    for (const name of [
      "Декларация по чл. 313 НК",
      "Заявление за платен отпуск",
      "Уведомление за прекратяване",
    ]) {
      const c = buildTemplateFallbackContent({ docName: name });
      expect(c.unilateral, name).toBe(true);
      const t = nonPricingText(c).toLowerCase();
      for (const bad of FORBIDDEN_UNILATERAL) {
        expect(t, `${name} / ${bad}`).not.toContain(bad.toLowerCase());
      }
    }
  });

  it("does not claim declarations always require notarization", () => {
    const c = buildTemplateFallbackContent({ docName: "Декларация по чл. 313 НК" });
    const notary = c.faq.find((f) => /нотариална заверка/.test(f.q))!;
    expect(notary.a).not.toMatch(/задължителен елемент/);
  });
});

describe("bilateral template fallback content is preserved", () => {
  it("keeps contract copy for an ordinary rental contract", () => {
    const c = buildTemplateFallbackContent({ docName: "Договор за наем на жилище", categoryId: "real-estate" });
    expect(c.unilateral).toBe(false);
    expect(c.labels.usageTitle).toBe("Кога се използва този договор");
    expect(c.labels.heroLegalFit).toBe("Съобразен със ЗЗД/ТЗ/КТ");
    expect(c.labels.footerPromise).toMatch(/готов договор/);
    expect(c.labels.requirementsFootnote).toMatch(/Търговски закон \(ТЗ\)/);
    expect(c.labels.howToAnalysisText).toBe("Системата проверява клаузите по ЗЗД, ТЗ и КТ и предлага корекции.");
    expect(c.sectionCards[0].t).toBe("I. Страни по документа");
    expect(c.sectionCards[2].t).toBe("III. Цена/възнаграждение");
    expect(c.faq.map((f) => f.q)).toContain("Какво се случва, ако другата страна откаже да подпише?");
    expect(c.requirements.join("\n")).toMatch(/Цена\/възнаграждение/);
  });

  it("keeps contract copy for a mutual-termination agreement", () => {
    const c = buildTemplateFallbackContent({
      docName: "Споразумение за прекратяване на наем по взаимно съгласие",
      categoryId: "real-estate",
    });
    expect(c.unilateral).toBe(false);
    expect(c.labels.usageTitle).toBe("Кога се използва този договор");
    expect(c.usageCases[0]).toMatch(/страните по/);
  });

  it("keeps the employment written-form answer for employment contracts", () => {
    const c = buildTemplateFallbackContent({ docName: "Трудов договор за неопределено време", categoryId: "employment" });
    const form = c.faq.find((f) => /писмена форма/.test(f.q))!;
    expect(form.a).toMatch(/чл\. 62, ал\. 1 КТ/);
  });
});

describe("TemplatePage wiring", () => {
  const src = readFileSync("src/pages/Template.tsx", "utf8");

  it("feeds the corrected FAQ content into the FAQPage structured data", () => {
    expect(src).toContain("const faq = aiContent?.faq ?? fallback.faq;");
    expect(src).toContain("mainEntity: faq.map(");
  });

  it("renders no hardcoded bilateral section cards or labels", () => {
    expect(src).toContain("fallback.sectionCards.map(");
    expect(src).not.toContain('"III. Цена/възнаграждение"');
    expect(src).not.toContain('title="Кога се използва този договор"');
    expect(src).not.toContain("получите готов договор в PDF");
  });

  it("keeps CTA routing and blank/create telemetry unchanged", () => {
    expect(src).toContain('trackFunnelEvent("template_create_cta_clicked"');
    expect(src).toContain('trackFunnelEvent("template_blank_cta_clicked"');
    expect(src).toContain("&blank=1&returnTo=");
  });
});

describe("HowTo final step + notary FAQ", () => {
  const uni = buildTemplateFallbackContent({ docName: "Молба за отпуск" });
  const bi = buildTemplateFallbackContent({ docName: "Договор за наем" });

  it("unilateral final step covers signing and provable submission", () => {
    expect(uni.labels.howToFinalStepName).toBe("Подписване и подаване");
    expect(uni.labels.howToFinalStepText).toMatch(/подайте\/връчете/);
    expect(uni.labels.howToFinalStepText).toMatch(/доказуем/);
    expect(uni.labels.howToFinalStepText).not.toContain("онлайн или го разпечатайте");
    expect(uni.labels.howToFinalStepName).not.toBe("Електронен подпис");
  });

  it("bilateral final step keeps the original wording byte-for-byte", () => {
    expect(bi.labels.howToFinalStepName).toBe("Електронен подпис");
    expect(bi.labels.howToFinalStepText).toBe("Подпишете документа онлайн или го разпечатайте.");
  });

  it("unilateral notary FAQ is conditional, not a default no", () => {
    const notary = uni.faq.find((f) => /нотариална заверка/.test(f.q))!;
    expect(notary.a.startsWith("Зависи от конкретния вид документ")).toBe(true);
    expect(notary.a).not.toMatch(/В повечето случаи не/);
    expect(notary.a).toMatch(/нотариални покани/);
  });

  it("TemplatePage HowTo step 5 reads from the fallback labels", () => {
    const src = readFileSync("src/pages/Template.tsx", "utf8");
    expect(src).toContain("name: fallback.labels.howToFinalStepName");
    expect(src).toContain("text: fallback.labels.howToFinalStepText");
    expect(src).not.toContain('name: "Електронен подпис"');
  });
});

/* ------------------ тип-специфични (не-договорни) семейства ---------------- */

/** Маркери, които са валидни САМО за истински двустранен договор. */
const CONTRACT_ONLY_MARKERS = [
  "този договор",
  "готов договор",
  "Кога се използва този договор",
  "ЗЗД/ТЗ/КТ",
  "по ЗЗД, ТЗ и КТ",
  "готов шаблон по ЗЗД",
  "Цена/възнаграждение",
  "двете страни",
  "форсмажор",
  "неустойк",
  "арбитраж",
  "Електронен подпис",
  "чл. 62",
];

const NON_CONTRACT_CASES: {
  docName: string;
  documentType?: DocumentTypeId;
  expectType: DocumentTypeId;
  expectCard: RegExp;
  expectFinalStep: RegExp;
}[] = [
  {
    docName: "Пълномощно за НАП",
    documentType: "power_of_attorney",
    expectType: "power_of_attorney",
    expectCard: /Упълномощител/,
    expectFinalStep: /заверка/i,
  },
  {
    docName: "Разписка за получена сума",
    expectType: "receipt",
    expectCard: /Получател/,
    expectFinalStep: /предаване/i,
  },
  {
    docName: "Фактура (образец)",
    expectType: "invoice",
    expectCard: /Издател/,
    expectFinalStep: /Издаване/i,
  },
  {
    docName: "Искова молба за неплатено вземане",
    expectType: "claim",
    expectCard: /Съд и подсъдност/,
    expectFinalStep: /съда/i,
  },
  {
    docName: "Оферта за строителни услуги",
    expectType: "offer",
    expectCard: /Предлагащ/,
    expectFinalStep: /подаване/i,
  },
  {
    docName: "Приемо-предавателен протокол",
    expectType: "protocol",
    expectCard: /Констатации/,
    expectFinalStep: /предаване/i,
  },
  {
    docName: "Приложение към договор за IT услуги (SLA)",
    expectType: "appendix",
    expectCard: /Препращане/,
    expectFinalStep: /прилагане/i,
  },
  {
    docName: "Акт обр. 19 за изпълнени СМР",
    expectType: "smr",
    expectCard: /Обект/,
    expectFinalStep: /документацията/i,
  },
  {
    docName: "КСС за ремонт на покрив",
    expectType: "kss",
    expectCard: /Позиции/,
    expectFinalStep: /подпишете/i,
  },
];

describe("type-aware non-contract fallback families", () => {
  it.each(NON_CONTRACT_CASES)("$docName gets its own family", (c) => {
    const content = buildTemplateFallbackContent({
      docName: c.docName,
      documentType: c.documentType,
    });
    expect(content.documentType).toBe(c.expectType);
    expect(content.labels.usageTitle).toBe("Кога се използва този документ");
    expect(content.sectionCards.map((s) => `${s.t} ${s.d}`).join("\n")).toMatch(c.expectCard);
    expect(
      `${content.labels.howToFinalStepName} ${content.labels.howToFinalStepText}`,
    ).toMatch(c.expectFinalStep);
    expect(content.usageCases.length).toBeGreaterThanOrEqual(5);
    expect(content.requirements.length).toBeGreaterThanOrEqual(5);
    expect(content.mistakes.length).toBeGreaterThanOrEqual(5);
    expect(content.faq.length).toBeGreaterThanOrEqual(5);
    expect(content.sectionCards.length).toBeGreaterThanOrEqual(5);
  });

  it.each(NON_CONTRACT_CASES)("$docName contains no contract-only markers", (c) => {
    const t = nonPricingText(
      buildTemplateFallbackContent({ docName: c.docName, documentType: c.documentType }),
    ).toLowerCase();
    for (const bad of CONTRACT_ONLY_MARKERS) {
      expect(t, `${c.docName} / ${bad}`).not.toContain(bad.toLowerCase());
    }
  });

  it("explicit documentType wins over inference", () => {
    const inferred = buildTemplateFallbackContent({ docName: "Договор за наем на жилище" });
    expect(inferred.documentType).toBe("contract");
    const explicit = buildTemplateFallbackContent({
      docName: "Договор за наем на жилище",
      documentType: "protocol",
    });
    expect(explicit.documentType).toBe("protocol");
  });

  it("keeps the resignation application in the unilateral family", () => {
    const c = buildTemplateFallbackContent({ docName: "Молба за напускане (чл. 326, ал. 1 КТ)" });
    expect(c.unilateral).toBe(true);
  });

  it("notary answers stay conditional across non-contract families", () => {
    for (const c of NON_CONTRACT_CASES) {
      const content = buildTemplateFallbackContent({
        docName: c.docName,
        documentType: c.documentType,
      });
      const notary = content.faq.find((f) => /нотариал/.test(f.q));
      if (!notary) continue;
      expect(notary.a, c.docName).toMatch(/Зависи|обичайно/);
      expect(notary.a, c.docName).not.toMatch(/задължителен елемент/);
    }
  });

  it("agreements and annexes keep contractual content but are not called a contract", () => {
    const agreement = buildTemplateFallbackContent({
      docName: "Споразумение за прекратяване на наем по взаимно съгласие",
      documentType: "agreement",
    });
    expect(agreement.labels.usageTitle).toBe("Кога се използва това споразумение");
    expect(agreement.labels.footerPromise).toMatch(/готово споразумение/);
    expect(agreement.labels.howToFinalStepName).toBe("Подписване");

    const annex = buildTemplateFallbackContent({
      docName: "Анекс към трудов договор",
      documentType: "annex",
    });
    expect(annex.labels.usageTitle).toBe("Кога се използва този анекс");
    expect(annex.labels.footerPromise).toMatch(/готов анекс/);
    expect(annex.labels.howToFinalStepText).toMatch(/Подпишете анекса/);
  });

  it("keeps the exact FREE_OFFER_RULE pricing copy in every family", () => {
    const control = buildTemplateFallbackContent({ docName: "Договор за наем на жилище" });
    const expected = control.faq.find((f) => /Колко струва/.test(f.q))!.a.split("Безплатно:")[1];
    for (const c of NON_CONTRACT_CASES) {
      const content = buildTemplateFallbackContent({
        docName: c.docName,
        documentType: c.documentType,
      });
      const pricing = content.faq.find((f) => /Колко струва/.test(f.q))!;
      expect(pricing.a.split("Безплатно:")[1], c.docName).toBe(expected);
    }
  });
});

describe("catalog-wide invariant", () => {
  const CONTRACTUAL: DocumentTypeId[] = ["contract", "agreement", "annex"];

  it("no declared/inferred non-contract document falls back to contract labels", () => {
    const offenders: string[] = [];
    const seen = new Set<string>();
    const docs: { name: string; documentType?: DocumentTypeId }[] = [
      ...CATALOG.flatMap((c) => c.documents),
      ...NEW_TEMPLATES.map((t) => t.doc),
    ];
    for (const d of docs) {
      if (seen.has(d.name)) continue;
      seen.add(d.name);
      const type = d.documentType ?? inferDocumentType(d.name);
      if (CONTRACTUAL.includes(type)) continue;
      const content = buildTemplateFallbackContent({
        docName: d.name,
        documentType: d.documentType,
      });
      const t = nonPricingText(content).toLowerCase();
      const bad = CONTRACT_ONLY_MARKERS.find((m) => t.includes(m.toLowerCase()));
      if (bad) offenders.push(`${d.name} [${type}] → "${bad}"`);
    }
    expect(offenders, offenders.slice(0, 20).join("\n")).toEqual([]);
  });
});
