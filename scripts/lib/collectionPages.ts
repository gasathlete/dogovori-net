import { DOCUMENT_KITS } from "../../src/data/documentKits";
import { getKitSections } from "../../src/data/featuredKitStages";
import { SECTOR_PACKAGES, type SectorPackage } from "../../src/data/sectorPackages";
import { getPackageGuides, getSectorPackagesForKit } from "../../src/lib/seoCollections";

const SITE = "https://dogovori.net";
const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const availability = "Страниците на документите и примерите са достъпни за преглед. Стартирането на нов комплект и покупката остават затворени до пускането.";
type TemplateRef = { slug: string; doc: { name: string } };
type CollectionPage = { path: string; title: string; description: string; bodyHtml: string; jsonLd: Record<string, unknown>[] };

function schemas(path: string, title: string, parent: { name: string; path: string }, links: { name: string; path: string }[]) {
  return [
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Начало", item: `${SITE}/` },
      ...(path === parent.path ? [] : [{ "@type": "ListItem", position: 2, name: parent.name, item: `${SITE}${parent.path}` }]),
      { "@type": "ListItem", position: path === parent.path ? 2 : 3, name: title, item: `${SITE}${path}` },
    ] },
    { "@context": "https://schema.org", "@type": "ItemList", name: title, url: `${SITE}${path}`, itemListElement: links.map((link, index) => ({ "@type": "ListItem", position: index + 1, name: link.name, url: `${SITE}${link.path}` })) },
  ];
}

export function renderRelatedPackages(packages: readonly SectorPackage[]): string {
  if (!packages.length) return "";
  return `<section><h2>Документите за следващите стъпки</h2><p>Разгледайте свързаните документи, подредени по етапи. Във всеки пакет са обозначени наличните и планираните позиции.</p><ul>${packages.map((item) => `<li><a href="/paketi/${escapeHtml(item.slug)}">${escapeHtml(item.title)}</a><p>${escapeHtml(item.outcome)}</p></li>`).join("")}</ul></section>`;
}

