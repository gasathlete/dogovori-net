import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import * as Icons from "lucide-react";
import { ArrowRight, Search, ListChecks, BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Input } from "@/components/ui/input";
import { CATALOG } from "@/data/catalog";
import { CompanionChip } from "@/components/CompanionChip";

export default function CatalogPage() {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
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

  return (
    <div className="min-h-screen">
      <Header />

      {/* Hero */}
      <section className="relative border-b border-border/60">
        <div className="absolute inset-0 overflow-hidden bg-gradient-hero opacity-90" />
        <div className="container relative py-16 md:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/5 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-gold">
              <BookOpen className="h-3.5 w-3.5" />
              Каталог на документите
            </div>
            <h1 className="font-serif text-4xl font-bold leading-tight md:text-5xl">
              {totalDocs}+ професионални договора и бланки
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground">
              Структуриран каталог по сектори – от трудови и наемни отношения до IT, крипто и
              корпоративно управление. Всеки документ съдържа цел и ключова клауза.
            </p>
            <div className="relative mx-auto mt-8 max-w-xl">
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
                className="h-12 border-gold/30 bg-card/60 pl-11 text-foreground backdrop-blur"
              />
              {open && query.trim() && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-lg border border-gold/30 bg-card/95 text-left shadow-elegant backdrop-blur-xl">
                  <ul className="max-h-[60vh] overflow-y-auto">
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
      </section>

      {/* Sticky category nav */}
      <nav className="sticky top-16 z-30 border-b border-border/60 bg-navy/90 backdrop-blur-xl">
        <div className="container flex gap-2 overflow-x-auto py-3 text-xs">
          {CATALOG.map((cat) => (
            <a
              key={cat.id}
              href={`#${cat.id}`}
              className="whitespace-nowrap rounded-full border border-border/60 bg-card/40 px-3 py-1.5 text-muted-foreground transition-all hover:border-gold/50 hover:text-gold"
            >
              {cat.number} · {cat.title}
            </a>
          ))}
        </div>
      </nav>

      {/* Categories */}
      <main className="container space-y-16 py-16">
        {filtered.map((cat) => {
          const Icon = (Icons as any)[cat.icon] ?? Icons.FileText;
          return (
            <section key={cat.id} id={cat.id} className="scroll-mt-32">
              <div className="mb-6 flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/5 text-gold">
                  <Icon className="h-6 w-6" strokeWidth={1.6} />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-gold">
                    {cat.number} · Категория
                  </div>
                  <h2 className="mt-1 font-serif text-2xl font-bold md:text-3xl">{cat.title}</h2>
                  <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{cat.intro}</p>
                </div>
              </div>

              <CategoryDocs cat={cat} forceExpanded={!!query.trim()} />

              {cat.companions && cat.companions.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border/40 bg-navy-light/20 px-4 py-3 text-xs">
                  <ListChecks className="h-3.5 w-3.5 text-gold" />
                  <span className="uppercase tracking-wider text-muted-foreground">
                    Придружаващи документи:
                  </span>
                  {cat.companions.map((c) => (
                    <CompanionChip key={c} name={c} />
                  ))}
                </div>
              )}
            </section>
          );
        })}

        {filtered.length === 0 && (
          <div className="rounded-xl border border-border/60 bg-gradient-card p-12 text-center">
            <p className="text-muted-foreground">
              Няма намерени документи за „{query}". Опитайте с друго търсене.
            </p>
          </div>
        )}
      </main>

      {/* CTA */}
      <section className="container pb-20">
        <div className="rounded-2xl border border-gold/20 bg-gradient-card p-10 text-center shadow-elegant">
          <div className="mb-3 text-xs uppercase tracking-[0.2em] text-gold">Готови ли сте?</div>
          <h3 className="font-serif text-2xl font-bold md:text-3xl">
            Започнете персонализиран договор сега
          </h3>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
            Стратегически интервюта и системен риск-анализ – в съответствие със ЗЗД, ТЗ и ЗУТ.
          </p>
          <Link
            to="/#sectors"
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-gradient-gold px-6 py-3 text-sm font-bold uppercase tracking-wider text-navy shadow-gold transition-all hover:shadow-[0_15px_50px_-10px_hsl(43_55%_54%_/_0.5)]"
          >
            Намери договор <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <Footer />
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
