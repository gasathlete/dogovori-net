import React, { useEffect, useMemo, useState } from "react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import * as Icons from "lucide-react";
import { ArrowRight, Search, ListChecks, BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { Header } from "@/components/Header";
import { SeoFooter } from "@/components/SeoFooter";
import { Input } from "@/components/ui/input";
import { CATALOG } from "@/data/catalog";
import { CompanionChip } from "@/components/CompanionChip";
import { Seo } from "@/components/Seo";
import { allTemplates } from "@/lib/templateIndex";
import { slugify } from "@/lib/slugify";

export default function CatalogPage() {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    if (window.location.hash) {
      const id = window.location.hash.replace("#", "");
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return CATALOG;
    const q = query.toLowerCase();
    return CATALOG.map((cat) => ({
      ...cat,
      documents: cat.documents.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.purpose.toLowerCase().includes(q) ||
          d.keyClause.toLowerCase().includes(q),
      ),
    })).filter((c) => c.documents.length > 0);
  }, [query]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as { name: string; purpose: string; sectorId: string; catTitle: string }[];
    const out: { name: string; purpose: string; sectorId: string; catTitle: string; score: number }[] = [];
    for (const cat of CATALOG) {
      for (const d of cat.documents) {
        const name = d.name.toLowerCase();
        const purpose = d.purpose.toLowerCase();
        let score = 0;
        if (name.startsWith(q)) score = 3;
        else if (name.includes(q)) score = 2;
        else if (purpose.includes(q)) score = 1;
        if (score > 0) {
          out.push({ name: d.name, purpose: d.purpose, sectorId: cat.sectorId, catTitle: cat.title, score });
        }
      }
    }
    return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }, [query]);

  const visibleSuggestions = showAll ? suggestions : suggestions.slice(0, 5);
  const remaining = suggestions.length - visibleSuggestions.length;

  const totalDocs = CATALOG.reduce((s, c) => s + c.documents.length, 0);

  const itemListLd = useMemo(() => ({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Каталог на договори и бланки на български",
    numberOfItems: allTemplates().length,
    itemListElement: allTemplates().map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `https://dogovori.net/shablon/${t.slug}`,
      name: t.doc.name,
    })),
  }), []);

  const breadcrumbsLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Начало", item: "https://dogovori.net/" },
      { "@type": "ListItem", position: 2, name: "Каталог", item: "https://dogovori.net/catalog" },
    ],
  };

  return (
    <div className="min-h-screen">
      <Seo
        title={`Каталог: ${totalDocs}+ договора и бланки на български | Dogovori.net`}
        description={`Пълен каталог на ${totalDocs}+ професионални договори и правни бланки на български – трудови, наем, IT, NDA, GDPR. Готови за попълване.`}
        canonical="/catalog"
        jsonLd={[itemListLd, breadcrumbsLd]}
      />
      <Header />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-0 bg-gradient-hero opacity-90" />
        <div className="absolute inset-0 bg-fine-grid opacity-50" />
        <div className="absolute inset-x-0 top-0 hairline-x" />
        <div className="container relative py-16 md:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <div className="eyebrow mb-5 justify-center">
              <BookOpen className="h-3.5 w-3.5" />
              Каталог на документите
            </div>
            <h1 className="font-serif text-3xl font-bold leading-[1.1] text-balance md:text-5xl lg:text-[56px]">
              {totalDocs}+ професионални договора и бланки
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-balance text-base leading-relaxed text-muted-foreground md:text-lg">
              Структуриран каталог по сектори — от трудови и наемни отношения до IT, крипто и
              корпоративно управление. Всеки документ съдържа цел и ключова клауза.
            </p>
            <div className="relative mx-auto mt-10 max-w-xl">
              <Search className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowAll(false);
                  setOpen(true);
                }}
                onInput={() => setOpen(true)}
                onKeyDown={() => setOpen(true)}
                onCompositionUpdate={() => setOpen(true)}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                placeholder="Търсете: NDA, наем, ремонт, фактура…"
                className="h-14 border-gold/30 bg-card/70 pl-11 text-base text-foreground backdrop-blur transition-colors focus-visible:border-gold/60"
              />
              {open && query.trim() && suggestions.length > 0 && (
                <div
                  className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-lg border border-gold/30 bg-card/95 text-left shadow-elegant backdrop-blur-xl"
                  onMouseDown={(e) => e.preventDefault()}
                  onTouchStart={(e) => e.stopPropagation()}
                >
                  <ul className="max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
                    {visibleSuggestions.map((s) => (
                      <li key={`${s.sectorId}-${s.name}`}>
                        <Link
                          to={`/wizard/${s.sectorId}?doc=${encodeURIComponent(s.name)}`}
                          className="block border-b border-border/40 px-4 py-3 transition-colors last:border-0 hover:bg-gold/[0.06]"
                          onMouseDown={(e) => e.preventDefault()}
                        >
                          <div className="font-serif text-sm font-bold text-foreground">{s.name}</div>
                          <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{s.purpose}</div>
                          <div className="mt-1 text-[10px] uppercase tracking-wider text-gold/80">{s.catTitle}</div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {remaining > 0 && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setShowAll(true)}
                      className="block w-full border-t border-border/60 bg-navy-light/40 px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-gold transition-colors hover:bg-gold/10"
                    >
                      Покажи още (+{remaining})
                    </button>
                  )}
                  {showAll && suggestions.length > 5 && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setShowAll(false)}
                      className="block w-full border-t border-border/60 bg-navy-light/40 px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-gold"
                    >
                      Свий списъка
                    </button>
                  )}
                </div>
              )}
              {open && query.trim() && suggestions.length === 0 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-lg border border-border/60 bg-card/95 px-4 py-3 text-left text-sm text-muted-foreground shadow-elegant backdrop-blur-xl">
                  Няма съвпадения за „{query}"
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 hairline-x opacity-60" />
      </section>

      {/* Sticky category nav */}
      <nav className="sticky top-16 z-30 border-b border-border/60 bg-navy/85 backdrop-blur-xl">
        <div className="relative">
          <div className="container flex snap-x snap-mandatory gap-2 overflow-x-auto py-3 text-xs [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {CATALOG.map((cat) => (
              <a
                key={cat.id}
                href={`#${cat.id}`}
                className="group snap-start whitespace-nowrap rounded-full border border-border/60 bg-card/40 px-3.5 py-1.5 font-medium text-muted-foreground transition-colors duration-200 hover:border-gold/50 hover:bg-gold/5 hover:text-gold"
              >
                <span className="mr-1.5 font-serif text-gold/60 group-hover:text-gold/80">{cat.number}</span>
                {cat.title}
              </a>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-navy/95 to-transparent md:hidden" />
        </div>
      </nav>

      {/* Categories */}
      <main className="container space-y-20 py-16 md:py-20">
        {filtered.map((cat) => {
          const Icon = (Icons as any)[cat.icon] ?? Icons.FileText;
          return (
            <section key={cat.id} id={cat.id} className="scroll-mt-32">
              <div className="mb-7 flex items-start gap-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/5 text-gold">
                  <Icon className="h-5 w-5" strokeWidth={1.6} />
                </div>
                <div className="flex-1">
                  <div className="eyebrow">
                    <span className="font-serif text-sm font-normal tracking-normal text-gold/60">{cat.number}</span>
                    <span className="h-px w-5 bg-gold/40" />
                    Категория
                  </div>
                  <h2 className="mt-2 font-serif text-2xl font-bold leading-tight md:text-[32px]">{cat.title}</h2>
                  <p className="mt-2.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">{cat.intro}</p>
                </div>
                <Link
                  to={`/kategoria/${cat.id}`}
                  className="hidden shrink-0 items-center gap-1.5 self-start text-[11px] font-semibold uppercase tracking-[0.18em] text-gold transition-opacity hover:opacity-80 md:inline-flex"
                >
                  Виж всички <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <CategoryDocs cat={cat} forceExpanded={!!query.trim()} />

              {cat.companions && cat.companions.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border/50 bg-navy-light/20 px-4 py-3 text-xs">
                  <ListChecks className="h-3.5 w-3.5 text-gold" />
                  <span className="font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Придружаващи документи
                  </span>
                  <span className="text-muted-foreground/50">·</span>
                  {cat.companions.map((c) => (
                    <CompanionChip key={c} name={c} />
                  ))}
                </div>
              )}
            </section>
          );
        })}

        {filtered.length === 0 && (
          <div className="rounded-xl surface-elevated p-12 text-center">
            <p className="text-muted-foreground">
              Няма намерени документи за „{query}". Опитайте с друго търсене.
            </p>
          </div>
        )}
      </main>

      {/* CTA */}
      <section className="container pb-20">
        <div className="relative overflow-hidden rounded-2xl border border-gold/25 bg-gradient-card p-10 text-center shadow-elegant md:p-14">
          <div className="absolute inset-x-0 top-0 hairline-x" />
          <div className="eyebrow mb-4 justify-center">Готови ли сте?</div>
          <h3 className="font-serif text-2xl font-bold leading-tight text-balance md:text-[34px]">
            Започнете персонализиран договор сега
          </h3>
          <p className="mx-auto mt-4 max-w-2xl text-balance text-sm leading-relaxed text-muted-foreground md:text-base">
            Стратегически интервюта и системен риск-анализ — в съответствие със ЗЗД, ТЗ и ЗУТ.
          </p>
          <Link to="/#sectors" className="btn-gold mt-7">
            Намери договор <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <SeoFooter />
    </div>
  );
}

