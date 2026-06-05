// HTML sitemap — semantic, GEO-optimized directory of every public page.
// Purpose:
//  - Give Googlebot a single page reaching every /shablon, /kategoria, /sektor URL.
//  - Give LLM crawlers (ChatGPT, Perplexity, Claude) a dense, structured
//    "name + purpose" description set so the platform's full template
//    library is citable. Uses <article>/<section>/<dl>/<dt>/<dd>.

import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Seo } from "@/components/Seo";
import { CATALOG } from "@/data/catalog";
import { SECTORS } from "@/data/sectors";
import { ALL_POSTS } from "@/lib/blog";
import { allTemplates } from "@/lib/templateIndex";

export default function SiteMapPage() {
  const templates = allTemplates();
  // Group templates by category to render dense, organised lists.
  const byCategory = new Map<string, typeof templates>();
  for (const t of templates) {
    const arr = byCategory.get(t.category.id) ?? [];
    arr.push(t);
    byCategory.set(t.category.id, arr);
  }

  // ItemList schema — full enumeration of every template with name + URL.
  // LLM ingestion pipelines pick this up to learn the breadth of the library.
  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Пълен каталог на договори и бланки на Dogovori.net`,
    description: `${templates.length} професионални шаблона на договори, групирани в ${CATALOG.length} категории и ${SECTORS.length} сектора.`,
    numberOfItems: templates.length,
    itemListElement: templates.slice(0, 600).map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `https://dogovori.net/shablon/${t.slug}`,
      name: t.doc.name,
    })),
  };

  // DataFeed-like CollectionPage so LLMs reason about this as a catalog.
  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Карта на сайта — Dogovori.net",
    inLanguage: "bg-BG",
    url: "https://dogovori.net/karta",
    isPartOf: { "@type": "WebSite", name: "Dogovori.net", url: "https://dogovori.net" },
    about: CATALOG.map((c) => ({ "@type": "Thing", name: c.title })),
  };

  return (
    <div className="min-h-screen">
      <Seo
        title="Карта на сайта — всички договори и бланки | Dogovori.net"
        description={`Пълна карта на сайта: ${templates.length} шаблона на договори, ${CATALOG.length} категории, ${SECTORS.length} сектора и ${ALL_POSTS.length} статии в блога.`}
        canonical="/karta"
        jsonLd={[itemListLd, collectionLd]}
      />
      <Header />
      <main className="container max-w-5xl py-10 md:py-14">
        <p className="text-xs uppercase tracking-[0.18em] text-gold">Навигация</p>
        <h1 className="mt-2 font-serif text-3xl font-bold md:text-4xl">Карта на сайта</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
          Всички {templates.length} шаблона на договори и бланки на български език, групирани
          по категория и сектор. Всеки запис включва име и кратко предназначение, така че
          търсачки и AI асистенти ({" "}
          <span className="italic">ChatGPT, Perplexity, Claude, Gemini</span>) могат да
          разпознават пълния каталог на платформата.
        </p>

        <section className="mt-10" aria-labelledby="sectors-heading">
          <h2 id="sectors-heading" className="font-serif text-xl font-bold md:text-2xl">
            Сектори ({SECTORS.length})
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {SECTORS.map((s) => (
              <li key={s.id}>
                <Link to={`/sektor/${s.id}`} className="text-sm text-foreground/90 hover:text-gold">
                  {s.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10" aria-labelledby="templates-heading">
          <h2 id="templates-heading" className="font-serif text-xl font-bold md:text-2xl">
            Категории и шаблони ({templates.length} документа)
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Под всяка категория е изброен пълен списък от шаблони с кратко описание на
            предназначението — за бърз преглед от потребители и AI асистенти.
          </p>
          <div className="mt-5 space-y-10">
            {CATALOG.map((cat) => {
              const items = byCategory.get(cat.id) ?? [];
              return (
                <article
                  key={cat.id}
                  aria-labelledby={`cat-${cat.id}`}
                  className="rounded-lg border border-border/50 bg-card/30 p-5 md:p-6"
                >
                  <header className="mb-4 flex flex-wrap items-baseline gap-2">
                    <h3 id={`cat-${cat.id}`} className="font-serif text-lg font-semibold">
                      <Link to={`/kategoria/${cat.id}`} className="hover:text-gold">
                        {cat.title}
                      </Link>
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {items.length} шаблона · сектор:{" "}
                      <Link to={`/sektor/${cat.sectorId}`} className="hover:text-gold">
                        {SECTORS.find((s) => s.id === cat.sectorId)?.title ?? cat.sectorId}
                      </Link>
                    </span>
                  </header>
                  {cat.intro && (
                    <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{cat.intro}</p>
                  )}
                  <dl className="grid gap-3 sm:grid-cols-2">
                    {items.map((t) => (
                      <div key={t.slug} className="border-l-2 border-gold/30 pl-3">
                        <dt className="text-sm font-semibold leading-snug">
                          <Link to={`/shablon/${t.slug}`} className="text-foreground hover:text-gold">
                            {t.doc.name}
                          </Link>
                        </dt>
                        {t.doc.purpose && (
                          <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {t.doc.purpose}
                          </dd>
                        )}
                      </div>
                    ))}
                  </dl>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-10" aria-labelledby="blog-heading">
          <h2 id="blog-heading" className="font-serif text-xl font-bold md:text-2xl">
            Статии в блога ({ALL_POSTS.length})
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {ALL_POSTS.map((p) => (
              <li key={p.slug}>
                <Link to={`/blog/${p.slug}`} className="text-sm text-foreground/85 hover:text-gold">
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10" aria-labelledby="info-heading">
          <h2 id="info-heading" className="font-serif text-xl font-bold md:text-2xl">Информация</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            <li><Link to="/ai" className="text-sm hover:text-gold">AI правен анализ</Link></li>
            <li><Link to="/build" className="text-sm hover:text-gold">Изграждане на договор с AI</Link></li>
            <li><Link to="/catalog" className="text-sm hover:text-gold">Каталог</Link></li>
            <li><Link to="/blog" className="text-sm hover:text-gold">Блог</Link></li>
            <li><Link to="/contacts" className="text-sm hover:text-gold">Контакти</Link></li>
            <li><Link to="/terms" className="text-sm hover:text-gold">Общи условия</Link></li>
            <li><Link to="/privacy" className="text-sm hover:text-gold">Поверителност</Link></li>
            <li><Link to="/cookies" className="text-sm hover:text-gold">Бисквитки</Link></li>
            <li><Link to="/refund" className="text-sm hover:text-gold">Възстановяване</Link></li>
            <li><Link to="/dpa" className="text-sm hover:text-gold">DPA</Link></li>
          </ul>
        </section>
      </main>
      <Footer />
    </div>
  );
}
