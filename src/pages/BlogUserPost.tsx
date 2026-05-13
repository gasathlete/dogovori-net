import { useEffect, useState } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { SeoFooter } from "@/components/SeoFooter";
import { Seo } from "@/components/Seo";
import { ChevronRight, Loader2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BlogRatingAndComments } from "@/components/BlogRatingAndComments";

interface UserArticle {
  id: string;
  slug: string;
  title: string;
  category: string;
  summary: string;
  meta_description: string;
  image_url: string;
  intro: string;
  sections: { heading: string; body: string }[];
  faq: { q: string; a: string }[];
  takeaways: string[];
  source: "user" | "admin";
  published_at: string | null;
  created_at: string;
  user_id: string;
  author_name?: string | null;
}

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n\n+/).map((p, i) => (
        <p key={i} className="mb-4 leading-[1.8] text-foreground/90">{p}</p>
      ))}
    </>
  );
}

export default function BlogUserPost() {
  const { slug = "" } = useParams();
  const [post, setPost] = useState<UserArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("user_articles")
        .select("*")
        .eq("slug", slug)
        .eq("status", "approved")
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) { setNotFound(true); setLoading(false); return; }
      const article = data as unknown as UserArticle;
      const { data: prof } = await supabase
        .from("profiles").select("display_name").eq("id", article.user_id).maybeSingle();
      article.author_name = prof?.display_name ?? null;
      setPost(article);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (notFound) return <Navigate to="/blog" replace />;
  if (loading || !post) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  const url = `https://dogovori.net/blog/u/${post.slug}`;
  const dateStr = post.published_at ?? post.created_at;

  return (
    <div className="min-h-screen bg-background">
      <Seo
        title={`${post.title} | Dogovori.net`}
        description={post.meta_description || post.summary}
        canonical={`/blog/u/${post.slug}`}
        type="article"
        image={post.image_url}
      />
      <Header />
      <main className="container py-8 md:py-12">
        <nav className="mb-6 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-gold">Начало</Link>
          <ChevronRight className="h-3 w-3" />
          <Link to="/blog" className="hover:text-gold">Блог</Link>
          <ChevronRight className="h-3 w-3" />
          <span className="truncate text-foreground/70">Статии от потребители</span>
        </nav>

        <article className="mx-auto max-w-3xl">
          <header className="mb-10">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold">
                {post.category}
              </span>
              <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                {post.source === "admin" ? "Редакция" : "От потребител"}
              </span>
            </div>
            <h1 className="mt-3 font-serif text-3xl font-bold leading-[1.1] tracking-tight md:text-[44px] md:leading-[1.05]">
              {post.title}
            </h1>
            <div className="mt-5 flex flex-wrap items-center gap-3 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <User className="h-3 w-3" />
                {post.author_name || "Анонимен"}
              </span>
              <span className="opacity-50">·</span>
              <time dateTime={dateStr}>
                {new Date(dateStr).toLocaleDateString("bg-BG", { day: "numeric", month: "long", year: "numeric" })}
              </time>
            </div>
          </header>

          <figure className="mb-10 overflow-hidden rounded-xl border border-border/50">
            <img src={post.image_url} alt={post.title} className="aspect-[16/9] w-full object-cover" />
          </figure>

          <div className="prose prose-invert max-w-none text-pretty">
            <Paragraphs text={post.intro} />
            {(post.sections ?? []).map((s, i) => (
              <section key={i} className="mt-12">
                <h2 className="mb-5 font-serif text-2xl font-bold leading-tight tracking-tight md:text-[28px]">{s.heading}</h2>
                <Paragraphs text={s.body} />
              </section>
            ))}

            {(post.takeaways ?? []).length > 0 && (
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

            {(post.faq ?? []).length > 0 && (
              <section className="mt-14">
                <h2 className="mb-6 font-serif text-2xl font-bold leading-tight tracking-tight md:text-[28px]">Често задавани въпроси</h2>
                <div className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/50 bg-card/30">
                  {post.faq.map((f, i) => (
                    <details key={i} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
                      <summary className="flex cursor-pointer items-start justify-between gap-3 font-serif text-base font-bold">
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

          <BlogRatingAndComments postType="user" postSlug={post.slug} />
        </article>
      </main>
      <SeoFooter />
    </div>
  );
}