export function buildCollectionPages(templates: readonly TemplateRef[]): CollectionPage[] {
  // Same last-by-name resolution as the interactive package/kit pages.
  const byName = new Map(templates.map((entry) => [entry.doc.name, entry]));
  function documentLink(name: string) {
    const template = byName.get(name);
    return template ? `<a href="/shablon/${escapeHtml(template.slug)}">${escapeHtml(name)}</a>` : escapeHtml(name);
  }
  const packageLinks = SECTOR_PACKAGES.map((item) => ({ name: item.title, path: `/paketi/${item.slug}` }));
  const kitLinks = DOCUMENT_KITS.map((kit) => ({ name: kit.title, path: `/komplekti/${kit.id}` }));
  const pages: CollectionPage[] = [
    {
      path: "/paketi", title: "Пакети документи по бизнес сектор | Dogovori.net",
      description: "Пакети документи за наеми, услуги, дигитални агенции и работодатели — подредени от началната договорка до приключването.",
      bodyHtml: `<main><h1>Пакети документи по бизнес сектор</h1><p>${availability}</p><ul>${SECTOR_PACKAGES.map((item) => `<li><a href="/paketi/${escapeHtml(item.slug)}">${escapeHtml(item.title)}</a> — ${escapeHtml(item.outcome)}</li>`).join("")}</ul></main>`,
      jsonLd: schemas("/paketi", "Пакети", { name: "Пакети", path: "/paketi" }, packageLinks),
    },
    {
      path: "/komplekti", title: "Комплекти документи за конкретни ситуации | Dogovori.net",
      description: "Подбрани комплекти за наем, услуги, дигитален проект, назначаване, имот и други ситуации. Разгледайте документите и планираните допълнения.",
      bodyHtml: `<main><h1>Комплекти документи</h1><p>${availability}</p><ul>${DOCUMENT_KITS.map((kit) => `<li><a href="/komplekti/${escapeHtml(kit.id)}">${escapeHtml(kit.title)}</a><p>${escapeHtml(kit.shortDescription)}</p></li>`).join("")}</ul><p><a href="/paketi">Пакети по сектор</a></p></main>`,
      jsonLd: schemas("/komplekti", "Комплекти", { name: "Комплекти", path: "/komplekti" }, kitLinks),
    },
  ];
  for (const item of SECTOR_PACKAGES) {
    const guides = getPackageGuides(item.id);
    const stages = [...new Set(item.documents.map((document) => document.stage))];
    const links = item.documents.flatMap((document) => {
      const template = document.status === "browseable" && document.docName ? byName.get(document.docName) : undefined;
      return template ? [{ name: template.doc.name, path: `/shablon/${template.slug}` }] : [];
    });
    pages.push({
      path: `/paketi/${item.slug}`, title: `${item.title} — пакет документи по сектор | Dogovori.net`, description: item.seoDescription ?? `${item.audience} ${item.outcome}`,
      bodyHtml: `<main><nav><a href="/paketi">Пакети</a></nav><h1>${escapeHtml(item.title)}</h1><p>${escapeHtml(item.audience)}</p><p>${escapeHtml(item.outcome)}</p><p>${availability}</p><h2>Цикълът стъпка по стъпка</h2>${stages.map((stage) => `<section><h3>${escapeHtml(stage)}</h3><ul>${item.documents.filter((document) => document.stage === stage).map((document) => `<li>${escapeHtml(document.title)}${document.docName ? `: ${document.status === "browseable" ? documentLink(document.docName) : escapeHtml(document.docName)}` : ""}${document.status === "planned" ? " — Планирано" : ""}${document.note ? `<p>${escapeHtml(document.note)}</p>` : ""}</li>`).join("")}</ul></section>`).join("")}<h2>Свързан комплект</h2><p><a href="/komplekti/${escapeHtml(item.relatedKitId)}">Разгледайте комплекта</a></p>${guides.length ? `<h2>Практически ръководства</h2><ul>${guides.map((post) => `<li><a href="/blog/${escapeHtml(post.slug)}">${escapeHtml(post.title)}</a></li>`).join("")}</ul>` : ""}</main>`,
      jsonLd: schemas(`/paketi/${item.slug}`, item.title, { name: "Пакети", path: "/paketi" }, links),
    });
  }
  for (const kit of DOCUMENT_KITS) {
    const links = kit.items.flatMap((item) => {
      const template = byName.get(item.docName);
      return template ? [{ name: item.docName, path: `/shablon/${template.slug}` }] : [];
    });
    pages.push({
      path: `/komplekti/${kit.id}`, title: `${kit.title} | Комплект документи | Dogovori.net`, description: kit.shortDescription,
      bodyHtml: `<main><nav><a href="/komplekti">Комплекти</a></nav><h1>${escapeHtml(kit.title)}</h1><p>${escapeHtml(kit.shortDescription)}</p><p>${escapeHtml(kit.forWho)}</p><h2>Документите в реда на ситуацията</h2>${getKitSections(kit).filter(({ items, stage }) => items.length || stage.plannedItem).map(({ stage, items }) => `<section><h3>${escapeHtml(stage.label)}</h3><ul>${items.map((item) => `<li>${documentLink(item.docName)}${item.optional ? " (по избор)" : ""}${item.note ? `<p>${escapeHtml(item.note)}</p>` : ""}</li>`).join("")}${stage.plannedItem ? `<li>Планирано: ${escapeHtml(stage.plannedItem)}</li>` : ""}</ul></section>`).join("")}<h2>Какво е налично сега</h2><p>${availability}</p>${renderRelatedPackages(getSectorPackagesForKit(kit.id))}</main>`,
      jsonLd: schemas(`/komplekti/${kit.id}`, kit.title, { name: "Комплекти", path: "/komplekti" }, links),
    });
  }
  return pages;
}
