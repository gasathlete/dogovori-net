import { CatalogReviewNotice } from "@/components/CatalogReviewNotice";
import { useMemo } from "react";
import { Navigate, useParams } from "react-router-dom";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import * as Icons from "@/icons";
import { ArrowRight, ChevronRight, FileText } from "@/icons";
import { Header } from "@/components/Header";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";
import { CATALOG } from "@/data/catalog";
import { slugify } from "@/lib/slugify";
import { CATEGORY_HOT_LINKS } from "@/data/categoryHotLinks";
import { allTemplates } from "@/lib/templateIndex";

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const cat = useMemo(() => CATALOG.find((c) => c.id === slug), [slug]);

  if (!cat) return <Navigate to="/catalog" replace />;

  const Icon = (Icons as any)[cat.icon] ?? Icons.FileText;
  const canonical = `/kategoria/${cat.id}`;
  const title = `${cat.title} — договори, образци и бланки на български`;
  const desc = `${cat.documents.length}+ готови образци и шаблони за ${cat.title.toLowerCase()} на български. Безплатно изтегляне в PDF/DOCX, по ЗЗД, ТЗ и КТ. ${cat.intro}`.slice(0, 160);

  const breadcrumbsLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Начало", item: "https://dogovori.net/" },
      { "@type": "ListItem", position: 2, name: "Каталог", item: "https://dogovori.net/catalog" },
      { "@type": "ListItem", position: 3, name: cat.title, item: `https://dogovori.net${canonical}` },
    ],
  };

  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: cat.title,
    description: cat.intro,
    inLanguage: "bg-BG",
    url: `https://dogovori.net${canonical}`,
    hasPart: cat.documents.map((d) => ({
      "@type": "Article",
      name: d.name,
      url: `https://dogovori.net/shablon/${slugify(d.name)}`,
      description: d.purpose,
    })),
  };

  const catLower = cat.title.toLowerCase();
  const faqs = [
    {
      q: `Безплатни ли са образците в категория ${cat.title}?`,
      a: `Да. Всички ${cat.documents.length} образци в категория ${cat.title} са напълно безплатни за изтегляне в PDF и DOCX формат, без регистрация.`,
    },
    {
      q: `В какъв формат мога да изтегля документите?`,
      a: `Всеки документ от ${catLower} се генерира автоматично в DOCX (Word) и PDF, готов за печат, подпис или електронно подаване.`,
    },
    {
      q: `Съобразени ли са образците с българското законодателство?`,
      a: `Да. Шаблоните в ${catLower} са подготвени съгласно действащите ЗЗД, ТЗ, КТ и съответните подзаконови актове, актуални за 2026 г.`,
    },
    {
      q: `Колко време отнема попълването?`,
      a: `Средно 2–5 минути. Wizard‑ът ви води стъпка по стъпка, валидира данните и генерира готовия документ автоматично.`,
    },
    {
      q: `Мога ли да редактирам документа след генериране?`,
      a: `Да. DOCX файлът е напълно редактируем в Microsoft Word, Google Docs или LibreOffice, без заключени полета.`,
    },
  ];

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <div className="min-h-dvh">
      <Seo title={title} description={desc} canonical={canonical} jsonLd={[breadcrumbsLd, collectionLd, faqLd]} />

      <Header />

      <article className="container max-w-5xl py-12 md:py-16">
        <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-gold">Начало</Link>
          <ChevronRight className="h-3 w-3" />
          <Link to="/catalog" className="hover:text-gold">Каталог</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground">{cat.title}</span>
        </nav>

        <header className="mb-12 flex items-start gap-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/5 text-gold">
            <Icon className="h-6 w-6" strokeWidth={1.6} />
          </div>
          <div>
            <div className="eyebrow">
              <span className="font-serif text-sm font-normal tracking-normal text-gold/60">{cat.number}</span>
              <span className="h-px w-5 bg-gold/40" />
              Категория
            </div>
            <h1 className="mt-2 font-serif text-3xl font-bold leading-[1.1] text-balance md:text-5xl">{cat.title}</h1>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground">{cat.intro}</p>
          </div>
        </header>

        <CatalogReviewNotice catalog />
        <section className="grid gap-3 md:grid-cols-2">
          {cat.documents.map((doc) => {
            const docSlug = slugify(doc.name);
            return (
              <Link
                key={doc.name}
                to={`/shablon/${docSlug}`}
                className="group relative overflow-hidden rounded-xl surface-elevated p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-gold/45"
              >
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/0 to-transparent transition-all duration-200 group-hover:via-gold/70" />
                <div className="mb-2 flex items-start gap-2">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gold" strokeWidth={1.6} />
                  <h2 className="font-serif text-base font-bold leading-snug text-foreground transition-colors group-hover:text-gold">
                    {doc.name}
                  </h2>
                </div>

                <p className="text-xs leading-relaxed text-muted-foreground">{doc.purpose}</p>
                <p className="mt-2 text-xs italic leading-relaxed text-gold/80">⚖ {doc.keyClause}</p>
              </Link>
            );
          })}
        </section>

        {(() => {
          const hot = CATEGORY_HOT_LINKS[cat.id];
          if (!hot?.length) return null;
          const byName = new Map(allTemplates().map((t) => [t.doc.name, t.slug]));
          const resolved = hot
            .map((h) => ({ anchor: h.anchor, slug: byName.get(h.docName) }))
            .filter((h): h is { anchor: string; slug: string } => Boolean(h.slug));
          if (resolved.length === 0) return null;
          return (
            <section className="mt-12 rounded-xl border border-gold/20 bg-gold/[0.03] p-6 md:p-7">
              <h2 className="mb-4 font-serif text-lg font-bold md:text-xl">
                Често търсени в {cat.title.toLowerCase()}
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {resolved.map((h) => (
                  <li key={h.slug} className="flex gap-2 text-sm">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
                    <Link to={`/shablon/${h.slug}`} className="text-foreground/90 transition-colors hover:text-gold">
                      {h.anchor}

                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })()}

        {/* People-also-browse: sibling categories in the same sector — strengthens topic clusters */}
        {(() => {
          const siblings = CATALOG.filter((c) => c.sectorId === cat.sectorId && c.id !== cat.id).slice(0, 6);
          if (siblings.length === 0) return null;
          return (
            <section className="mt-12 rounded-xl border border-border/60 bg-card/30 p-6 md:p-7" aria-labelledby="related-cats">
              <h2 id="related-cats" className="mb-4 font-serif text-lg font-bold md:text-xl">
                Свързани категории
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {siblings.map((s) => (
                  <li key={s.id}>
                    <Link
                      to={`/kategoria/${s.id}`}
                      className="group flex items-start gap-2 rounded-lg border border-border/40 bg-background/40 p-3 transition-colors hover:border-gold/45"
                    >
                      <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold/70" strokeWidth={1.6} />
                      <span className="text-sm leading-snug text-foreground/90 group-hover:text-gold">
                        {s.title}
                        <span className="ml-1 text-xs text-muted-foreground">({s.documents.length})</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">
                Разгледайте целия{" "}
                <Link to={`/sektor/${cat.sectorId}`} className="text-gold hover:underline">
                  сектор
                </Link>
                {" "}или се върнете към{" "}
                <Link to="/catalog" className="text-gold hover:underline">пълния каталог</Link>.
              </p>
            </section>
          );
        })()}

        <section className="mt-14">
          <h2 className="mb-6 font-serif text-2xl font-bold md:text-3xl">Често задавани въпроси</h2>
          <dl className="space-y-4">
            {faqs.map((f) => (
              <div key={f.q} className="rounded-xl border border-border/60 bg-card/40 p-5">
                <dt className="font-serif text-base font-bold text-foreground">{f.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="relative mt-14 overflow-hidden rounded-2xl border border-gold/25 bg-gradient-card p-10 text-center shadow-elegant md:p-12">

          <div className="absolute inset-x-0 top-0 hairline-x" />
          <div className="eyebrow mb-4 justify-center">Готови ли сте?</div>
          <h2 className="font-serif text-2xl font-bold leading-tight text-balance md:text-[32px]">Започнете персонализиран договор</h2>
          <p className="mx-auto mt-3 max-w-2xl text-balance text-sm leading-relaxed text-muted-foreground">
            Изберете шаблон и получете готов договор в PDF и DOCX за 2 минути.
          </p>
          <Link to={`/wizard/${cat.sectorId}`} className="btn-gold mt-7">
            Започни сега <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </article>

      <SeoFooter />
    </div>
  );
}
