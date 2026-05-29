import { Link, useParams, Navigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";
import { getPostBySlug, getRelatedPosts } from "@/lib/blog";
import { ChevronRight } from "lucide-react";
import { BlogRatingAndComments } from "@/components/BlogRatingAndComments";
import { autoLinkParagraph, createAutoLinkState, type AutoLinkState } from "@/lib/autoLinkBlog";

function Paragraphs({ text, linkState }: { text: string; linkState: AutoLinkState }) {
  return (
    <>
      {text.split(/\n\n+/).map((p, i) => (
        <p key={i} className="mb-4 leading-[1.8] text-foreground/90">
          {autoLinkParagraph(p, linkState)}
        </p>
      ))}
    </>
  );
}

export default function BlogPost() {
  const { slug = "" } = useParams();
  const post = getPostBySlug(slug);

  if (!post) return <Navigate to="/blog" replace />;

  const related = getRelatedPosts(post.slug, 3);
  const url = `https://dogovori.net/blog/${post.slug}`;
  const imageUrl = `https://dogovori.net${post.image}`;

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.metaDescription,
    image: [imageUrl],
    datePublished: post.publishedAt,
    dateModified: post.publishedAt,
    author: { "@type": "Organization", name: "Dogovori.net" },
    publisher: {
      "@type": "Organization",
      name: "Dogovori.net",
      logo: { "@type": "ImageObject", url: "https://dogovori.net/og-image.jpg" },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    inLanguage: "bg-BG",
    articleSection: post.category,
    keywords: post.keyword,
  };

  const faqLd = post.faq.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: post.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  } : undefined;

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Начало", item: "https://dogovori.net/" },
      { "@type": "ListItem", position: 2, name: "Блог", item: "https://dogovori.net/blog" },
      { "@type": "ListItem", position: 3, name: post.title, item: url },
    ],
  };

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title={`${post.title} | Dogovori.net`}
        description={post.metaDescription}
        canonical={`/blog/${post.slug}`}
        type="article"
        image={imageUrl}
        jsonLd={faqLd ? [articleLd, faqLd, breadcrumbLd] : [articleLd, breadcrumbLd]}
      />
      <Header />

      <main className="container py-8 md:py-12">
        <nav className="mb-6 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-gold">Начало</Link>
          <ChevronRight className="h-3 w-3" />
          <Link to="/blog" className="hover:text-gold">Блог</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="truncate text-foreground/70">{post.category}</span>
        </nav>

        <article className="mx-auto max-w-3xl">
          <header className="mb-10">
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold">
              {post.category}
            </span>
            <h1 className="mt-3 font-serif text-3xl font-bold leading-[1.1] tracking-tight text-balance md:text-[44px] md:leading-[1.05]">
              {post.title}
            </h1>
            <div className="mt-5 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              <time dateTime={post.publishedAt}>
                {new Date(post.publishedAt).toLocaleDateString("bg-BG", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </time>
              <span className="opacity-50">·</span>
              <span>~{Math.max(5, Math.round((post.intro.length + post.sections.reduce((s, x) => s + x.body.length, 0)) / 1500))} мин четене</span>
            </div>
          </header>

          <figure className="mb-10 overflow-hidden rounded-xl border border-border/50">
            <img
              src={post.image}
              alt={post.title}
              className="aspect-[16/9] w-full object-cover"
              fetchPriority="high"
            />
          </figure>

          <div className="prose prose-invert max-w-none text-pretty">
            {(() => {
              const linkState = createAutoLinkState(8);
              return (
                <>
                  <Paragraphs text={post.intro} linkState={linkState} />
                  {post.sections.map((s, i) => (
                    <section key={i} className="mt-12">
                      <h2 className="mb-5 font-serif text-2xl font-bold leading-tight tracking-tight text-foreground md:text-[28px]">{s.heading}</h2>
                      <Paragraphs text={s.body} linkState={linkState} />
                    </section>
                  ))}

            {post.takeaways.length > 0 && (
              <aside className="mt-14 overflow-hidden rounded-xl border border-gold/30 bg-gold/[0.04] p-6 md:p-7">
                <div className="eyebrow mb-4">Ключови изводи</div>
                <ul className="space-y-2.5 text-sm leading-relaxed text-foreground/90">
                  {post.takeaways.map((t, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </aside>
            )}

            {post.faq.length > 0 && (
              <section className="mt-14">
                <h2 className="mb-6 font-serif text-2xl font-bold leading-tight tracking-tight md:text-[28px]">Често задавани въпроси</h2>
                <div className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/50 bg-card/30">
                  {post.faq.map((f, i) => (
                    <details key={i} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
                      <summary className="flex cursor-pointer items-start justify-between gap-3 font-serif text-base font-bold text-foreground">
                        <span>{f.q}</span>
                        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-gold transition-transform duration-200 group-open:rotate-90" />
                      </summary>
                      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
                    </details>
                  ))}
                </div>
              </section>
            )}
          </div>

          <BlogRatingAndComments postType="core" postSlug={post.slug} />

          <div className="relative mt-14 overflow-hidden rounded-2xl border border-gold/25 bg-gradient-card p-8 text-center shadow-elegant md:p-10">
            <div className="absolute inset-x-0 top-0 hairline-x" />
            <h3 className="font-serif text-xl font-bold leading-tight md:text-2xl">Нужен ви е готов договор?</h3>
            <p className="mx-auto mt-3 max-w-xl text-balance text-sm leading-relaxed text-muted-foreground">
              Над 290 професионални шаблона на български — попълнете с AI помощник за минути.
            </p>
            <Link to="/catalog" className="btn-gold mt-6">
              Виж шаблоните
            </Link>
          </div>
        </article>

        {related.length > 0 && (
          <section className="mx-auto mt-20 max-w-5xl">
            <h2 className="mb-7 font-serif text-2xl font-bold leading-tight md:text-[28px]">Свързани статии</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  to={`/blog/${r.slug}`}
                  className="group overflow-hidden rounded-xl surface-elevated transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/45"
                >
                  <div className="relative aspect-[16/9] overflow-hidden bg-navy-light">
                    <img src={r.image} alt={r.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card/90 via-transparent to-transparent opacity-60" />
                  </div>
                  <div className="p-4">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold/85">
                      {r.category}
                    </span>
                    <h3 className="mt-2 font-serif text-sm font-bold leading-snug transition-colors duration-200 group-hover:text-gold">
                      {r.title}
                    </h3>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      <SeoFooter />
    </div>
  );
}