function Badge({ label }: { label: string }) {
  const styles =
    label === "TOP"
      ? "border-gold/40 bg-gold/10 text-gold"
      : label === "NEW"
        ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
        : "border-purple-400/40 bg-purple-400/10 text-purple-300";
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${styles}`}
    >
      {label}
    </span>
  );
}

const INITIAL_DOCS = 5;

function CategoryDocs({ cat, forceExpanded }: { cat: any; forceExpanded: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isOpen = expanded || forceExpanded;

  const ordered = useMemo(() => {
    const rank = (b?: string) => (b === "TOP" ? 0 : b === "NEW" ? 1 : 2);
    const idx = cat.documents.map((d: any, i: number) => ({ d, i }));
    idx.sort((a: any, b: any) => rank(a.d.badge) - rank(b.d.badge) || a.i - b.i);
    return idx.map((x: any) => x.d);
  }, [cat]);

  const visible = isOpen ? ordered : ordered.slice(0, INITIAL_DOCS);
  const remaining = ordered.length - INITIAL_DOCS;

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border/60 bg-gradient-card shadow-soft">
        <table className="hidden w-full md:table">
          <thead>
            <tr className="border-b border-border/60 bg-navy-light/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3 font-medium">Документ</th>
              <th className="px-5 py-3 font-medium">Цел</th>
              <th className="px-5 py-3 font-medium">Ключова клауза</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((doc: any) => {
              const docSlug = slugify(doc.name);
              const wizardHref = `/wizard/${cat.sectorId}?doc=${encodeURIComponent(doc.name)}`;
              const shablonHref = `/shablon/${docSlug}`;
              return (
                <tr
                  key={doc.name}
                  onClick={() => (window.location.href = shablonHref)}
                  style={{ contentVisibility: "auto", containIntrinsicSize: "80px" } as React.CSSProperties}
                  className="cursor-pointer border-b border-border/40 transition-colors last:border-0 hover:bg-gold/[0.04]"
                >
                  <td className="px-5 py-4 align-top">
                    <div className="flex items-start gap-2">
                      <Link
                        to={shablonHref}
                        className="font-serif text-sm font-bold text-foreground transition-colors hover:text-gold"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {doc.name}
                      </Link>
                      {doc.badge && <Badge label={doc.badge} />}
                    </div>
                  </td>
                  <td className="px-5 py-4 align-top text-sm text-muted-foreground">{doc.purpose}</td>
                  <td className="px-5 py-4 align-top text-sm italic text-gold/90">
                    <div className="flex items-center justify-between gap-3">
                      <span>{doc.keyClause}</span>
                      <Link
                        to={wizardHref}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 text-xs font-bold uppercase tracking-wider text-gold hover:underline"
                      >
                        Попълни →
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="divide-y divide-border/40 md:hidden">
          {visible.map((doc: any) => (
            <Link
              key={doc.name}
              to={`/shablon/${slugify(doc.name)}`}
              style={{ contentVisibility: "auto", containIntrinsicSize: "150px" } as React.CSSProperties}
              className="block p-5 transition-colors hover:bg-gold/[0.04]"
            >
              <div className="flex items-start gap-2">
                <h3 className="flex-1 font-serif text-base font-bold text-foreground">{doc.name}</h3>
                {doc.badge && <Badge label={doc.badge} />}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{doc.purpose}</p>
              <p className="mt-2 text-xs italic text-gold/90">⚖ {doc.keyClause}</p>
              <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-gold">
                Виж шаблона <ArrowRight className="h-3 w-3" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {!forceExpanded && remaining > 0 && (
        <div className="mt-3 flex justify-center">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/5 px-4 py-2 text-xs font-medium uppercase tracking-wider text-gold transition-all hover:bg-gold/10"
          >
            {expanded ? (
              <>Свий <ChevronUp className="h-3.5 w-3.5" /></>
            ) : (
              <>Покажи още {remaining} документа <ChevronDown className="h-3.5 w-3.5" /></>
            )}
          </button>
        </div>
      )}
    </>
  );
}
