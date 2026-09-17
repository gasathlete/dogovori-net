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
      meta: i === 0 ? "Най-четена статия" : "Втора най-четена статия",
    }));
    return [...adCards, ...postCards];
  }, [ads, topPosts, now]);

  if (cards.length === 0) return null;
  const current = cards[Math.min(active, cards.length - 1)];
  const isExternal = /^https?:\/\//i.test(current.href);

  return (
    <section aria-labelledby="ad-spotlight-heading" className="container py-10 sm:py-12">
      <div className="mx-auto max-w-5xl rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur-sm sm:p-7">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-gold/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-gold">
              <Megaphone className="h-3 w-3" />
              Реклама
            </span>
            <h2 id="ad-spotlight-heading" className="mt-3 font-serif text-xl font-bold sm:text-2xl">
              Подбрано за Вас
            </h2>
          </div>

          {cards.length > 1 && (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Избрани публикации">
              {cards.map((c, i) => (
                <button
                  key={c.key}
                  type="button"
                  role="tab"
                  aria-selected={i === active}
                  onClick={() => setActive(i)}
                  className={`min-h-[44px] rounded-full border px-4 text-sm transition-colors ${
                    i === active
                      ? "border-gold/60 bg-gold/10 text-foreground"
                      : "border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {c.badge}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(220px,36%)] sm:items-center">
          {current.image ? (
            <img
              src={current.image}
              alt=""
              loading="lazy"
              decoding="async"
              width={440}
              height={280}
              className="aspect-[11/7] w-full rounded-xl object-cover shadow-sm sm:order-2"
            />
          ) : (
            <div className="flex aspect-[11/7] w-full items-center justify-center rounded-xl border border-border/60 bg-muted/30 sm:order-2">
              <BookOpen className="h-8 w-8 text-muted-foreground" />
            </div>
          )}

          <div className="sm:order-1">
            {current.meta && (
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {current.meta}
              </p>
            )}
            <h3 className="text-lg font-semibold leading-snug text-balance sm:text-xl">{current.title}</h3>
            {current.excerpt && (
              <p className="mt-2 text-base leading-relaxed text-muted-foreground">{current.excerpt}</p>
            )}
            {current.endsAt && remainingLabel(current.endsAt, now) && (
              <p className="mt-3 text-sm text-muted-foreground" aria-live="off">
                {remainingLabel(current.endsAt, now)}
              </p>
            )}
            <div className="mt-4">
              {isExternal ? (
                <a
                  href={current.href}
                  target="_blank"
                  rel="noopener noreferrer nofollow sponsored"
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gold/50 px-4 text-base font-medium text-foreground transition-colors hover:bg-gold/10"
                >
                  Отворете <ArrowRight className="h-4 w-4" />
                </a>
              ) : (
                <Link
                  to={current.href}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-gold/50 px-4 text-base font-medium text-foreground transition-colors hover:bg-gold/10"
                >
                  Прочетете <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

export default AdSpotlight;
