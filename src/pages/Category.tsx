import { useMemo } from "react";
import { Navigate, useParams } from "react-router-dom";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
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
