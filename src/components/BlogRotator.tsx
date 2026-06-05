import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BookOpen } from "lucide-react";
import { ALL_POSTS } from "@/lib/blog";

const ROTATE_MS = 10_000;

export function BlogRotator() {
  const posts = useMemo(() => ALL_POSTS.slice(0, 6), []);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [dragDx, setDragDx] = useState(0);
  const timerRef = useRef<number | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const swipedRef = useRef(false);

  useEffect(() => {
    if (paused || posts.length <= 1) return;
    timerRef.current = window.setTimeout(() => {
      setIdx((i) => (i + 1) % posts.length);
    }, ROTATE_MS);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [idx, paused, posts.length]);

  if (posts.length === 0) return null;

  const goTo = (i: number) => {
    const n = posts.length;
    setIdx(((i % n) + n) % n);
  };
  const next = () => goTo(idx + 1);
  const prev = () => goTo(idx - 1);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    swipedRef.current = false;
    setPaused(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
      // Horizontal intent — prevent vertical scroll hijack and follow finger.
      e.preventDefault();
      setDragDx(Math.max(-180, Math.min(180, dx)));
    }
  };
  const onTouchEnd = () => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const dx = dragDx;
    setDragDx(0);
    setPaused(false);
    if (!start) return;
    const SWIPE_PX = 50;
    if (Math.abs(dx) > SWIPE_PX) {
      swipedRef.current = true;
      if (dx < 0) next();
      else prev();
    }
  };

  return (
    <div
      className="anim-rise group relative mt-12 select-none overflow-hidden rounded-xl border border-hairline bg-card/90 text-left shadow-elegant sm:mt-14 md:mt-16"
      style={{ animationDelay: "400ms", touchAction: "pan-y" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {/* Swallow click that follows a swipe so we don't navigate to the article. */}
      <div
        onClickCapture={(e) => {
          if (swipedRef.current) {
            e.preventDefault();
            e.stopPropagation();
            swipedRef.current = false;
          }
        }}
        style={{
          transform: dragDx ? `translate3d(${dragDx}px,0,0)` : undefined,
          transition: dragDx ? "none" : "transform 280ms ease-out",
        }}
      >

      {/* Corner ornaments */}
      <span className="pointer-events-none absolute left-2 top-2 h-3 w-3 border-l border-t border-gold/40" />
      <span className="pointer-events-none absolute right-2 top-2 h-3 w-3 border-r border-t border-gold/40" />
      <span className="pointer-events-none absolute bottom-2 left-2 h-3 w-3 border-b border-l border-gold/40" />
      <span className="pointer-events-none absolute bottom-2 right-2 h-3 w-3 border-b border-r border-gold/40" />

      {/* Header strip */}
      <div className="flex items-center justify-between border-b border-hairline px-5 py-3 sm:px-6">
        <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-gold">
          <BookOpen className="h-3.5 w-3.5" strokeWidth={1.6} />
          От блога
        </div>
        <a
          href="/blog"
          className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground transition-colors hover:text-gold"
        >
          Всички статии <ArrowRight className="h-3 w-3" />
        </a>
      </div>

      {/* Slides */}
      <div className="relative">
        {posts.map((p, i) => {
          const isActive = i === idx;
          return (
            <a
              key={p.slug}
              href={`/blog/${p.slug}`}
              aria-hidden={!isActive}
              tabIndex={isActive ? 0 : -1}
              className={`block transition-opacity duration-700 ease-out ${
                isActive
                  ? "relative opacity-100"
                  : "pointer-events-none absolute inset-0 opacity-0"
              }`}
            >
              <div className="grid grid-cols-1 gap-0 sm:grid-cols-[140px_1fr] md:grid-cols-[180px_1fr]">
                {/* Image */}
                <div className="relative aspect-[16/10] overflow-hidden bg-navy-light/40 sm:aspect-auto sm:h-full">
                  <img
                    src={p.image}
                    alt={p.title}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover opacity-90 transition-transform duration-[1200ms] ease-out group-hover:scale-105"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-card/60 via-transparent to-transparent sm:bg-gradient-to-r sm:from-transparent sm:to-card/80" />
                </div>

                {/* Text */}
                <div className="flex flex-col justify-between p-5 sm:p-6">
                  <div>
                    <div className="mb-2 inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.22em] text-gold/90">
                      <span className="h-1 w-1 rounded-full bg-gold" />
                      {p.category}
                    </div>
                    <h3 className="font-serif text-lg font-bold leading-snug text-foreground sm:text-xl md:text-[22px] md:leading-tight">
                      {p.title}
                    </h3>
                    <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground sm:text-sm sm:leading-relaxed">
                      {p.summary}
                    </p>
                  </div>
                  <div className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold transition-colors group-hover:text-gold-light">
                    Прочети статията <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              </div>
            </a>
          );
        })}
      </div>

      {/* Footer: dots + progress */}
      <div className="flex items-center justify-between gap-3 border-t border-hairline px-5 py-3 sm:px-6">
        <div className="flex items-center gap-1.5">
          {posts.map((p, i) => (
            <button
              key={p.slug}
              type="button"
              aria-label={`Покажи статия ${i + 1} от ${posts.length}`}
              onClick={() => setIdx(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === idx ? "w-6 bg-gold" : "w-1.5 bg-gold/30 hover:bg-gold/60"
              }`}
            />
          ))}
        </div>
        <div className="relative h-px flex-1 overflow-hidden bg-hairline">
          <div
            key={`${idx}-${paused ? "p" : "r"}`}
            className="absolute inset-y-0 left-0 bg-gold/70"
            style={{
              width: "100%",
              animation: paused ? "none" : `blog-rotator-progress ${ROTATE_MS}ms linear forwards`,
            }}
          />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {String(idx + 1).padStart(2, "0")} / {String(posts.length).padStart(2, "0")}
        </span>
      </div>

      <style>{`
        @keyframes blog-rotator-progress {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
