import { ReactNode, useEffect } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

interface Props {
  title: string;
  description: string;
  updated?: string;
  children: ReactNode;
}

export function LegalLayout({ title, description, updated = "8 май 2026 г.", children }: Props) {
  useEffect(() => {
    document.title = `${title} · Dogovori.net`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", description);
  }, [title, description]);

  return (
    <div className="min-h-dvh">
      <Header />
      <main className="container max-w-3xl py-10 md:py-16">
        <p className="text-xs uppercase tracking-[0.18em] text-gold">Правна информация</p>
        <h1 className="mt-2 font-serif text-3xl font-bold md:text-4xl">{title}</h1>
        <p className="mt-2 text-xs text-muted-foreground">Последна актуализация: {updated}</p>
        <article className="prose prose-invert mt-8 max-w-none text-sm leading-relaxed text-foreground/90 [&_h2]:mt-8 [&_h2]:font-serif [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-foreground [&_h3]:mt-5 [&_h3]:font-semibold [&_h3]:text-foreground [&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-1 [&_a]:text-gold [&_a]:underline">
          {children}
        </article>
        <div className="mt-12 flex flex-wrap gap-3 text-xs">
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
