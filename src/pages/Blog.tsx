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
      <main className="container py-10 md:py-16">
        <header className="mx-auto max-w-3xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-gold">Блог</p>
          <h1 className="text-3xl font-bold leading-tight tracking-tight md:text-5xl">
            Юридически насоки за договорите в България
          </h1>
          <p className="mt-4 text-base text-muted-foreground md:text-lg">
            Кратки и точни статии с цитирани членове от ЗЗД, КТ, ТЗ и СК — написани от практикуващи юристи.
          </p>
        </header>

        <div className="mx-auto mt-10 flex max-w-4xl flex-wrap justify-center gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setActive(c)}
              className={`rounded-full border px-4 py-1.5 text-xs transition-colors ${
                active === c
                  ? "border-gold/60 bg-gold/15 text-gold"
                  : "border-border/60 bg-card/30 text-muted-foreground hover:border-gold/40 hover:text-gold"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <section className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (
            <Link
              key={p.slug}
              to={`/blog/${p.slug}`}
              className="group flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card/40 transition-all hover:border-gold/40 hover:bg-card/60"
            >
              <div className="aspect-[16/9] overflow-hidden bg-navy-light">
                <img
                  src={p.image}
                  alt={p.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <div className="flex flex-1 flex-col gap-3 p-5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold/80">
                  {p.category}
                </span>
                <h2 className="text-base font-semibold leading-snug text-foreground transition-colors group-hover:text-gold">
                  {p.title}
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground line-clamp-3">{p.summary}</p>
                <time className="mt-auto text-xs text-muted-foreground/70" dateTime={p.publishedAt}>
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
