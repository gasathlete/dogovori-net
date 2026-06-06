// Postbuild: generates per-route static HTML files in dist/ with full SEO meta
// (title, description, canonical, OG, JSON-LD) plus visible content placeholder
// inside #root that crawlers see before JS renders. React replaces it on mount
// (createRoot wipes #root content), so users get the normal SPA experience.
//
// This is "shallow prerendering" — enough for Google to index titles, descriptions
// and structured data without needing full JS rendering.
//
// Runs after `vite build`.

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
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

const DIST = resolve(process.cwd(), "dist");
const SITE = "https://dogovori.net";
const OG = `${SITE}/og-image.jpg`;

if (!existsSync(`${DIST}/index.html`)) {
  console.error("dist/index.html not found — did `vite build` run?");
  process.exit(1);
}

const baseHtml = readFileSync(`${DIST}/index.html`, "utf8");

// Try to load AI-generated rich content if available
let TEMPLATE_CONTENT: Record<string, any> = {};
try {
  const raw = readFileSync(resolve(process.cwd(), "src/data/templateContent.ts"), "utf8");
  const m = raw.match(/= (\{[\s\S]*\}) as const;/);
  if (m) TEMPLATE_CONTENT = JSON.parse(m[1]);
} catch {
  // optional
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
  html = html.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${escapeHtml(meta.description)}" />`);
  // Replace or inject canonical (index.html no longer ships a static canonical — Helmet owns it per-route at runtime, so prerendered HTML must inject it).
  const canonicalTag = `<link rel="canonical" href="${url}" />`;
  if (/<link rel="canonical"[^>]*>/.test(html)) {
    html = html.replace(/<link rel="canonical"[^>]*>/, canonicalTag);
  } else {
    html = html.replace(/<\/head>/, `    ${canonicalTag}\n  </head>`);
  }
  // Replace OG
  html = html.replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${url}" />`);
  html = html.replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${escapeHtml(meta.title)}" />`);
  html = html.replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${escapeHtml(meta.description)}" />`);
  if (meta.type) html = html.replace(/<meta property="og:type"[^>]*>/, `<meta property="og:type" content="${meta.type}" />`);
  html = html.replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`);
  html = html.replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`);

  // Inject extra JSON-LD blocks before </head>
  const ldHtml = meta.jsonLd
    .map((ld) => `<script type="application/ld+json">${JSON.stringify(ld)}</script>`)
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

function bodyForTemplate(name: string, intro: string, requirements: string[], faq: { q: string; a: string }[]): string {
  return `
    <main style="font-family:Georgia,serif;max-width:800px;margin:2rem auto;padding:1rem;color:#0f1a30">
      <nav><a href="/">Начало</a> › <a href="/catalog">Каталог</a> › ${escapeHtml(name)}</nav>
      <h1>${escapeHtml(name)}</h1>
      <p>${escapeHtml(intro)}</p>
      <h2>Задължителни реквизити</h2>
      <ul>${requirements.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>
      <h2>Често задавани въпроси</h2>
      ${faq.map((f) => `<section><h3>${escapeHtml(f.q)}</h3><p>${escapeHtml(f.a)}</p></section>`).join("")}
      <p><a href="/catalog">Виж всички шаблони</a></p>
    </main>`;
}

const pages: PageMeta[] = [];

// Index
pages.push({
  path: "/",
  title: "Договори онлайн на български — Dogovori.net",
  description: "Над 290 професионални договора и правни бланки на български с AI асистент. Електронен подпис, PDF и DOCX експорт. Безплатно за първия документ.",
  bodyHtml: `<main style="font-family:Georgia,serif;max-width:800px;margin:2rem auto;padding:1rem">
      <h1>Dogovori.net — Договори онлайн на български</h1>
      <p>Над 290 професионални договора и правни бланки на български с AI асистент. Готови шаблони по ЗЗД, ТЗ, КТ. Електронен подпис, PDF и DOCX експорт.</p>
      <h2>Категории</h2>
      <ul>${CATALOG.map((c) => `<li><a href="/kategoria/${c.id}">${escapeHtml(c.title)}</a> — ${c.documents.length} шаблона</li>`).join("")}</ul>
      <p><a href="/catalog">Виж пълния каталог</a> · <a href="/karta">Карта на сайта</a> · <a href="/blog">Блог</a></p>
    </main>`,
  jsonLd: [],
});

