import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import * as Icons from "lucide-react";
import { ArrowRight, ChevronRight, FileText } from "lucide-react";
import { Header } from "@/components/Header";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";
import { CATALOG } from "@/data/catalog";
import { slugify } from "@/lib/slugify";

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const cat = useMemo(() => CATALOG.find((c) => c.id === slug), [slug]);

  if (!cat) return <Navigate to="/catalog" replace />;

  const Icon = (Icons as any)[cat.icon] ?? Icons.FileText;
  const canonical = `/kategoria/${cat.id}`;
  const title = `${cat.title} — шаблони на договори | Dogovori.net`;
  const desc = `${cat.intro} Над ${cat.documents.length} готови шаблона по българското право (ЗЗД, ТЗ, КТ).`.slice(0, 160);

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

  return (
    <div className="min-h-screen">
      <Seo title={title} description={desc} canonical={canonical} jsonLd={[breadcrumbsLd, collectionLd]} />
      <Header />

      <article className="container max-w-5xl py-12 md:py-16">
        <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-gold">Начало</Link>
          <ChevronRight className="h-3 w-3" />
          <Link to="/catalog" className="hover:text-gold">Каталог</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground">{cat.title}</span>
        </nav>

        <header className="mb-10 flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/5 text-gold">
            <Icon className="h-7 w-7" strokeWidth={1.6} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-gold">{cat.number} · Категория</div>
            <h1 className="mt-1 font-serif text-3xl font-bold leading-tight md:text-5xl">{cat.title}</h1>
            <p className="mt-3 max-w-3xl text-base text-muted-foreground">{cat.intro}</p>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-2">
          {cat.documents.map((doc) => {
            const docSlug = slugify(doc.name);
            return (
              <Link
                key={doc.name}
                to={`/shablon/${docSlug}`}
                className="group rounded-xl border border-border/60 bg-gradient-card p-5 transition-all hover:border-gold/40 hover:shadow-soft"
              >
                <div className="mb-2 flex items-start gap-2">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                  <h2 className="font-serif text-base font-bold text-foreground group-hover:text-gold">
                    {doc.name}
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground">{doc.purpose}</p>
                <p className="mt-2 text-xs italic text-gold/80">⚖ {doc.keyClause}</p>
              </Link>
            );
          })}
        </section>

        <section className="mt-12 rounded-2xl border border-gold/20 bg-gradient-card p-8 text-center shadow-elegant">
          <h2 className="font-serif text-2xl font-bold md:text-3xl">Готови ли сте?</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
            Изберете шаблон и получете готов договор в PDF и DOCX за 2 минути.
          </p>
          <Link
            to={`/wizard/${cat.sectorId}`}
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-gradient-gold px-6 py-3 text-sm font-bold uppercase tracking-wider text-navy shadow-gold"
          >
            Започни сега <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </article>

      <SeoFooter />
    </div>
  );
}
