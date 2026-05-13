import { useMemo } from "react";
import { Navigate, useParams } from "react-router-dom";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import * as Icons from "lucide-react";
import { ArrowRight, ChevronRight, FileText, ScrollText, Scale } from "lucide-react";
import { Header } from "@/components/Header";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";
import { SECTORS } from "@/data/sectors";
import { CATALOG } from "@/data/catalog";
import { SECTOR_IMAGES } from "@/lib/sectorImages";
import { slugify } from "@/lib/slugify";

export default function SectorPage() {
  const { id } = useParams<{ id: string }>();
  const sector = useMemo(() => SECTORS.find((s) => s.id === id), [id]);
  const categories = useMemo(
    () => (id ? CATALOG.filter((c) => c.sectorId === id) : []),
    [id],
  );

  if (!sector) return <Navigate to="/#sectors" replace />;

  const Icon = (Icons as any)[sector.icon] ?? Icons.FileText;
  const bgImage = SECTOR_IMAGES[sector.id];
  const totalDocs = categories.reduce((s, c) => s + c.documents.length, 0);
  const canonical = `/sektor/${sector.id}`;
  const title = `${sector.title} — договори, бланки и шаблони | Dogovori.net`;
  const desc =
    `${sector.description} ${totalDocs > 0 ? `Над ${totalDocs} готови шаблона.` : ""}`.trim();

  const breadcrumbsLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Начало", item: "https://dogovori.net/" },
      { "@type": "ListItem", position: 2, name: "Сектори", item: "https://dogovori.net/#sectors" },
      { "@type": "ListItem", position: 3, name: sector.title, item: `https://dogovori.net${canonical}` },
    ],
  };

  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: sector.title,
    description: sector.description,
    inLanguage: "bg-BG",
    url: `https://dogovori.net${canonical}`,
    hasPart: categories.flatMap((cat) =>
      cat.documents.map((d) => ({
        "@type": "Article",
        name: d.name,
        url: `https://dogovori.net/shablon/${slugify(d.name)}`,
        description: d.purpose,
      })),
    ),
  };

  return (
    <div className="min-h-screen">
      <Seo
        title={title}
        description={desc}
        canonical={canonical}
        jsonLd={[breadcrumbsLd, collectionLd]}
      />
      <Header />

      {/* Hero */}
      <section className="relative isolate overflow-hidden border-b border-border/60">
        {bgImage && (
          <>
            <img
              src={bgImage}
              alt={`${sector.title} — илюстрация`}
              className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover opacity-[0.35]"
              loading="eager"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-navy/70 via-navy/80 to-navy/95"
            />
          </>
        )}
        <div className="container relative py-14 md:py-20">
          <nav
            aria-label="Breadcrumb"
            className="mb-6 flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
          >
            <Link to="/" className="hover:text-gold">
              Начало
            </Link>
            <ChevronRight className="h-3 w-3" />
            <Link to="/#sectors" className="hover:text-gold">
              Сектори
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground">{sector.title}</span>
          </nav>

          <div className="flex items-start gap-5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-gold/35 bg-gold/10 text-gold">
              <Icon className="h-6 w-6" strokeWidth={1.6} />
            </div>
            <div className="flex-1">
              <div className="eyebrow mb-2">
                <span className="font-serif text-sm font-normal tracking-normal text-gold/60">
                  Сектор
                </span>
                <span className="h-px w-5 bg-gold/40" />
                {sector.subtitle}
              </div>
              <h1 className="font-serif text-3xl font-bold leading-[1.1] text-balance md:text-5xl lg:text-[52px]">
                {sector.title}
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-relaxed text-muted-foreground md:text-lg">
                {sector.description}
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link to={`/wizard/${sector.id}`} className="btn-gold">
                  Започни договор <ArrowRight className="h-4 w-4" />
                </Link>
                {totalDocs > 0 && (
                  <a href="#templates" className="btn-ghost-gold">
                    Виж {totalDocs}+ шаблона
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="container max-w-6xl space-y-16 py-14 md:py-20">
        {/* Основна информация */}
        <section aria-labelledby="info-heading" className="grid gap-5 md:grid-cols-3">
          <div className="rounded-xl surface-elevated p-6">
            <Scale className="mb-3 h-5 w-5 text-gold" strokeWidth={1.6} />
            <h2 id="info-heading" className="font-serif text-lg font-bold">
              Приложима правна рамка
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Документите в сектор „{sector.title}" са съобразени с действащото българско
              законодателство — Закон за задълженията и договорите (ЗЗД), Търговския закон (ТЗ) и
              специалните нормативни актове, относими към конкретния тип отношения.
            </p>
          </div>
          <div className="rounded-xl surface-elevated p-6">
            <ScrollText className="mb-3 h-5 w-5 text-gold" strokeWidth={1.6} />
            <h2 className="font-serif text-lg font-bold">Типични страни</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Договорите в този сектор обичайно се сключват между{" "}
              <span className="text-foreground">{sector.parties.a}</span> и{" "}
              <span className="text-foreground">{sector.parties.b}</span>. Системата автоматично
              адаптира страните и клаузите според конкретния документ.
            </p>
          </div>
          <div className="rounded-xl surface-elevated p-6">
            <FileText className="mb-3 h-5 w-5 text-gold" strokeWidth={1.6} />
            <h2 className="font-serif text-lg font-bold">Какво включва</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {totalDocs > 0
                ? `${totalDocs} професионални шаблона, групирани в ${categories.length} ${
                    categories.length === 1 ? "категория" : "категории"
                  }.`
                : "Стратегическо интервю и индивидуални клаузи за този сектор."}{" "}
              Всеки документ преминава риск-анализ и експорт в PDF и DOCX.
            </p>
          </div>
        </section>

        {/* Категории и шаблони */}
        {categories.length > 0 && (
          <section id="templates" className="scroll-mt-24 space-y-12">
            <div>
              <div className="eyebrow mb-3">
                <span className="font-serif text-base font-normal tracking-normal text-gold/60">
                  02
                </span>
                <span className="h-px w-6 bg-gold/40" />
                Готови шаблони
              </div>
              <h2 className="font-serif text-2xl font-bold leading-tight md:text-[34px]">
                Документи в сектор „{sector.title}"
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Изберете шаблон и започнете персонализирано стратегическо интервю.
              </p>
            </div>

            {categories.map((cat) => {
              const CatIcon = (Icons as any)[cat.icon] ?? Icons.FileText;
              return (
                <article key={cat.id} className="space-y-5">
                  <header className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gold/25 bg-gold/5 text-gold">
                      <CatIcon className="h-5 w-5" strokeWidth={1.6} />
                    </div>
                    <div className="flex-1">
                      <div className="eyebrow">
                        <span className="font-serif text-xs font-normal tracking-normal text-gold/60">
                          {cat.number}
                        </span>
                        <span className="h-px w-5 bg-gold/40" />
                        Категория
                      </div>
                      <h3 className="mt-1.5 font-serif text-xl font-bold md:text-2xl">
                        <Link
                          to={`/kategoria/${cat.id}`}
                          className="transition-colors hover:text-gold"
                        >
                          {cat.title}
                        </Link>
                      </h3>
                      <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                        {cat.intro}
                      </p>
                    </div>
                  </header>

                  <div className="grid gap-3 md:grid-cols-2">
                    {cat.documents.map((doc) => (
                      <Link
                        key={doc.name}
                        to={`/shablon/${slugify(doc.name)}`}
                        className="group relative overflow-hidden rounded-xl surface-elevated p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-gold/45"
                      >
                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/0 to-transparent transition-all duration-200 group-hover:via-gold/70" />
                        <div className="mb-2 flex items-start gap-2">
                          <FileText
                            className="mt-0.5 h-4 w-4 shrink-0 text-gold"
                            strokeWidth={1.6}
                          />
                          <h4 className="font-serif text-base font-bold leading-snug text-foreground transition-colors group-hover:text-gold">
                            {doc.name}
                          </h4>
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {doc.purpose}
                        </p>
                        <p className="mt-2 text-xs italic leading-relaxed text-gold/80">
                          ⚖ {doc.keyClause}
                        </p>
                      </Link>
                    ))}
                  </div>
                </article>
              );
            })}
          </section>
        )}

        {/* CTA */}
        <section className="relative overflow-hidden rounded-2xl border border-gold/25 bg-gradient-card p-10 text-center shadow-elegant md:p-12">
          <div className="absolute inset-x-0 top-0 hairline-x" />
          <div className="eyebrow mb-4 justify-center">Готови ли сте?</div>
          <h2 className="font-serif text-2xl font-bold leading-tight text-balance md:text-[32px]">
            Започнете персонализиран документ за {sector.title.toLowerCase()}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-balance text-sm leading-relaxed text-muted-foreground">
            Стратегическо интервю, риск-анализ и готов договор в PDF и DOCX за под 2 минути.
          </p>
          <Link to={`/wizard/${sector.id}`} className="btn-gold mt-7">
            Започни сега <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </main>

      <SeoFooter />
    </div>
  );
}
