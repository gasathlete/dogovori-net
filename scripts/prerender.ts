// Postbuild: generates per-route static HTML files in dist/ with full SEO meta
// (title, description, canonical, OG, JSON-LD) plus visible content placeholder
// inside #root that crawlers see before JS renders. React replaces it on mount
// (createRoot wipes #root content), so users get the normal SPA experience.
//
// This is "shallow prerendering" — enough for Google to index titles, descriptions
// and structured data without needing full JS rendering.
//
// Runs after `vite build`.

import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { CATALOG } from "../src/data/catalog";
import { SECTORS } from "../src/data/sectors";
import { slugify } from "../src/lib/slugify";
import {
  buildAiFeaturesSchemas,
  buildKartaSchemas,
  AI_ANALYSIS_STEPS,
  AI_FAQS,
  validateAll,
} from "../src/lib/seo/schemas";
import { buildTemplateFallbackContent } from "../src/lib/templateFallbackContent";
import {
  buildTemplatePageDescription,
  resolveTemplatePresentation,
} from "../src/lib/resolveTemplatePresentation";
import { getSeoTemplateMeta } from "../src/lib/seoTemplateMeta";

import { FREE_OFFER_RULE, fmtEur } from "../src/lib/pricing";
import { ONE_TIME_PRODUCTS, ONE_TIME_TERMS } from "../src/lib/products";
import { SECTOR_PACKAGES } from "../src/data/sectorPackages";
import {
  CHECK_CONCLUSION,
  CHECK_FINDINGS,
  CHECK_LEDGER,
  IMPROVE_CLAUSE,
  IMPROVE_DELIVERABLES,
  IMPROVE_STRATEGIES,
  PACKAGE_ACTIONS,
  PACKAGE_FINAL,
  PACKAGE_LETTERS,
  PACKAGE_PLAN,
  PREVIEW_NOTE,
  PREVIEW_TITLE,
  SAMPLE_DOC,
} from "../src/components/products/previewData";

/** Цената идва само от каноничната конфигурация — без литерали в текста. */
function priceText(eur: number): string {
  return `${fmtEur(eur)} еднократно`;
}


const DIST = resolve(process.cwd(), "dist");
const SITE = "https://dogovori.net";
const OG = `${SITE}/og-image.jpg?v=20260915d`;

if (!existsSync(`${DIST}/index.html`)) {
  console.error("dist/index.html not found — did `vite build` run?");
  process.exit(1);
}

const baseHtml = readFileSync(`${DIST}/index.html`, "utf8");

// Load AI-generated rich content per template slug.
// Source of truth: src/data/templateContent/<slug>.ts — each file exports a
// `const content: TemplateContent = { ... };` object literal. We parse the
// JSON object out of each file with a regex (no TS runtime at build time).
// Without this, /shablon/* SSG pages had no intro/FAQ/requirements and were
// treated as thin/duplicate content by Google.
const TEMPLATE_CONTENT: Record<string, any> = {};
try {
  const dir = resolve(process.cwd(), "src/data/templateContent");
  if (existsSync(dir)) {
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    for (const f of files) {
      try {
        const raw = readFileSync(resolve(dir, f), "utf8");
        const m = raw.match(/content\s*:\s*TemplateContent\s*=\s*(\{[\s\S]*?\});\s*\n+\s*export\s+default/);
        if (m) {
          TEMPLATE_CONTENT[f.replace(/\.ts$/, "")] = JSON.parse(m[1]);
        }
      } catch {
        // skip a broken file rather than failing the whole build
      }
    }
    console.log(`✓ Loaded TEMPLATE_CONTENT for ${Object.keys(TEMPLATE_CONTENT).length} templates`);
  }
} catch (e) {
  console.warn(`⚠ Could not load templateContent dir:`, (e as Error).message);
}

interface PageMeta {
  path: string;            // e.g. "/shablon/foo"
  title: string;
  description: string;
  bodyHtml: string;        // visible placeholder HTML for crawlers
  jsonLd: Record<string, any>[];
  type?: "website" | "article";
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function renderPage(meta: PageMeta): string {
  const url = `${SITE}${meta.path}`;
  // Replace <title>
  let html = baseHtml.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(meta.title)}</title>`);
  // Replace meta description
  html = html.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${escapeHtml(meta.description)}" data-prerendered="true" />`);
  // Replace or inject canonical (index.html no longer ships a static canonical — Helmet owns it per-route at runtime, so prerendered HTML must inject it).
  const canonicalTag = `<link rel="canonical" href="${url}" data-prerendered="true" />`;
  if (/<link rel="canonical"[^>]*>/.test(html)) {
    html = html.replace(/<link rel="canonical"[^>]*>/, canonicalTag);
  } else {
    html = html.replace(/<\/head>/, `    ${canonicalTag}\n  </head>`);
  }
  // Replace OG
  html = html.replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${url}" data-prerendered="true" />`);
  html = html.replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${escapeHtml(meta.title)}" data-prerendered="true" />`);
  html = html.replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${escapeHtml(meta.description)}" data-prerendered="true" />`);
  if (meta.type) html = html.replace(/<meta property="og:type"[^>]*>/, `<meta property="og:type" content="${meta.type}" data-prerendered="true" />`);
  html = html.replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${escapeHtml(meta.title)}" data-prerendered="true" />`);
  html = html.replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${escapeHtml(meta.description)}" data-prerendered="true" />`);


  // Inject extra JSON-LD blocks before </head>.
  // Mark each with data-prerendered="true" so the client can strip them before
  // React/Helmet renders its own equivalent — otherwise Google sees duplicate
  // structured data (e.g. two FAQPage on the same URL) and disqualifies rich results.
  const ldHtml = meta.jsonLd
    .map((ld) => `<script type="application/ld+json" data-prerendered="true">${JSON.stringify(ld)}</script>`)
    .join("\n    ");
  html = html.replace(/<\/head>/, `    ${ldHtml}\n  </head>`);


  // Inject visible content into #root for crawlers (React's createRoot will wipe this on mount)
  html = html.replace(
    /<div id="root"><\/div>/,
    `<div id="root">${meta.bodyHtml}</div>`,
  );

  return html;
}

