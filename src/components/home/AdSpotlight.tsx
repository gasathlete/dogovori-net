/**
 * „Реклама“ — лека интерактивна лента под лентата с партньори.
 *
 * Съдържа две части:
 *  1. Активните рекламни места от `home_ad_slots` (управляват се в админ панела,
 *     с точен край на периода и видим оставащ срок).
 *  2. Двете най-посещавани статии от блога — броят идва от агрегираща функция
 *     в базата (`top_blog_articles`), без лични данни. При липса на данни
 *     секцията не показва измислени числа.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, BookOpen, Megaphone } from "@/icons";
import { Button } from "@/components/ui/button";

type AdRow = {
  id: string;
  title: string;
  excerpt: string | null;
  link: string;
  image_url: string | null;
  badge: string | null;
  ends_at: string | null;
};

type PostMeta = { slug: string; title: string; summary: string; category: string; image?: string };

type Card = {
  key: string;
  title: string;
  excerpt: string;
  href: string;
  badge: string;
  image?: string | null;
  endsAt?: string | null;
  meta?: string;
};

/** Оставащо време до края на рекламата, изписано на български. */
function remainingLabel(endsAt: string, now: number): string | null {
  const left = new Date(endsAt).getTime() - now;
  if (!Number.isFinite(left) || left <= 0) return null;
  const s = Math.floor(left / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `Остават ${d} дни и ${h} ч.`;
  if (h > 0) return `Остават ${h} ч. и ${m} мин.`;
  if (m > 0) return `Остават ${m} мин. и ${sec} сек.`;
  return `Остават ${sec} сек.`;
}

function imageForAd(ad: AdRow): string | null {
  if (ad.image_url?.trim()) return ad.image_url.trim();
  const match = ad.link.match(/^\/blog\/([^/?#]+)\/?(?:[?#].*)?$/);
  return match?.[1] ? `/blog/${match[1]}.webp` : null;
}

export function AdSpotlight() {
  const [ads, setAds] = useState<AdRow[]>([]);
  const [topPosts, setTopPosts] = useState<PostMeta[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [active, setActive] = useState(0);

  // Активни реклами
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("home_ad_slots")
      .select("id,title,excerpt,link,image_url,badge,ends_at")
      .order("display_order", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(6)
      .then(({ data }) => {
        if (!cancelled) setAds((data as AdRow[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Двете най-посещавани статии — точен ред по реални посещения.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("top_blog_articles", { _limit: 6 });
      if (error || !Array.isArray(data)) return;
      const slugs = (data as { path: string }[])
        .map((r) => r.path.replace(/^\/blog\//, "").replace(/\/$/, ""))
        .filter(Boolean);
      if (slugs.length === 0) return;
      const { ALL_POSTS } = await import("@/lib/blog");
      const picked: PostMeta[] = [];
      for (const slug of slugs) {
        const post = ALL_POSTS.find((p) => p.slug === slug);
        if (post) {
          picked.push({
            slug: post.slug,
            title: post.title,
            summary: post.summary,
            category: post.category,
            image: (post as { image?: string }).image,
          });
        }
        if (picked.length === 2) break;
      }
      if (!cancelled) setTopPosts(picked);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Тиктакащ таймер само докато има реклама с краен срок.
  const hasDeadline = ads.some((a) => a.ends_at);
  useEffect(() => {
    if (!hasDeadline) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hasDeadline]);

  const cards = useMemo<Card[]>(() => {
    const adCards: Card[] = ads
      .filter((a) => !a.ends_at || new Date(a.ends_at).getTime() > now)
      .map((a) => ({
        key: `ad-${a.id}`,
        title: a.title,
        excerpt: a.excerpt ?? "",
        href: a.link,
        badge: a.badge?.trim() || "Реклама",
        image: imageForAd(a),
        endsAt: a.ends_at,
      }));
    const postCards: Card[] = topPosts.map((p, i) => ({
      key: `post-${p.slug}`,
      title: p.title,
      excerpt: p.summary,
      href: `/blog/${p.slug}`,
      badge: p.category,
      image: p.image,
      meta: i === 0 ? "Най-четено" : "Популярно",
    }));
    return [...adCards, ...postCards];
  }, [ads, topPosts, now]);

  if (cards.length === 0) return null;
  const current = cards[Math.min(active, cards.length - 1)];
  const isExternal = /^https?:\/\//i.test(current.href);

  return (
    <section aria-labelledby="ad-spotlight-heading" className="container py-8 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <span className="inline-flex min-h-7 items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 text-xs font-semibold uppercase tracking-widest text-gold">
              <Megaphone className="h-3.5 w-3.5" />
              Реклама
            </span>
            <h2 id="ad-spotlight-heading" className="mt-2 font-serif text-xl font-bold sm:text-2xl">
              Подбрано за Вас
            </h2>
          </div>
          <p className="hidden text-sm text-muted-foreground sm:block">
            {active + 1} / {cards.length}
          </p>
        </div>

        <div className="group relative isolate min-h-[360px] overflow-hidden rounded-2xl border border-gold/30 bg-card shadow-xl sm:min-h-[420px]">
          {current.image ? (
            <img
              key={current.image}
              src={current.image}
              alt=""
              loading="lazy"
              decoding="async"
              width={1200}
              height={630}
              className="absolute inset-0 h-full w-full animate-in fade-in duration-500 object-cover transition-transform motion-safe:group-hover:scale-[1.025] motion-reduce:transition-none"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <BookOpen className="h-12 w-12 text-muted-foreground" />
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/10 sm:bg-gradient-to-r sm:from-background sm:via-background/80 sm:to-transparent" />
          <div className="absolute inset-x-0 top-0 h-1 bg-gold" />

          <div key={current.key} className="relative flex min-h-[360px] animate-in fade-in slide-in-from-bottom-2 flex-col justify-end p-5 duration-500 sm:min-h-[420px] sm:max-w-[64%] sm:justify-center sm:p-10 lg:p-12">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-widest">
              <span className="rounded-full bg-gold px-3 py-1.5 text-primary-foreground">{current.badge}</span>
              {current.meta && <span className="text-muted-foreground">{current.meta}</span>}
            </div>

            <h3 className="mt-4 max-w-2xl text-balance font-serif text-2xl font-bold leading-tight sm:text-4xl">
              {current.title}
            </h3>

            {current.endsAt && remainingLabel(current.endsAt, now) && (
              <p className="mt-3 text-sm font-medium text-muted-foreground" aria-live="off">
                {remainingLabel(current.endsAt, now)}
              </p>
            )}

            <div className="mt-6">
              <Button asChild size="lg" className="min-h-[48px] gap-2 bg-gold text-primary-foreground shadow-lg transition-transform motion-safe:hover:-translate-y-0.5">
                {isExternal ? (
                  <a href={current.href} target="_blank" rel="noopener noreferrer nofollow sponsored">
                    Отворете <ArrowRight className="h-4 w-4" />
                  </a>
                ) : (
                  <Link to={current.href}>
                    Прочетете <ArrowRight className="h-4 w-4" />
                  </Link>
                )}
              </Button>
            </div>
          </div>
        </div>

        {cards.length > 1 && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2" role="tablist" aria-label="Избрани публикации">
            {cards.map((card, index) => (
              <Button
                key={card.key}
                type="button"
                role="tab"
                aria-selected={index === active}
                variant="outline"
                onClick={() => setActive(index)}
                className={`h-auto min-h-[52px] justify-start overflow-hidden px-3 py-2 text-left transition-all ${
                  index === active
                    ? "border-gold bg-gold/10 shadow-sm"
                    : "border-border/60 text-muted-foreground hover:border-gold/50 hover:text-foreground"
                }`}
              >
                {card.image && (
                  <img src={card.image} alt="" loading="lazy" className="h-9 w-12 shrink-0 rounded object-cover" />
                )}
                <span className="min-w-0 truncate">{card.title}</span>
              </Button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default AdSpotlight;
