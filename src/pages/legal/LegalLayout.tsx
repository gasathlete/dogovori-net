import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Seo } from "@/components/Seo";

interface Props {
  title: string;
  description: string;
  updated?: string;
  /** Optional legal basis chips shown at top (e.g. ["ЗЗП чл. 47", "ЗЕТ чл. 4", "GDPR чл. 13"]). */
  basis?: string[];
  children: ReactNode;
}

export function LegalLayout({ title, description, updated = "8 май 2026 г.", basis, children }: Props) {
  const location = useLocation();

  return (
    <div className="min-h-dvh">
      <Seo
        title={`${title} · Dogovori.net`}
        description={description}
        canonical={location.pathname}
      />

      <Header />
      <main className="container max-w-3xl py-10 md:py-16">
        <p className="text-xs uppercase tracking-[0.18em] text-gold">
          <Link to="/legal" className="hover:text-foreground">Правна информация</Link>
        </p>
        <h1 className="mt-2 font-serif text-4xl font-bold md:text-5xl">{title}</h1>
        <p className="mt-3 text-xs text-muted-foreground">Последна актуализация: {updated}</p>

        {basis && basis.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Правно основание:
            </span>
            {basis.map((b) => (
              <span
                key={b}
                className="inline-flex items-center rounded border border-gold/40 bg-gold/5 px-2 py-0.5 text-[11px] font-medium text-foreground/80"
              >
                {b}
              </span>
            ))}
          </div>
        )}

        <article className="prose dark:prose-invert mt-10 max-w-none text-base leading-[1.7] text-foreground/90 [&_h2]:mt-10 [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-foreground [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-foreground [&_p]:my-4 [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-1.5 [&_a]:text-gold [&_a]:underline">
          {children}
        </article>

        <div className="mt-12 flex flex-wrap gap-3 text-xs">
          <Link to="/legal" className="text-muted-foreground hover:text-gold">Йерархия</Link>
          <span className="text-border">·</span>
          <Link to="/terms" className="text-muted-foreground hover:text-gold">Общи условия</Link>
          <span className="text-border">·</span>
          <Link to="/privacy" className="text-muted-foreground hover:text-gold">Поверителност</Link>
          <span className="text-border">·</span>
          <Link to="/cookies" className="text-muted-foreground hover:text-gold">Бисквитки</Link>
          <span className="text-border">·</span>
          <Link to="/refund" className="text-muted-foreground hover:text-gold">Възстановяване</Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
