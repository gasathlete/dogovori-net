// Pure builders for JSON-LD schemas used across public, GEO-targeted pages.
// Extracted from page components so the same payloads can be:
//   1. Rendered by React (AIFeatures.tsx, SiteMap.tsx)
//   2. Embedded into prerendered HTML (scripts/prerender.ts)
//   3. Validated by unit tests (src/test/json-ld.test.ts) and CI
//
// Keep this file React-free.

export type JsonLd = Record<string, any>;

export const SITE_URL = "https://dogovori.net";

// ---------------------------------------------------------------------------
// /ai — AI contract analysis explainer
// ---------------------------------------------------------------------------

export const AI_ANALYSIS_STEPS = [
  {
    title: "1. Структурно разпознаване",
    body:
      "Качените PDF/DOCX се преобразуват в текст и AI моделът разпознава типа на документа (трудов, наем, услуга, NDA, дистрибуторски и др.) и страните по него.",
  },
  {
    title: "2. Извличане на клаузи",
    body:
      "Системата сегментира договора по клаузи (предмет, цена, срок, отговорност, прекратяване, юрисдикция) и ги нормализира за съпоставка със стандартни шаблони.",
  },
  {
    title: "3. Риск-анализ спрямо БГ право",
    body:
      "Всяка клауза се сравнява с императивните разпоредби на ЗЗД, ТЗ, КТ и специалното законодателство. Маркират се липсващи задължителни елементи, неравноправни условия и потенциални нищожности.",
  },
  {
    title: "4. Конкретни корекции",
    body:
      "За всеки риск AI предлага конкретна редакция — нов или преформулиран текст на клаузата — с обяснение защо подобрението е необходимо.",
  },
  {
    title: "5. Експорт и e-подпис",
    body:
      "Финалният документ се експортира като PDF и DOCX (с проследени промени) и може да бъде подписан електронно с КЕП или електронен подпис в платформата.",
  },
] as const;

export const AI_FAQS = [
  {
    q: "Какво точно прави AI анализът на договори в Dogovori.net?",
    a: "Платформата качва качения от вас договор (PDF или DOCX), разпознава типа му, извлича всички клаузи и ги сравнява спрямо изискванията на българското право — ЗЗД, ТЗ, КТ и съответните специални закони. За всеки идентифициран риск връща обяснение и конкретна редакция на клаузата.",
  },
  {
    q: "На колко езика работи AI асистентът?",
    a: "Първичният език е български. Системата поддържа и двуезични договори (български + английски) за работа с чуждестранни контрагенти, с автоматично синхронизиране на двата варианта.",
  },
  {
    q: "Какви типове договори анализира?",
    a: "Над 600 шаблона: трудови договори (чл. 67 КТ), договори за наем на жилище и търговски обект, граждански договори за услуги и изработка, NDA, дистрибуторски, франчайзинг, заем, дарение, цесия, договори по ЗОП, ЗУТ и др.",
  },
  {
    q: "Колко струва AI анализът?",
    a: "Професионалист план: 12.90 €/месец, включва 50 операции. Предприемач план: 19.90 €/месец, включва 100 операции, GPT-5 модел и премиум 24/7 поддръжка. Екип план: 109 €/място/година (минимум 3 места = 327 €/год) и е само годишен. Top-up пакети (само за абонати): 5 оп. — 2.90 €, 20 оп. — 5.40 €, 50 оп. — 12.90 €, 100 оп. — 23.90 €. Цените са с включен 20% ДДС. Една операция = един изтеглен договор, шаблон или анализ.",
  },
  {
    q: "Заместват ли AI препоръките правен консулт?",
    a: "Не. AI анализът е инструмент за подкрепа на решенията — той маркира рискове и предлага корекции, но окончателната правна преценка трябва да бъде направена от квалифициран юрист. Платформата изрично извежда дисклеймър при всеки експорт.",
  },
  {
    q: "Качените от мен документи използват ли се за обучение?",
    a: "Не. Документите, които потребителите качват за анализ, не се ползват за обучение или подобряване на модела. Те се съхраняват временно и могат да бъдат изтрити по всяко време от профила на потребителя.",
  },
  {
    q: "Кои AI модели стоят зад анализа?",
    a: "Платформата ползва съчетание от Gemini и собствена prompt пайплайн, специализирана за българското договорно право, плюс експертно курирани шаблони от юристи.",
  },
] as const;

