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
import { slugify } from "../src/lib/slugify";

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
  // Replace canonical
  html = html.replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${url}" />`);
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
  bodyHtml: `<main style="font-family:Georgia,serif;max-width:800px;margin:2rem auto;padding:1rem"><h1>Dogovori.net — Договори онлайн на български</h1><p>Над 290 професионални договора и правни бланки на български с AI асистент. Готови шаблони по ЗЗД, ТЗ, КТ. Електронен подпис, PDF и DOCX експорт.</p><p><a href="/catalog">Виж каталога</a></p></main>`,
  jsonLd: [],
});

// Catalog
const totalDocs = CATALOG.reduce((s, c) => s + c.documents.length, 0);
pages.push({
  path: "/catalog",
  title: `Каталог: ${totalDocs}+ договора и бланки на български | Dogovori.net`,
  description: `Пълен каталог на ${totalDocs}+ професионални договори и правни бланки на български – трудови, наем, IT, NDA, GDPR. Готови за попълване.`,
  bodyHtml: `<main style="font-family:Georgia,serif;max-width:800px;margin:2rem auto;padding:1rem"><h1>Каталог на ${totalDocs}+ договори на български</h1>${CATALOG.map((c) => `<section><h2>${escapeHtml(c.title)}</h2><ul>${c.documents.map((d) => `<li><a href="/shablon/${slugify(d.name)}">${escapeHtml(d.name)}</a> — ${escapeHtml(d.purpose)}</li>`).join("")}</ul></section>`).join("")}</main>`,
  jsonLd: [],
});

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
  };
  pages.push({
    path: `/kategoria/${cat.id}`,
    title: `${cat.title} — шаблони на договори | Dogovori.net`,
    description: `${cat.intro} Над ${cat.documents.length} готови шаблона по българското право.`.slice(0, 160),
    bodyHtml: `<main style="font-family:Georgia,serif;max-width:800px;margin:2rem auto;padding:1rem"><nav><a href="/">Начало</a> › <a href="/catalog">Каталог</a> › ${escapeHtml(cat.title)}</nav><h1>${escapeHtml(cat.title)}</h1><p>${escapeHtml(cat.intro)}</p><ul>${cat.documents.map((d) => `<li><a href="/shablon/${slugify(d.name)}">${escapeHtml(d.name)}</a> — ${escapeHtml(d.purpose)}</li>`).join("")}</ul></main>`,
    jsonLd: [breadcrumbsLd, collectionLd],
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