function writeRoute(meta: PageMeta) {
  const out = resolve(DIST, meta.path.replace(/^\//, ""), "index.html");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, renderPage(meta), "utf8");
}

function bodyForTemplate(
  name: string,
  intro: string,
  requirements: string[],
  faq: { q: string; a: string }[],
  usageCases: string[] = [],
  mistakes: string[] = [],
  related: { name: string; slug: string }[] = [],
  categoryTitle: string = "",
  categoryId: string = "",
): string {
  return `
    <main style="font-family:Georgia,serif;max-width:800px;margin:2rem auto;padding:1rem;color:#0f1a30">
      <nav><a href="/">Начало</a> › <a href="/catalog">Каталог</a>${categoryId ? ` › <a href="/kategoria/${categoryId}">${escapeHtml(categoryTitle)}</a>` : ""} › ${escapeHtml(name)}</nav>
      <h1>${escapeHtml(name)}</h1>
      <p>${escapeHtml(intro)}</p>
      ${usageCases.length ? `<h2>Кога се използва</h2><ul>${usageCases.map((u) => `<li>${escapeHtml(u)}</li>`).join("")}</ul>` : ""}
      <h2>Задължителни реквизити</h2>
      <ul>${requirements.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>
      ${mistakes.length ? `<h2>Чести грешки</h2><ul>${mistakes.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ul>` : ""}
      <h2>Често задавани въпроси</h2>
      ${faq.map((f) => `<section><h3>${escapeHtml(f.q)}</h3><p>${escapeHtml(f.a)}</p></section>`).join("")}
      ${related.length ? `<h2>Свързани шаблони</h2><ul>${related.map((r) => `<li><a href="/shablon/${r.slug}">${escapeHtml(r.name)}</a></li>`).join("")}</ul>` : ""}
      <p><a href="/catalog">Виж всички шаблони</a>${categoryId ? ` · <a href="/kategoria/${categoryId}">Още от категория „${escapeHtml(categoryTitle)}"</a>` : ""} · <a href="/karta">Карта на сайта</a></p>
    </main>`;
}


const pages: PageMeta[] = [];

pages.push({
  path: "/paketi",
  title: "Пакети документи по бизнес сектор | Dogovori.net",
  description: "Пакети документи за наеми, услуги, дигитални агенции и работодатели — подредени от началната договорка до приключването.",
  bodyHtml: `<main><h1>Пакети документи по бизнес сектор</h1><ul>${SECTOR_PACKAGES.map((item) => `<li><a href="/paketi/${item.slug}">${escapeHtml(item.title)}</a> — ${escapeHtml(item.outcome)}</li>`).join("")}</ul></main>`,
  jsonLd: [],
});
for (const item of SECTOR_PACKAGES) {
  pages.push({
    path: `/paketi/${item.slug}`,
    title: `${item.title} — пакет документи по сектор | Dogovori.net`,
    description: `${item.audience} ${item.outcome}`,
    bodyHtml: `<main><a href="/paketi">Пакети</a><h1>${escapeHtml(item.title)}</h1><p>${escapeHtml(item.audience)}</p><ol>${item.documents.map((document) => `<li><strong>${escapeHtml(document.stage)}</strong> — ${escapeHtml(document.title)}${document.docName ? `: ${escapeHtml(document.docName)}` : " (планирано)"}</li>`).join("")}</ol></main>`,
    jsonLd: [],
  });
}

// Броят идва от каталога, не от твърдение в текст — така не остарява.
const totalDocs = CATALOG.reduce((s, c) => s + c.documents.length, 0);

// Index
pages.push({
  path: "/",
  title: "Договори и документи на български — Dogovori.net",
  description: `Изготвяте документ по образец от ${totalDocs} шаблона, проверявате чужд документ преди подпис и го сваляте в PDF или DOCX. Първият документ е безплатен.`,
  bodyHtml: `<main style="font-family:Georgia,serif;max-width:800px;margin:2rem auto;padding:1rem">
      <h1>Dogovori.net — договори и документи на български</h1>
      <p>Изготвяте документ по образец от ${totalDocs} шаблона по ЗЗД, ТЗ и КТ, проверявате чужд документ преди подпис и го сваляте в PDF или DOCX. Първият документ е безплатен.</p>
      <h2>Категории</h2>
      <ul>${CATALOG.map((c) => `<li><a href="/kategoria/${c.id}">${escapeHtml(c.title)}</a> — ${c.documents.length} шаблона</li>`).join("")}</ul>
      <h2>Еднократни продукти за един документ</h2>
      <ul>${ONE_TIME_PRODUCTS.map((p) => `<li><a href="/produkti/${p.slug}">${escapeHtml(p.name)}</a> — ${escapeHtml(p.shortOutcome)} ${priceText(p.priceEur)}</li>`).join("")}</ul>
      <p><a href="/produkti">Продукти</a> · <a href="/plans">Планове</a> · <a href="/catalog">Пълен каталог</a> · <a href="/karta">Карта на сайта</a> · <a href="/blog">Блог</a></p>
    </main>`,
  jsonLd: [],
});

// Catalog
pages.push({
  path: "/catalog",
  title: `Каталог: ${totalDocs}+ договора и бланки на български | Dogovori.net`,
  description: `Пълен каталог на ${totalDocs}+ професионални договори и правни бланки на български – трудови, наем, IT, NDA, GDPR. Готови за попълване.`,
  bodyHtml: `<main style="font-family:Georgia,serif;max-width:800px;margin:2rem auto;padding:1rem"><h1>Каталог на ${totalDocs}+ договори на български</h1>${CATALOG.map((c) => `<section><h2><a href="/kategoria/${c.id}">${escapeHtml(c.title)}</a></h2><ul>${c.documents.map((d) => `<li><a href="/shablon/${slugify(d.name)}">${escapeHtml(d.name)}</a> — ${escapeHtml(d.purpose)}</li>`).join("")}</ul></section>`).join("")}</main>`,
  jsonLd: [],
});

// HTML sitemap (/karta) — SSG version with the SAME JSON-LD as the React page,
// rendered into static HTML so LLM crawlers see the full TemplateDirectory
// (semantic <article>/<section>/<dl>) without waiting for client JS.
{
  const allDocs: { slug: string; name: string; purpose: string; catId: string; catTitle: string }[] = [];
  const seen = new Set<string>();
  for (const c of CATALOG) {
    for (const d of c.documents) {
      let base = slugify(d.name) || "shablon";
      let s = base;
      let i = 2;
      while (seen.has(s)) s = `${base}-${i++}`;
      seen.add(s);
      allDocs.push({ slug: s, name: d.name, purpose: d.purpose, catId: c.id, catTitle: c.title });
    }
  }
  const kartaLd = buildKartaSchemas({
    templates: allDocs.map((d) => ({ slug: d.slug, name: d.name })),
    categoryCount: CATALOG.length,
    sectorCount: SECTORS.length,
    categoryTitles: CATALOG.map((c) => c.title),
  });
  const kartaErrors = validateAll(kartaLd);
  if (kartaErrors.length) {
    console.error("✗ /karta JSON-LD validation failed:", kartaErrors);
    process.exit(1);
  }
  pages.push({
    path: "/karta",
    title: `Карта на сайта — всички ${totalDocs}+ шаблона | Dogovori.net`,
    description: `Пълна карта на сайта: ${totalDocs}+ шаблона на договори и бланки на български, групирани по категория. Бърз достъп до всеки документ.`,
    bodyHtml: `<main style="font-family:Georgia,serif;max-width:1000px;margin:2rem auto;padding:1rem;color:#0f1a30">
        <nav><a href="/">Начало</a> › Карта на сайта</nav>
        <h1>Карта на сайта</h1>
        <p>Всички ${totalDocs} шаблона на договори и бланки на български език, групирани по категория и сектор. Всеки запис включва име и кратко предназначение, така че търсачки и AI асистенти (ChatGPT, Perplexity, Claude, Gemini) могат да разпознават пълния каталог на платформата.</p>
        <section><h2>Сектори (${SECTORS.length})</h2><ul>${SECTORS.map((s) => `<li><a href="/sektor/${s.id}">${escapeHtml(s.title)}</a></li>`).join("")}</ul></section>
        <section><h2>Категории и шаблони (${totalDocs} документа)</h2>
        ${CATALOG.map((c) => `<article><h3><a href="/kategoria/${c.id}">${escapeHtml(c.title)}</a></h3>${c.intro ? `<p>${escapeHtml(c.intro)}</p>` : ""}<dl>${c.documents.map((d) => `<dt><a href="/shablon/${slugify(d.name)}">${escapeHtml(d.name)}</a></dt><dd>${escapeHtml(d.purpose)}</dd>`).join("")}</dl></article>`).join("")}
        </section>
        <p><a href="/ai">AI правен анализ</a> · <a href="/catalog">Каталог</a> · <a href="/blog">Блог</a></p>
      </main>`,
    jsonLd: kartaLd,
  });
}

// /ai — GEO-targeted explainer for the AI contract-analysis module.
{
  const aiLd = buildAiFeaturesSchemas();
  const aiErrors = validateAll(aiLd);
  if (aiErrors.length) {
    console.error("✗ /ai JSON-LD validation failed:", aiErrors);
    process.exit(1);
  }
  pages.push({
    path: "/ai",
    title: "AI правен анализ на договори — как работи | Dogovori.net",
    description: `Как Dogovori.net проверява български договори: клаузите, позоваването на ЗЗД, ТЗ и КТ, конкретните поправки и експорт в PDF или DOCX. ${totalDocs} шаблона.`,
    bodyHtml: `<main style="font-family:Georgia,serif;max-width:900px;margin:2rem auto;padding:1rem;color:#0f1a30">
        <nav><a href="/">Начало</a> › AI правен анализ</nav>
        <h1>Как AI системата на Dogovori.net анализира договори</h1>
        <p>Платформата събира ${totalDocs} български шаблона и автоматична проверка на текста, която се позовава на приложимото българско законодателство (ЗЗД, ТЗ, КТ). Резултатът е автоматично изготвена информация, а не индивидуален правен съвет.</p>
        <h2>Проверката в 5 стъпки</h2>
        <ol>${AI_ANALYSIS_STEPS.map((s) => `<li><strong>${escapeHtml(s.title)}</strong> — ${escapeHtml(s.body)}</li>`).join("")}</ol>
        <h2>Често задавани въпроси</h2>
        ${AI_FAQS.map((f) => `<section><h3>${escapeHtml(f.q)}</h3><p>${escapeHtml(f.a)}</p></section>`).join("")}
        <p><a href="/build">Изготвяне на документ</a> · <a href="/karta">Карта на сайта (всички ${totalDocs} шаблона)</a> · <a href="/catalog">Каталог</a></p>
      </main>`,
    jsonLd: aiLd,
  });
}


// Category hub pages
for (const cat of CATALOG) {
  const breadcrumbsLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Начало", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Каталог", item: `${SITE}/catalog` },
      { "@type": "ListItem", position: 3, name: cat.title, item: `${SITE}/kategoria/${cat.id}` },
    ],
  };
  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: cat.title,
    description: cat.intro,
    inLanguage: "bg-BG",
    url: `${SITE}/kategoria/${cat.id}`,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: cat.documents.length,
      itemListElement: cat.documents.slice(0, 30).map((d, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        url: `${SITE}/shablon/${slugify(d.name)}`,
        name: d.name,
      })),
    },
  };
  // Related categories — siblings from same sector, excluding self.
  const related = CATALOG.filter((c) => c.sectorId === cat.sectorId && c.id !== cat.id).slice(0, 6);
  pages.push({
    path: `/kategoria/${cat.id}`,
    title: `${cat.title} — ${cat.documents.length} шаблона на български | Dogovori.net`,
    description: `${cat.intro} ${cat.documents.length} готови шаблона по българското право — ЗЗД, ТЗ, КТ. PDF и DOCX експорт.`.slice(0, 160),
    bodyHtml: `<main style="font-family:Georgia,serif;max-width:900px;margin:2rem auto;padding:1rem;color:#0f1a30">
      <nav><a href="/">Начало</a> › <a href="/catalog">Каталог</a> › ${escapeHtml(cat.title)}</nav>
      <h1>${escapeHtml(cat.title)}</h1>
      <p>${escapeHtml(cat.intro)}</p>
      <p>В тази категория ще намерите ${cat.documents.length} готови шаблона, съобразени с действащото българско законодателство. Приложимите клаузи и реквизити зависят от вида на документа и от конкретната сделка.</p>
      <h2>Шаблони в категорията</h2>
      <ul>${cat.documents.map((d) => `<li><a href="/shablon/${slugify(d.name)}">${escapeHtml(d.name)}</a> — ${escapeHtml(d.purpose)}</li>`).join("")}</ul>
      <h2>Често задавани въпроси</h2>
      <section><h3>Безплатно ли е да изтегля документ?</h3><p>Стартът е безплатен: ${escapeHtml(FREE_OFFER_RULE)}. Платените планове дават по-високи месечни лимити.</p></section>
      <section><h3>Документите подписват ли се с електронен подпис?</h3><p>Поддържаме подписване в браузъра и експорт към PDF с одиторска следа. Обикновеният електронен подпис има силата на саморъчен само ако страните са се съгласили за това; когато законът изисква определена форма, може да е нужен квалифициран електронен подпис или нотариална форма.</p></section>
      <section><h3>Заместват ли консултация с адвокат?</h3><p>Не. Шаблоните са образци за самостоятелно попълване, но за сделки с висока стойност препоръчваме окончателен преглед от лицензиран адвокат.</p></section>
      ${related.length ? `<h2>Свързани категории</h2><ul>${related.map((r) => `<li><a href="/kategoria/${r.id}">${escapeHtml(r.title)}</a></li>`).join("")}</ul>` : ""}
      <p><a href="/catalog">← Обратно към каталога</a> · <a href="/karta">Карта на сайта</a></p>
    </main>`,
    jsonLd: [breadcrumbsLd, collectionLd, {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        { "@type": "Question", name: "Безплатно ли е да изтегля документ?", acceptedAnswer: { "@type": "Answer", text: `Стартът е безплатен: ${FREE_OFFER_RULE}. Платените планове дават по-високи месечни лимити.` } },
        { "@type": "Question", name: "Документите подписват ли се с електронен подпис?", acceptedAnswer: { "@type": "Answer", text: "Поддържаме подписване в браузъра и експорт към PDF с одиторска следа. Обикновеният електронен подпис има силата на саморъчен само ако страните са се съгласили за това; когато законът изисква определена форма, може да е нужен квалифициран електронен подпис или нотариална форма." } },
        { "@type": "Question", name: "Заместват ли консултация с адвокат?", acceptedAnswer: { "@type": "Answer", text: "Не. Шаблоните са образци за самостоятелно попълване; за сделки с висока стойност препоръчваме преглед от лицензиран адвокат." } },

      ],
    }],
  });
}

// Templates — precompute slugs first so "Свързани шаблони" can link to siblings.
const slugByDoc = new Map<string, string>();
const docsBySlug = new Map<string, { name: string; slug: string; catId: string }>();
{
  const usedSlugs = new Set<string>();
  for (const cat of CATALOG) {
    for (const doc of cat.documents) {
      let base = slugify(doc.name) || "shablon";
      let slug = base;
      let i = 2;
      while (usedSlugs.has(slug)) slug = `${base}-${i++}`;
      usedSlugs.add(slug);
      slugByDoc.set(`${cat.id}::${doc.name}`, slug);
      docsBySlug.set(slug, { name: doc.name, slug, catId: cat.id });
    }
  }
}

for (const cat of CATALOG) {
  // Pool of sibling slugs in same category for "related" links.
  const siblings = cat.documents
    .map((d) => ({ name: d.name, slug: slugByDoc.get(`${cat.id}::${d.name}`)! }))
    .filter(Boolean);

  for (const doc of cat.documents) {
    const slug = slugByDoc.get(`${cat.id}::${doc.name}`)!;

    const ai = TEMPLATE_CONTENT[slug];

    // SAME guard as runtime (src/lib/resolveTemplatePresentation.ts): за
    // НЕдоговорните („защитени") видове документи генерираното AI съдържание
    // НЕ се публикува — нито intro, нито реквизити/FAQ. Иначе статичният HTML
    // показва на кроулърите точно текста, който runtime-ът вече блокира.
    const fallback = buildTemplateFallbackContent({
      docName: doc.name,
      categoryId: cat.id,
      documentType: doc.documentType,
    });
    const resolved = resolveTemplatePresentation(ai, fallback);
    const metaOverride = getSeoTemplateMeta(slug);
    const guardedDesc = buildTemplatePageDescription({ docName: doc.name });


    const legacyIntro: string = ai?.intro ?? doc.purpose;
    const legacyRequirements: string[] = ai?.requirements ?? [
      "Пълни данни на страните",
      "Ясен предмет на договора",
      "Цена, срок и начин на плащане",
      "Права и задължения",
      "Подписи на страните и дата",
    ];
    const legacyFaq: { q: string; a: string }[] = ai?.faq ?? [
      { q: "Задължителна ли е писмената форма?", a: "ЗЗД допуска и устни договори, но писмената форма е силно препоръчителна за доказване." },
      { q: "Колко струва услугата?", a: `Стартът е безплатен: ${FREE_OFFER_RULE}. Платените планове дават по-високи месечни лимити.` },
    ];

    const intro = resolved.guarded ? doc.purpose : legacyIntro;
    const requirements: string[] = resolved.guarded ? resolved.requirements : legacyRequirements;
    const faq: { q: string; a: string }[] = resolved.guarded ? resolved.faq : legacyFaq;
    const usageCases: string[] = resolved.guarded
      ? resolved.usageCases
      : Array.isArray(ai?.usageCases)
        ? ai.usageCases
        : [];
    const mistakes: string[] = resolved.guarded
      ? resolved.mistakes
      : Array.isArray(ai?.mistakes)
        ? ai.mistakes
        : [];
    // Organic 2: честно, детерминистично описание за ВСЯКА /shablon страница —
    // без сглобяване/отрязване на генериран intro в средата на изречение.
    const description = metaOverride?.description ?? guardedDesc;

    // Pick up to 6 sibling templates as related, excluding self.
    const related = siblings.filter((s) => s.slug !== slug).slice(0, 6);

    const articleLd = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: doc.name,
      description: resolved.guarded ? guardedDesc : doc.purpose,
      inLanguage: "bg-BG",
      author: { "@type": "Organization", name: "Dogovori.net" },
      publisher: { "@type": "Organization", name: "Dogovori.net", logo: { "@type": "ImageObject", url: `${SITE}/icon-512.png?v=20260915d`, width: 512, height: 512 } },
      mainEntityOfPage: `${SITE}/shablon/${slug}`,
    };
    const breadcrumbsLd = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Начало", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Каталог", item: `${SITE}/catalog` },
        { "@type": "ListItem", position: 3, name: cat.title, item: `${SITE}/kategoria/${cat.id}` },
        { "@type": "ListItem", position: 4, name: doc.name, item: `${SITE}/shablon/${slug}` },
      ],
    };
    const faqLd = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    };

    pages.push({
      path: `/shablon/${slug}`,
      // Точните override заглавия трябва да са байт-идентични с runtime — без брандов суфикс.
      title: metaOverride
        ? metaOverride.title
        : `${doc.name} — образец на български | Dogovori.net`,


      description,
      bodyHtml: bodyForTemplate(doc.name, intro, requirements, faq, usageCases, mistakes, related, cat.title, cat.id),

      jsonLd: [breadcrumbsLd, articleLd, faqLd],
      type: "article",
    });
  }
}

// /sektor/* — sector landing pages. Mirror /kategoria SSG so the 13 sectors
// stop being orphan client-only routes invisible to crawlers.
for (const sector of SECTORS) {
  const sectorCats = CATALOG.filter((c) => c.sectorId === sector.id);
  const totalSectorDocs = sectorCats.reduce((sum, c) => sum + c.documents.length, 0);
  const sectorBreadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Начало", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Каталог", item: `${SITE}/catalog` },
      { "@type": "ListItem", position: 3, name: sector.title, item: `${SITE}/sektor/${sector.id}` },
    ],
  };
  const sectorCollection = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${sector.title} — договори и шаблони`,
    description: sector.description || sector.subtitle,
    inLanguage: "bg-BG",
    url: `${SITE}/sektor/${sector.id}`,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: totalSectorDocs,
      itemListElement: sectorCats.slice(0, 30).map((c, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        url: `${SITE}/kategoria/${c.id}`,
        name: c.title,
      })),
    },
  };
  pages.push({
    path: `/sektor/${sector.id}`,
    title: `${sector.title} — договори, шаблони и документи | Dogovori.net`,
    description: (sector.description || sector.subtitle || `Готови договори и документи за сектор ${sector.title} — съобразени с българското право.`).slice(0, 160),
    bodyHtml: `<main style="font-family:Georgia,serif;max-width:900px;margin:2rem auto;padding:1rem;color:#0f1a30">
      <nav><a href="/">Начало</a> › <a href="/catalog">Каталог</a> › ${escapeHtml(sector.title)}</nav>
      <h1>${escapeHtml(sector.title)}</h1>
      <p>${escapeHtml(sector.subtitle || "")}</p>
      <p>${escapeHtml(sector.description || `В сектор „${sector.title}" сме събрали готови договори и документи, съобразени с действащото българско законодателство — ЗЗД, ТЗ, КТ, ЗЗП. Общо ${totalSectorDocs} шаблона, разпределени в ${sectorCats.length} категории.`)}</p>
      <h2>Категории в сектора (${sectorCats.length})</h2>
      <ul>${sectorCats.map((c) => `<li><a href="/kategoria/${c.id}">${escapeHtml(c.title)}</a> — ${c.documents.length} шаблона</li>`).join("")}</ul>
      <h2>Популярни шаблони</h2>
      <ul>${sectorCats.flatMap((c) => c.documents.slice(0, 4).map((d) => `<li><a href="/shablon/${slugByDoc.get(`${c.id}::${d.name}`)}">${escapeHtml(d.name)}</a></li>`)).slice(0, 20).join("")}</ul>
      <p><a href="/catalog">← Обратно към каталога</a> · <a href="/karta">Карта на сайта</a></p>
    </main>`,
    jsonLd: [sectorBreadcrumbs, sectorCollection],
  });
}


// ---------------------------------------------------------------------------
// /blog + /blog/<slug> — до момента тези маршрути не се пререндираха и
// сървърът връщаше HTML на началната страница (canonical="/"), заради което
// Google ги отчиташе като „Дубликат – потребителят не е избрал канонична
// страница". Сега всяка статия получава собствен title/description/canonical.
// ---------------------------------------------------------------------------
type PrerenderBlogPost = {
  slug: string;
  title: string;
  category: string;
  summary: string;
  metaDescription: string;
  image: string;
  publishedAt: string;
  intro: string;
  sections: { heading: string; body: string }[];
  faq: { q: string; a: string }[];
  takeaways: string[];
};

const blogPosts: PrerenderBlogPost[] = [];
{
  const dir = resolve(process.cwd(), "src/content/blog");
  if (existsSync(dir)) {
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    for (const f of files) {
      try {
        const mod: any = await import(resolve(dir, f));
        if (mod?.POST?.slug) blogPosts.push(mod.POST as PrerenderBlogPost);
      } catch (e) {
        console.warn(`⚠ Skipped blog post ${f}:`, (e as Error).message);
      }
    }
    blogPosts.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
    console.log(`✓ Loaded ${blogPosts.length} blog posts for prerender`);
  }
}

const paragraphs = (body: string): string =>
  body
    .split("\n\n")
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("");

if (blogPosts.length) {
  pages.push({
    path: "/blog",
    title: `Правен блог: ${blogPosts.length} анализа по българско право | Dogovori.net`,
    description:
      "Правен блог на Dogovori.net — практични анализи по ЗЗД, ТЗ, КТ и ЗУТ: договори, данъци, срокове и чести грешки, обяснени на разбираем език.",
    bodyHtml: `<main style="font-family:Georgia,serif;max-width:900px;margin:2rem auto;padding:1rem;color:#0f1a30">
        <nav><a href="/">Начало</a> › Блог</nav>
        <h1>Правен блог</h1>
        <p>Практични статии по българско договорно, трудово и данъчно право. Всеки материал е свързан с готови шаблони, които можете да попълните веднага.</p>
        <ul>${blogPosts
          .map(
            (p) =>
              `<li><a href="/blog/${p.slug}">${escapeHtml(p.title)}</a> — ${escapeHtml(p.summary)} <em>(${escapeHtml(p.category)}, ${escapeHtml(p.publishedAt)})</em></li>`,
          )
          .join("")}</ul>
        <p><a href="/catalog">Каталог на шаблоните</a> · <a href="/karta">Карта на сайта</a></p>
      </main>`,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Blog",
        name: "Правен блог — Dogovori.net",
        inLanguage: "bg-BG",
        url: `${SITE}/blog`,
        blogPost: blogPosts.slice(0, 20).map((p) => ({
          "@type": "BlogPosting",
          headline: p.title,
          url: `${SITE}/blog/${p.slug}`,
          datePublished: p.publishedAt,
          description: p.summary,
        })),
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Начало", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Блог", item: `${SITE}/blog` },
        ],
      },
    ],
  });

  for (const post of blogPosts) {
    const related = blogPosts.filter((p) => p.slug !== post.slug && p.category === post.category).slice(0, 4);
    pages.push({
      path: `/blog/${post.slug}`,
      title: `${post.title} | Dogovori.net`,
      description: (post.metaDescription || post.summary).slice(0, 160),
      type: "article",
      bodyHtml: `<main style="font-family:Georgia,serif;max-width:800px;margin:2rem auto;padding:1rem;color:#0f1a30">
        <nav><a href="/">Начало</a> › <a href="/blog">Блог</a> › ${escapeHtml(post.title)}</nav>
        <article>
          <h1>${escapeHtml(post.title)}</h1>
          <p><em>${escapeHtml(post.category)} · публикувана ${escapeHtml(post.publishedAt)}</em></p>
          ${paragraphs(post.intro)}
          ${post.sections.map((s) => `<section><h2>${escapeHtml(s.heading)}</h2>${paragraphs(s.body)}</section>`).join("")}
          ${post.takeaways?.length ? `<h2>Основни изводи</h2><ul>${post.takeaways.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>` : ""}
          ${post.faq?.length ? `<h2>Често задавани въпроси</h2>${post.faq.map((f) => `<section><h3>${escapeHtml(f.q)}</h3><p>${escapeHtml(f.a)}</p></section>`).join("")}` : ""}
        </article>
        ${related.length ? `<h2>Свързани статии</h2><ul>${related.map((r) => `<li><a href="/blog/${r.slug}">${escapeHtml(r.title)}</a></li>`).join("")}</ul>` : ""}
        <p><a href="/blog">← Всички статии</a> · <a href="/catalog">Каталог на шаблоните</a></p>
      </main>`,
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.title,
          description: post.summary,
          inLanguage: "bg-BG",
          datePublished: post.publishedAt,
          dateModified: post.publishedAt,
          image: `${SITE}${post.image}`,
          author: { "@type": "Organization", name: "Dogovori.net" },
          publisher: {
            "@type": "Organization",
            name: "Dogovori.net",
            logo: { "@type": "ImageObject", url: `${SITE}/icon-512.png?v=20260915d`, width: 512, height: 512 },
          },
          mainEntityOfPage: `${SITE}/blog/${post.slug}`,
        },
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Начало", item: `${SITE}/` },
            { "@type": "ListItem", position: 2, name: "Блог", item: `${SITE}/blog` },
            { "@type": "ListItem", position: 3, name: post.title, item: `${SITE}/blog/${post.slug}` },
          ],
        },
        ...(post.faq?.length
          ? [
              {
                "@context": "https://schema.org",
                "@type": "FAQPage",
                mainEntity: post.faq.map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
              },
            ]
          : []),
      ],
    });
  }
}

// ---------------------------------------------------------------------------
// /tools + /tools/<slug> — правни калкулатори. Същият проблем като блога:
// без SSG връщаха HTML на началната страница и се отчитаха като дубликати.
// ---------------------------------------------------------------------------
{
  let calculators: any[] = [];
  try {
    const mod: any = await import(resolve(process.cwd(), "src/data/calculators/index.ts"));
    calculators = mod?.CALCULATORS ?? [];
  } catch (e) {
    console.warn("⚠ Could not load CALCULATORS:", (e as Error).message);
  }

  if (calculators.length) {
    pages.push({
      path: "/tools",
      title: `Правни калкулатори: ${calculators.length} безплатни инструмента | Dogovori.net`,
      description:
        "Безплатни правни калкулатори по българското законодателство: обезщетения при уволнение, платен отпуск, лихва за забава, нотариални такси, ДДС и местни данъци.",
      bodyHtml: `<main style="font-family:Georgia,serif;max-width:900px;margin:2rem auto;padding:1rem;color:#0f1a30">
          <nav><a href="/">Начало</a> › Калкулатори</nav>
          <h1>Правни калкулатори</h1>
          <p>Изчислете обезщетения, отпуски, лихви и такси според действащото българско законодателство. Всеки калкулатор посочва правното си основание.</p>
          <ul>${calculators
            .map((c) => `<li><a href="/tools/${c.slug}">${escapeHtml(c.title)}</a> — ${escapeHtml(c.description)}</li>`)
            .join("")}</ul>
          <p><a href="/catalog">Каталог на шаблоните</a> · <a href="/blog">Правен блог</a></p>
        </main>`,
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Правни калкулатори",
          inLanguage: "bg-BG",
          url: `${SITE}/tools`,
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: calculators.length,
            itemListElement: calculators.map((c, idx) => ({
              "@type": "ListItem",
              position: idx + 1,
              url: `${SITE}/tools/${c.slug}`,
              name: c.title,
            })),
          },
        },
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Начало", item: `${SITE}/` },
            { "@type": "ListItem", position: 2, name: "Калкулатори", item: `${SITE}/tools` },
          ],
        },
      ],
    });

    for (const calc of calculators) {
      const seo = calc.seo ?? {};
      const others = calculators.filter((c) => c.slug !== calc.slug).slice(0, 6);
      pages.push({
        path: `/tools/${calc.slug}`,
        title: `${calc.title} — безплатен калкулатор | Dogovori.net`,
        description: (seo.metaDescription || calc.description || "").slice(0, 160),
        bodyHtml: `<main style="font-family:Georgia,serif;max-width:800px;margin:2rem auto;padding:1rem;color:#0f1a30">
            <nav><a href="/">Начало</a> › <a href="/tools">Калкулатори</a> › ${escapeHtml(calc.title)}</nav>
            <h1>${escapeHtml(calc.title)}</h1>
            <p>${escapeHtml(seo.intro || calc.description || "")}</p>
            ${seo.howItWorks ? `<h2>Как работи изчислението</h2>${paragraphs(seo.howItWorks)}` : ""}
            ${
              Array.isArray(calc.legalBasis) && calc.legalBasis.length
                ? `<h2>Правно основание</h2><ul>${calc.legalBasis.map((l: any) => `<li>${escapeHtml(l.label)}</li>`).join("")}</ul>`
                : ""
            }
            ${
              Array.isArray(seo.faq) && seo.faq.length
                ? `<h2>Често задавани въпроси</h2>${seo.faq.map((f: any) => `<section><h3>${escapeHtml(f.q)}</h3><p>${escapeHtml(f.a)}</p></section>`).join("")}`
                : ""
            }
            ${others.length ? `<h2>Други калкулатори</h2><ul>${others.map((c) => `<li><a href="/tools/${c.slug}">${escapeHtml(c.shortTitle || c.title)}</a></li>`).join("")}</ul>` : ""}
            <p><a href="/tools">← Всички калкулатори</a> · <a href="/catalog">Каталог на шаблоните</a></p>
          </main>`,
        jsonLd: [
          {
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: calc.title,
            description: calc.description,
            applicationCategory: "FinanceApplication",
            operatingSystem: "Web",
            inLanguage: "bg-BG",
            url: `${SITE}/tools/${calc.slug}`,
            offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
          },
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Начало", item: `${SITE}/` },
              { "@type": "ListItem", position: 2, name: "Калкулатори", item: `${SITE}/tools` },
              { "@type": "ListItem", position: 3, name: calc.title, item: `${SITE}/tools/${calc.slug}` },
            ],
          },
          ...(Array.isArray(seo.faq) && seo.faq.length
            ? [
                {
                  "@context": "https://schema.org",
                  "@type": "FAQPage",
                  mainEntity: seo.faq.map((f: any) => ({
                    "@type": "Question",
                    name: f.q,
                    acceptedAnswer: { "@type": "Answer", text: f.a },
                  })),
                },
              ]
            : []),
        ],
      });
    }
  }
}

/* ------------------- Еднократни продукти (/produkti) -------------------
   Статичният HTML съдържа имената, цените, резултата и примерния текст на
   трите продукта, без зависимост от въртележка или JavaScript.            */
{
  const DISCLAIMER =
    "Резултатът е автоматично изготвена информация по подадения текст. Не е индивидуален правен съвет и не заменя консултация с адвокат.";

  const sampleFor = (id: string): string => {
    if (id === "contract_check") {
      return `<p>${escapeHtml(PREVIEW_TITLE)} — ${escapeHtml(PREVIEW_NOTE)} ${escapeHtml(SAMPLE_DOC.title)}, ${escapeHtml(SAMPLE_DOC.parties)}. ${escapeHtml(SAMPLE_DOC.role)}.</p>
        <p>${escapeHtml(CHECK_CONCLUSION)}</p>
        <ul>${CHECK_FINDINGS.map((f) => `<li><strong>${escapeHtml(f.severity)}: ${escapeHtml(f.title)}</strong> — ${escapeHtml(f.consequence)} (${escapeHtml(f.location)}) ${escapeHtml(f.excerpt)} ${escapeHtml(f.nextStep)}</li>`).join("")}</ul>
        <ul>${CHECK_LEDGER.map((l) => `<li>${escapeHtml(l.label)}: ${escapeHtml(l.value)}</li>`).join("")}</ul>`;
    }
    if (id === "contract_improve") {
      return `<p>${escapeHtml(PREVIEW_TITLE)} — ${escapeHtml(PREVIEW_NOTE)} ${escapeHtml(SAMPLE_DOC.title)}, ${escapeHtml(IMPROVE_CLAUSE.location)}.</p>
        <p><strong>Преди:</strong> ${escapeHtml(IMPROVE_CLAUSE.before)}</p>
        <ul>${IMPROVE_STRATEGIES.map((s) => `<li><strong>${escapeHtml(s.label)}</strong> — ${escapeHtml(s.proposed)} <em>${escapeHtml(s.tradeoff)}</em></li>`).join("")}</ul>
        <ul>${IMPROVE_DELIVERABLES.map((d) => `<li>${escapeHtml(d)}</li>`).join("")}</ul>`;
    }
    return `<p>${escapeHtml(PREVIEW_TITLE)} — ${escapeHtml(PREVIEW_NOTE)} ${escapeHtml(SAMPLE_DOC.title)}, ${escapeHtml(SAMPLE_DOC.role)}.</p>
      ${PACKAGE_PLAN.map((b) => `<p><strong>${escapeHtml(b.heading)}</strong></p><ul>${b.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`).join("")}
      <ul>${PACKAGE_ACTIONS.map((a) => `<li>${escapeHtml(a.action)} — ${escapeHtml(a.owner)}, ${escapeHtml(a.deadline)} (${escapeHtml(a.status)})</li>`).join("")}</ul>
      <ul>${PACKAGE_LETTERS.map((l) => `<li><strong>${escapeHtml(l.tone)}:</strong> ${escapeHtml(l.text)}</li>`).join("")}</ul>
      <ul>${PACKAGE_FINAL.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>`;
  };

  // /produkti — витрината
  pages.push({
    path: "/produkti",
    title: "Продукти за един документ — проверка, поправка, преговори",
    description:
      "Три еднократни продукта за един документ: подробна проверка преди подпис, поправка на текста с три варианта и пълен пакет за преговори. Плащате веднъж, без абонамент.",
    bodyHtml: `<main style="font-family:Georgia,serif;max-width:900px;margin:2rem auto;padding:1rem;color:#0f1a30">
        <nav><a href="/">Начало</a> › Продукти</nav>
        <h1>Продукти за един документ</h1>
        <p>Проверка преди подпис, поправка на текста или пълен пакет за преговори. Плащате веднъж за конкретния документ. ${escapeHtml(ONE_TIME_TERMS)}.</p>
        ${ONE_TIME_PRODUCTS.map(
          (p) => `<section>
          <h2><a href="/produkti/${p.slug}">${escapeHtml(p.name)}</a></h2>
          <p>${escapeHtml(p.promise)}</p>
          <p><strong>${escapeHtml(priceText(p.priceEur))}</strong> · ${escapeHtml(p.shortOutcome)}</p>
          <ul>${p.outcomes.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}</ul>
          <p><a href="/produkti/${p.slug}">Вижте продукта</a></p>
        </section>`,
        ).join("")}
        <h2>Примерни резултати</h2>
        ${ONE_TIME_PRODUCTS.map((p) => `<section><h3>${escapeHtml(p.name)} — ${escapeHtml(PREVIEW_TITLE)}</h3>${sampleFor(p.id)}</section>`).join("")}
        <p>${escapeHtml(DISCLAIMER)}</p>
        <p><a href="/plans">Планове за редовна работа с документи</a> · <a href="/catalog">Каталог на шаблоните</a> · <a href="/">Начало</a></p>
      </main>`,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Начало", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Продукти", item: `${SITE}/produkti` },
        ],
      },
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "Продукти на Договори.нет",
        itemListElement: ONE_TIME_PRODUCTS.map((p, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: p.name,
          url: `${SITE}/produkti/${p.slug}`,
        })),
      },
    ],
  });

  // Трите продуктови страници
  for (const p of ONE_TIME_PRODUCTS) {
    const url = `${SITE}/produkti/${p.slug}`;
    const others = ONE_TIME_PRODUCTS.filter((o) => o.id !== p.id);
    pages.push({
      path: `/produkti/${p.slug}`,
      title: p.page.title,
      description: p.page.metaDescription,
      bodyHtml: `<main style="font-family:Georgia,serif;max-width:900px;margin:2rem auto;padding:1rem;color:#0f1a30">
          <nav><a href="/">Начало</a> › <a href="/produkti">Продукти</a> › ${escapeHtml(p.name)}</nav>
          <h1>${escapeHtml(p.page.h1)}</h1>
          <p>${escapeHtml(p.page.intro)}</p>
          <p><strong>${escapeHtml(priceText(p.priceEur))}</strong> · ${escapeHtml(p.shortOutcome)}</p>
          <p><a href="/produkti/${p.slug}/start">${escapeHtml(p.ctaLabel)}</a> · <a href="/start">Започнете безплатно</a></p>
          <h2>Какво давате Вие</h2>
          <ul>${p.page.youProvide.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
          <h2>Какво получавате</h2>
          <ul>${p.page.youReceive.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
          <h2>Какво точно съдържа резултатът</h2>
          ${p.page.resultSections.map((s) => `<section><h3>${escapeHtml(s.heading)}</h3><ul>${s.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul></section>`).join("")}
          <h2>Три стъпки</h2>
          <ol>${p.page.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>
          <h2>${escapeHtml(PREVIEW_TITLE)}</h2>
          ${sampleFor(p.id)}
          <h2>Често задавани въпроси</h2>
          ${p.page.faq.map((f) => `<section><h3>${escapeHtml(f.q)}</h3><p>${escapeHtml(f.a)}</p></section>`).join("")}
          <p>${escapeHtml(ONE_TIME_TERMS)}. ${escapeHtml(DISCLAIMER)}</p>
          <h2>Другите продукти</h2>
          <ul>${others.map((o) => `<li><a href="/produkti/${o.slug}">${escapeHtml(o.name)}</a> — ${escapeHtml(priceText(o.priceEur))}</li>`).join("")}</ul>
          <p><a href="/produkti">Всички продукти</a> · <a href="/plans">Планове</a> · <a href="/catalog">Каталог</a></p>
        </main>`,
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Начало", item: `${SITE}/` },
            { "@type": "ListItem", position: 2, name: "Продукти", item: `${SITE}/produkti` },
            { "@type": "ListItem", position: 3, name: p.name, item: url },
          ],
        },
        {
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: p.page.title,
          description: p.page.metaDescription,
          url,
          inLanguage: "bg-BG",
        },
        {
          "@context": "https://schema.org",
          "@type": "Service",
          name: p.name,
          description: p.page.metaDescription,
          url,
          areaServed: "BG",
          provider: { "@type": "Organization", name: "Договори.нет", url: SITE },
          offers: {
            "@type": "Offer",
            price: p.priceEur.toFixed(2),
            priceCurrency: "EUR",
            url,
          },
        },
        {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: p.page.faq.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        },
      ],
    });
  }
}

let n = 0;
for (const p of pages) {
  writeRoute(p);
  n++;
}
console.log(`✓ Prerendered ${n} pages with SEO meta + JSON-LD into dist/`);