export function buildAiFeaturesSchemas(): JsonLd[] {
  const faqLd: JsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: AI_FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const softwareLd: JsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Dogovori.net AI Contract Analysis",
    url: `${SITE_URL}/ai`,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "LegalTech / Contract Lifecycle Management",
    operatingSystem: "Web",
    inLanguage: ["bg-BG", "en"],
    description:
      "AI-powered legal contract analysis for Bulgarian law (ЗЗД, ТЗ, КТ). Extracts clauses, scores risk on a 1–10 scale, suggests concrete redlines and exports to PDF/DOCX with e-signature support.",
    featureList: [
      "600+ Bulgarian contract templates",
      "Clause extraction and segmentation",
      "Risk scoring vs Bulgarian statutory law (ЗЗД / ТЗ / КТ)",
      "Concrete redline suggestions per clause",
      "Bilingual (BG/EN) parallel export",
      "PDF + DOCX export with tracked changes",
      "Electronic signature (КЕП and platform-native)",
      "GDPR-compliant; uploaded documents not used for model training",
    ],
    offers: [
      { "@type": "Offer", name: "Професионалист", price: "12.90", priceCurrency: "EUR", description: "50 operations/month" },
      { "@type": "Offer", name: "Предприемач", price: "19.90", priceCurrency: "EUR", description: "100 operations/month, GPT-5, Premium 24/7 support" },
      { "@type": "Offer", name: "Екип (per seat, yearly)", price: "109", priceCurrency: "EUR", description: "Min 3 seats; per-seat annual price" },
      { "@type": "Offer", name: "Pay-as-you-go", price: "2.90", priceCurrency: "EUR", description: "5 operations, one-off" },
    ],
  };

  const howToLd: JsonLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "Как работи AI анализът на договори",
    inLanguage: "bg-BG",
    totalTime: "PT2M",
    step: AI_ANALYSIS_STEPS.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.title.replace(/^\d+\.\s*/, ""),
      text: s.body,
    })),
  };

  const breadcrumbsLd: JsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Начало", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "AI правен анализ", item: `${SITE_URL}/ai` },
    ],
  };

  return [softwareLd, faqLd, howToLd, breadcrumbsLd];
}

// ---------------------------------------------------------------------------
// /karta — HTML sitemap (TemplateDirectory)
// ---------------------------------------------------------------------------

export interface KartaTemplate {
  slug: string;
  name: string;
}

export interface KartaInput {
  templates: KartaTemplate[];
  categoryCount: number;
  sectorCount: number;
  categoryTitles: string[];
}

export function buildKartaSchemas(input: KartaInput): JsonLd[] {
  const { templates, categoryCount, sectorCount, categoryTitles } = input;
  const itemListLd: JsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Пълен каталог на договори и бланки на Dogovori.net`,
    description: `${templates.length} професионални шаблона на договори, групирани в ${categoryCount} категории и ${sectorCount} сектора.`,
    numberOfItems: templates.length,
    itemListElement: templates.slice(0, 600).map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}/shablon/${t.slug}`,
      name: t.name,
    })),
  };

  const collectionLd: JsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Карта на сайта — Dogovori.net",
    inLanguage: "bg-BG",
    url: `${SITE_URL}/karta`,
    isPartOf: { "@type": "WebSite", name: "Dogovori.net", url: SITE_URL },
    about: categoryTitles.map((name) => ({ "@type": "Thing", name })),
  };

  return [itemListLd, collectionLd];
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

/**
 * Per-type required-field map. Extend as new schema types are added.
 * Fields are required at the top level of the JSON-LD object.
 */
const REQUIRED_FIELDS: Record<string, string[]> = {
  SoftwareApplication: ["name", "applicationCategory", "offers", "featureList"],
  FAQPage: ["mainEntity"],
  HowTo: ["name", "step"],
  ItemList: ["itemListElement", "numberOfItems"],
  CollectionPage: ["name", "url"],
  BreadcrumbList: ["itemListElement"],
};

