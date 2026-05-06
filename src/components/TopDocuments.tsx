import { Link } from "react-router-dom";
import { TOP_DOCUMENTS } from "@/data/catalog";
import { ArrowRight, Star } from "lucide-react";

export function TopDocuments() {
  return (
    <section id="top-documents" className="border-y border-border/60 bg-navy-light/30 py-20">
      <div className="container">
        <div className="mb-12 max-w-2xl">
          <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-gold">
            <Star className="h-3.5 w-3.5" />
            03 · Топ 5 най-търсени
          </div>
          <h2 className="font-serif text-3xl font-bold md:text-4xl">
            Най-използваните договори в България
          </h2>
          <p className="mt-3 text-muted-foreground">
            Бърз достъп до петте най-често търсени документа – готови за персонализиране.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
          {TOP_DOCUMENTS.map((doc, i) => (
            <Link
              key={doc.name}
              to={`/wizard/${doc.sectorId}`}
              style={{ animationDelay: `${i * 60}ms` }}
              className="group relative overflow-hidden rounded-xl border border-border/60 bg-gradient-card p-5 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-gold/50 hover:shadow-elegant animate-fade-in-up"
            >
              <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-md border border-gold/30 bg-gold/10 font-serif text-sm font-bold text-gold">
                {i + 1}
              </div>
              <h3 className="font-serif text-base font-bold leading-tight text-foreground">
                {doc.name}
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {doc.description}
              </p>
              <div className="mt-4 flex items-center gap-1 text-xs font-medium text-gold opacity-0 transition-opacity group-hover:opacity-100">
                Виж в каталога <ArrowRight className="h-3 w-3" />
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            to="/catalog"
            className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/5 px-5 py-2.5 text-sm font-medium text-gold transition-all hover:bg-gold/10"
          >
            Целият каталог с документи
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
