import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { storageThumb } from "@/lib/imageThumb";

export type PartnerLogo = { id: string; name: string; logo_url: string; website_url?: string | null };

export function partnerVisibleSlots(width: number): number {
  return width >= 900 ? 6 : width >= 600 ? 4 : width >= 340 ? 3 : 2;
}

const GAP = 12;
const DURATION = 900;
const DWELL = 3500;

/**
 * Stable track: [tail clones][originals][head clones] rendered once with stable keys.
 * Only `pos` changes; at the boundary the track is silently normalized (transition off,
 * same visual frame) so last→first is seamless and no image is remounted.
 */
export function PartnerCarousel({ partners }: { partners: PartnerLogo[] }) {
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLUListElement>(null);
  const moving = useRef(false);
  const [width, setWidth] = useState(0);
  const [pos, setPos] = useState(0);
  const [animate, setAnimate] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [onscreen, setOnscreen] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const touchStart = useRef<number | null>(null);
  const n = partners.length;
  const slots = partnerVisibleSlots(width);
  const rotates = n > slots;
  const visible = Math.min(slots, n);
  const tileWidth = Math.max(0, (width - (slots - 1) * GAP) / slots);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const resize = new ResizeObserver(([entry]) => { if (entry) setWidth(entry.contentRect.width); });
    const intersection = new IntersectionObserver(([entry]) => setOnscreen(Boolean(entry?.isIntersecting)));
    resize.observe(element);
    intersection.observe(element);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const preference = () => setReduced(media.matches);
    const visibility = () => setHidden(document.hidden);
    media.addEventListener("change", preference);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      resize.disconnect(); intersection.disconnect();
      media.removeEventListener("change", preference);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [n]);

  useEffect(() => { setPos(0); setAnimate(false); moving.current = false; }, [slots, n]);

  function normalize() {
    moving.current = false;
    setPos(current => {
      if (current >= 0 && current < n) return current;
      setAnimate(false);
      return ((current % n) + n) % n;
    });
  }

  function advance(direction: number) {
    if (!rotates || moving.current) return;
    if (reduced) { setAnimate(false); setPos(current => ((current + direction) % n + n) % n); return; }
    moving.current = true;
    setAnimate(true);
    setPos(current => current + direction);
  }

  useEffect(() => {
    if (!rotates || !onscreen || hidden || hovered || focused || paused || reduced) return;
    const timer = window.setInterval(() => advance(1), DWELL);
    return () => window.clearInterval(timer);
  }, [rotates, onscreen, hidden, hovered, focused, paused, reduced, n]);

  // Fallback if transitionend is lost (tab switch, interrupted motion).
  useEffect(() => {
    if (!moving.current) return;
    const timer = window.setTimeout(normalize, DURATION + 120);
    return () => window.clearTimeout(timer);
  }, [pos]);

  if (!n) return null;
  const slides = rotates
    ? [
        ...partners.slice(-visible).map((p, i) => ({ p, clone: true, key: `t${i}` })),
        ...partners.map(p => ({ p, clone: false, key: p.id })),
        ...partners.slice(0, visible).map((p, i) => ({ p, clone: true, key: `h${i}` })),
      ]
    : partners.map(p => ({ p, clone: false, key: p.id }));
  const offset = rotates ? (visible + pos) * (tileWidth + GAP) : 0;
  const current = ((pos % n) + n) % n;

  return (
    <div className="mt-6 min-w-0" role="region" aria-roledescription="карусел" aria-label="Регистрирани фирми"
      onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={event => { if ((event.target as HTMLElement).matches?.(":focus-visible")) setFocused(true); }}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
      <div ref={viewport} className="overflow-hidden py-1" style={{ touchAction: "pan-y" }}
        onTouchStart={event => { touchStart.current = event.touches[0]?.clientX ?? null; }}
        onTouchEnd={event => {
          const end = event.changedTouches[0]?.clientX;
          if (touchStart.current !== null && end !== undefined && Math.abs(end - touchStart.current) > 40) advance(end < touchStart.current ? 1 : -1);
          touchStart.current = null;
        }}>
        <ul ref={track} className="flex gap-3" data-partner-track=""
          onTransitionEnd={event => { if (event.target === event.currentTarget) normalize(); }}
          style={{ transform: `translate3d(-${offset}px,0,0)`, willChange: rotates ? "transform" : undefined,
            transition: animate && !reduced ? `transform ${DURATION}ms cubic-bezier(0.45, 0, 0.25, 1)` : "none" }}>
          {slides.map(({ p, clone, key }, position) => {
            const originalIndex = position - (rotates ? visible : 0);
            const inView = !rotates || (originalIndex >= current && originalIndex < current + visible);
            const hide = clone || !inView;
            const img = <img src={storageThumb(p.logo_url, 240, 216, { fit: "contain", quality: 62 })} alt={clone ? "" : p.name}
              loading="eager" decoding="async" draggable={false} width={120} height={108} className="h-full w-full object-contain p-3" />;
            return <li key={key} aria-hidden={hide ? true : undefined}
              className="h-24 shrink-0 rounded-sm border border-border bg-card sm:h-28" style={{ width: tileWidth }}>
              {p.website_url ? <a href={p.website_url} target="_blank" rel="noopener noreferrer nofollow" title={p.name}
                tabIndex={hide ? -1 : 0} className="block h-full rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">{img}</a>
                : <span title={p.name} className="block h-full">{img}</span>}
            </li>;
          })}
        </ul>
      </div>
      {rotates && <div className="mt-2 flex items-center justify-end gap-1">
        <span className="mr-2 min-w-[3.5rem] text-right text-sm tabular-nums text-muted-foreground" aria-live="off" data-partner-position="">
          {current + 1} / {n}
        </span>
        <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Предишно лого" title="Предишно лого" onClick={() => advance(-1)}><ChevronLeft /></Button>
        {!reduced && <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={paused ? "Продължи въртенето" : "Спри въртенето"} title={paused ? "Продължи въртенето" : "Спри въртенето"} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? <Play /> : <Pause />}</Button>}
        <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Следващо лого" title="Следващо лого" onClick={() => advance(1)}><ChevronRight /></Button>
      </div>}
    </div>
  );
}
