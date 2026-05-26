// HTML sitemap — flat, linkable list of every public page on the site.
// Purpose: give Googlebot a single page from which every /shablon, /kategoria
// and /sektor URL is reachable with one click. Helps crawl budget on a young
// domain where most URLs are stuck in "Discovered – currently not indexed".

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

  return (
    <div className="min-h-screen">
      <Seo
        title="Карта на сайта — всички договори и бланки | Dogovori.net"
        description={`Пълна карта на сайта: ${templates.length} шаблона на договори, ${CATALOG.length} категории, ${SECTORS.length} сектора и ${ALL_POSTS.length} статии в блога.`}
        canonical="/karta"
      />
      <Header />
      <main className="container max-w-5xl py-10 md:py-14">
        <p className="text-xs uppercase tracking-[0.18em] text-gold">Навигация</p>
        <h1 className="mt-2 font-serif text-3xl font-bold md:text-4xl">Карта на сайта</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
          Всички {templates.length} шаблона на договори и бланки, групирани по категория.
          Използвайте тази страница, ако търсите бърз достъп до конкретен документ.
        </p>

        <section className="mt-10">
          <h2 className="font-serif text-xl font-bold md:text-2xl">Сектори</h2>
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

        <section className="mt-10">
          <h2 className="font-serif text-xl font-bold md:text-2xl">Категории и шаблони</h2>
          <div className="mt-4 space-y-8">
            {CATALOG.map((cat) => {
              const items = byCategory.get(cat.id) ?? [];
              return (
                <div key={cat.id}>
                  <h3 className="font-serif text-lg font-semibold">
                    <Link to={`/kategoria/${cat.id}`} className="hover:text-gold">
                      {cat.title}
                    </Link>
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({items.length})
                    </span>
                  </h3>
                  <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    {items.map((t) => (
                      <li key={t.slug}>
                        <Link
                          to={`/shablon/${t.slug}`}
                          className="text-sm text-foreground/85 hover:text-gold"
                        >
                          {t.doc.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="font-serif text-xl font-bold md:text-2xl">Статии в блога</h2>
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

        <section className="mt-10">
          <h2 className="font-serif text-xl font-bold md:text-2xl">Информация</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
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