// Catalog
const totalDocs = CATALOG.reduce((s, c) => s + c.documents.length, 0);
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
    description:
      "Как AI системата на Dogovori.net анализира български договори: извличане на клаузи, проверка по ЗЗД/ТЗ/КТ, конкретни корекции и експорт в PDF/DOCX. Над 600 шаблона.",
    bodyHtml: `<main style="font-family:Georgia,serif;max-width:900px;margin:2rem auto;padding:1rem;color:#0f1a30">
        <nav><a href="/">Начало</a> › AI правен анализ</nav>
        <h1>Как AI системата на Dogovori.net анализира договори</h1>
        <p>Платформата комбинира над 600 правно курирани шаблона с AI пайплайн, обучен за българското договорно право (ЗЗД, ТЗ, КТ).</p>
        <h2>Пайплайн на анализа — 5 стъпки</h2>
        <ol>${AI_ANALYSIS_STEPS.map((s) => `<li><strong>${escapeHtml(s.title)}</strong> — ${escapeHtml(s.body)}</li>`).join("")}</ol>
        <h2>Често задавани въпроси</h2>
        ${AI_FAQS.map((f) => `<section><h3>${escapeHtml(f.q)}</h3><p>${escapeHtml(f.a)}</p></section>`).join("")}
        <p><a href="/build">Изготви договор с AI</a> · <a href="/karta">Карта на сайта (всички 600+ шаблона)</a> · <a href="/catalog">Каталог</a></p>
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
      <p>В тази категория ще намерите ${cat.documents.length} готови шаблона, съобразени с действащото българско законодателство. Всеки документ е подготвен от юристи и включва задължителните защитни клаузи — частична недействителност, форсмажор и подсъдност.</p>
      <h2>Шаблони в категорията</h2>
      <ul>${cat.documents.map((d) => `<li><a href="/shablon/${slugify(d.name)}">${escapeHtml(d.name)}</a> — ${escapeHtml(d.purpose)}</li>`).join("")}</ul>
      <h2>Често задавани въпроси</h2>
      <section><h3>Безплатно ли е да изтегля документ?</h3><p>Да, първият документ е безплатен. След това действат месечни лимити или Pro абонамент за неограничено теглене.</p></section>
      <section><h3>Документите подписват ли се с електронен подпис?</h3><p>Да. Поддържаме подписване в браузъра и експорт към PDF с одиторска следа, признат от ЗЕДЕУУ и eIDAS.</p></section>
      <section><h3>Заместват ли консултация с адвокат?</h3><p>Не. Шаблоните са професионално подготвени образци, но за сделки с висока стойност препоръчваме окончателен преглед от лицензиран адвокат.</p></section>
      ${related.length ? `<h2>Свързани категории</h2><ul>${related.map((r) => `<li><a href="/kategoria/${r.id}">${escapeHtml(r.title)}</a></li>`).join("")}</ul>` : ""}
      <p><a href="/catalog">← Обратно към каталога</a> · <a href="/karta">Карта на сайта</a></p>
    </main>`,
    jsonLd: [breadcrumbsLd, collectionLd, {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        { "@type": "Question", name: "Безплатно ли е да изтегля документ?", acceptedAnswer: { "@type": "Answer", text: "Да, първият документ е безплатен. След това действат месечни лимити или Pro абонамент." } },
        { "@type": "Question", name: "Документите подписват ли се с електронен подпис?", acceptedAnswer: { "@type": "Answer", text: "Да. Поддържаме подписване в браузъра и експорт към PDF с одиторска следа, признат от ЗЕДЕУУ и eIDAS." } },
        { "@type": "Question", name: "Заместват ли консултация с адвокат?", acceptedAnswer: { "@type": "Answer", text: "Не. Шаблоните са професионално подготвени образци; за сделки с висока стойност препоръчваме преглед от лицензиран адвокат." } },
      ],
    }],
  });
}

// Templates
const used = new Set<string>();
for (const cat of CATALOG) {
  for (const doc of cat.documents) {
    let base = slugify(doc.name);
    if (!base) base = "shablon";
    let slug = base;
    let i = 2;
    while (used.has(slug)) slug = `${base}-${i++}`;
    used.add(slug);

    const ai = TEMPLATE_CONTENT[slug];
    const intro = ai?.intro ?? doc.purpose;
    const requirements: string[] = ai?.requirements ?? [
      "Пълни данни на страните",
      "Ясен предмет на договора",
      "Цена, срок и начин на плащане",
      "Права и задължения",
      "Подписи на страните и дата",
    ];
    const faq: { q: string; a: string }[] = ai?.faq ?? [
      { q: "Задължителна ли е писмената форма?", a: "ЗЗД допуска и устни договори, но писмената форма е силно препоръчителна за доказване." },
      { q: "Колко струва услугата?", a: "Безплатно за първия документ. Pro абонамент дава неограничен брой договори." },
    ];

    const articleLd = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: doc.name,
      description: doc.purpose,
      inLanguage: "bg-BG",
      author: { "@type": "Organization", name: "Dogovori.net" },
      publisher: { "@type": "Organization", name: "Dogovori.net", logo: { "@type": "ImageObject", url: `${SITE}/favicon.png` } },
      mainEntityOfPage: `${SITE}/shablon/${slug}`,
    };
    const breadcrumbsLd = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Начало", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Каталог", item: `${SITE}/catalog` },
        { "@type": "ListItem", position: 3, name: cat.title, item: `${SITE}/catalog#${cat.id}` },
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
      title: `${doc.name} — образец на български | Dogovori.net`,
      description: (intro.length > 155 ? intro.slice(0, 152) + "…" : intro),
      bodyHtml: bodyForTemplate(doc.name, intro, requirements, faq),
      jsonLd: [breadcrumbsLd, articleLd, faqLd],
      type: "article",
    });
  }
}

let n = 0;
for (const p of pages) {
  writeRoute(p);
  n++;
}
console.log(`✓ Prerendered ${n} pages with SEO meta + JSON-LD into dist/`);
