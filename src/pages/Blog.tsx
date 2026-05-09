import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";
import { ALL_POSTS, getAllCategories } from "@/lib/blog";
import { useMemo, useState } from "react";

export default function Blog() {
  const categories = useMemo(() => ["Всички", ...getAllCategories()], []);
  const [active, setActive] = useState("Всички");

  const posts = active === "Всички" ? ALL_POSTS : ALL_POSTS.filter((p) => p.category === active);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Dogovori.net Блог",
    description:
      "Експертни статии за договорно, трудово, търговско и семейно право в България — с цитирани закони и практически примери.",
    url: "https://dogovori.net/blog",
    blogPost: ALL_POSTS.slice(0, 10).map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      url: `https://dogovori.net/blog/${p.slug}`,
      datePublished: p.publishedAt,
      image: `https://dogovori.net${p.image}`,
    })),
  };

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title="Блог за договорно право в България | Dogovori.net"
        description="Експертни статии за договори, трудово право, имоти, GDPR и данъци. Цитирани закони от ЗЗД, КТ, ТЗ и практически съвети."
        canonical="/blog"
        jsonLd={jsonLd}
      />
      <Header />
      <main className="container py-14 md:py-20">
        <header className="mx-auto max-w-3xl text-center">
          <div className="eyebrow mb-4 justify-center">Блог</div>
          <h1 className="font-serif text-3xl font-bold leading-[1.1] tracking-tight text-balance md:text-5xl lg:text-[56px]">
            Юридически насоки за договорите в България
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-base leading-relaxed text-muted-foreground md:text-lg">
            Кратки и точни статии с цитирани членове от ЗЗД, КТ, ТЗ и СК — написани от практикуващи юристи.
          </p>
        </header>

        <div className="mx-auto mt-10 flex max-w-4xl flex-wrap justify-center gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setActive(c)}
              className={`rounded-full border px-4 py-1.5 text-xs font-medium transition-colors duration-200 ${
                active === c
                  ? "border-gold/55 bg-gold/15 text-gold"
                  : "border-border/60 bg-card/30 text-muted-foreground hover:border-gold/40 hover:bg-gold/5 hover:text-gold"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <section className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (
            <Link
              key={p.slug}
              to={`/blog/${p.slug}`}
              className="group relative flex flex-col overflow-hidden rounded-xl surface-elevated transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/45"
            >
              <div className="relative aspect-[16/9] overflow-hidden bg-navy-light">
                <img
                  src={p.image}
                  alt={p.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card/90 via-transparent to-transparent opacity-60" />
              </div>
              <div className="flex flex-1 flex-col gap-3 p-5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold/85">
                  {p.category}
                </span>
                <h2 className="font-serif text-lg font-bold leading-snug text-foreground transition-colors duration-200 group-hover:text-gold">
                  {p.title}
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground line-clamp-3">{p.summary}</p>
                <time className="mt-auto text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70" dateTime={p.publishedAt}>
                  {new Date(p.publishedAt).toLocaleDateString("bg-BG", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </time>
              </div>
            </Link>
          ))}
        </section>
      </main>
      <SeoFooter />
    </div>
  );
}
