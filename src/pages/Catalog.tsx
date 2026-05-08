import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import * as Icons from "lucide-react";
import { ArrowRight, Search, ListChecks, BookOpen } from "lucide-react";
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

  const totalDocs = CATALOG.reduce((s, c) => s + c.documents.length, 0);

  return (
    <div className="min-h-screen">
      <Header />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-0 bg-gradient-hero opacity-90" />
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
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Търсете: NDA, наем, ремонт, фактура…"
                className="h-12 border-gold/30 bg-card/60 pl-11 text-foreground backdrop-blur"
              />
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

              <div className="overflow-hidden rounded-xl border border-border/60 bg-gradient-card shadow-soft">
                {/* Desktop table */}
                <table className="hidden w-full md:table">
                  <thead>
                    <tr className="border-b border-border/60 bg-navy-light/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-5 py-3 font-medium">Документ</th>
                      <th className="px-5 py-3 font-medium">Цел</th>
                      <th className="px-5 py-3 font-medium">Ключова клауза</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cat.documents.map((doc) => {
                      const href = `/wizard/${cat.sectorId}?doc=${encodeURIComponent(doc.name)}`;
                      return (
                      <tr
                        key={doc.name}
                        onClick={() => (window.location.href = href)}
                        className="cursor-pointer border-b border-border/40 transition-colors last:border-0 hover:bg-gold/[0.04]"
                      >
                        <td className="px-5 py-4 align-top">
                          <div className="flex items-start gap-2">
                            <Link
                              to={href}
                              className="font-serif text-sm font-bold text-foreground transition-colors hover:text-gold"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {doc.name}
                            </Link>
                            {doc.badge && <Badge label={doc.badge} />}
                          </div>
                        </td>
                        <td className="px-5 py-4 align-top text-sm text-muted-foreground">
                          {doc.purpose}
                        </td>
                        <td className="px-5 py-4 align-top text-sm italic text-gold/90">
                          <div className="flex items-center justify-between gap-3">
                            <span>{doc.keyClause}</span>
                            <ArrowRight className="h-4 w-4 shrink-0 text-gold opacity-0 transition-opacity group-hover:opacity-100" />
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Mobile cards */}
                <div className="divide-y divide-border/40 md:hidden">
                  {cat.documents.map((doc) => (
                    <Link
                      key={doc.name}
                      to={`/wizard/${cat.sectorId}?doc=${encodeURIComponent(doc.name)}`}
                      className="block p-5 transition-colors hover:bg-gold/[0.04]"
                    >
                      <div className="flex items-start gap-2">
                        <h3 className="flex-1 font-serif text-base font-bold text-foreground">
                          {doc.name}
                        </h3>
                        {doc.badge && <Badge label={doc.badge} />}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{doc.purpose}</p>
                      <p className="mt-2 text-xs italic text-gold/90">⚖ {doc.keyClause}</p>
                      <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-gold">
                        Попълни договора <ArrowRight className="h-3 w-3" />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

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