export interface JsonLdValidationError {
  path: string;
  message: string;
}

export function validateJsonLd(ld: JsonLd, path = "$"): JsonLdValidationError[] {
  const errors: JsonLdValidationError[] = [];
  if (!ld || typeof ld !== "object") {
    return [{ path, message: "not an object" }];
  }
  if (ld["@context"] !== "https://schema.org") {
    errors.push({ path, message: `@context must be "https://schema.org", got ${JSON.stringify(ld["@context"])}` });
  }
  const type = ld["@type"];
  if (typeof type !== "string") {
    errors.push({ path, message: "@type missing or not a string" });
    return errors;
  }
  const required = REQUIRED_FIELDS[type];
  if (required) {
    for (const f of required) {
      if (ld[f] === undefined || ld[f] === null || (Array.isArray(ld[f]) && ld[f].length === 0)) {
        errors.push({ path: `${path}.${f}`, message: `required field for ${type} is missing or empty` });
      }
    }
  }

  // Type-specific deep checks
  if (type === "FAQPage" && Array.isArray(ld.mainEntity)) {
    ld.mainEntity.forEach((q: any, i: number) => {
      const p = `${path}.mainEntity[${i}]`;
      if (q["@type"] !== "Question") errors.push({ path: p, message: '@type must be "Question"' });
      if (typeof q.name !== "string" || !q.name.trim()) errors.push({ path: `${p}.name`, message: "missing" });
      if (!q.acceptedAnswer || q.acceptedAnswer["@type"] !== "Answer" || typeof q.acceptedAnswer.text !== "string") {
        errors.push({ path: `${p}.acceptedAnswer`, message: "must be Answer with text" });
      }
    });
  }
  if (type === "HowTo" && Array.isArray(ld.step)) {
    ld.step.forEach((s: any, i: number) => {
      const p = `${path}.step[${i}]`;
      if (s["@type"] !== "HowToStep") errors.push({ path: p, message: '@type must be "HowToStep"' });
      if (typeof s.name !== "string" || !s.name.trim()) errors.push({ path: `${p}.name`, message: "missing" });
      if (typeof s.text !== "string" || !s.text.trim()) errors.push({ path: `${p}.text`, message: "missing" });
    });
  }
  if (type === "SoftwareApplication" && Array.isArray(ld.offers)) {
    ld.offers.forEach((o: any, i: number) => {
      const p = `${path}.offers[${i}]`;
      if (o["@type"] !== "Offer") errors.push({ path: p, message: '@type must be "Offer"' });
      if (!o.price) errors.push({ path: `${p}.price`, message: "missing" });
      if (!o.priceCurrency) errors.push({ path: `${p}.priceCurrency`, message: "missing" });
    });
  }
  if (type === "ItemList" && Array.isArray(ld.itemListElement)) {
    ld.itemListElement.forEach((it: any, i: number) => {
      const p = `${path}.itemListElement[${i}]`;
      if (it["@type"] !== "ListItem") errors.push({ path: p, message: '@type must be "ListItem"' });
      if (typeof it.position !== "number") errors.push({ path: `${p}.position`, message: "must be number" });
      if (typeof it.url !== "string" && typeof it.name !== "string") {
        errors.push({ path: `${p}`, message: "must have url or name" });
      }
    });
  }
  if (type === "BreadcrumbList" && Array.isArray(ld.itemListElement)) {
    ld.itemListElement.forEach((it: any, i: number) => {
      const p = `${path}.itemListElement[${i}]`;
      if (it["@type"] !== "ListItem") errors.push({ path: p, message: '@type must be "ListItem"' });
      if (typeof it.position !== "number") errors.push({ path: `${p}.position`, message: "must be number" });
      if (typeof it.name !== "string") errors.push({ path: `${p}.name`, message: "missing" });
      if (typeof it.item !== "string") errors.push({ path: `${p}.item`, message: "missing" });
    });
  }

  return errors;
}

export function validateAll(blocks: JsonLd[]): JsonLdValidationError[] {
  const errors: JsonLdValidationError[] = [];
  blocks.forEach((b, i) => {
    errors.push(...validateJsonLd(b, `[${i}](${b?.["@type"] ?? "?"})`));
  });
  return errors;
}
