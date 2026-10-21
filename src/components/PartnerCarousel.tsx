import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { storageThumb } from "@/lib/imageThumb";

export type PartnerLogo = { id: string; name: string; logo_url: string; website_url?: string | null };

export function partnerVisibleSlots(width: number): number {
  return width >= 900 ? 6 : width >= 600 ? 4 : width >= 340 ? 3 : 2;
}

export function PartnerCarousel({ partners }: { partners: PartnerLogo[] }) {
  const viewport = useRef<HTMLDivElement>(null);
  const moving = useRef(false);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [start, setStart] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [onscreen, setOnscreen] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const touchStart = useRef<number | null>(null);
  const slots = partnerVisibleSlots(width);
  const rotates = partners.length > slots;
  const visible = Math.min(slots, partners.length);
  const tileWidth = Math.max(0, (width - (slots - 1) * 12) / slots);

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
  }, [partners.length]);

  useEffect(() => { setStart(0); setIndex(0); setAnimate(false); moving.current = false; }, [slots, partners.length]);

  function advance(direction: number) {
    if (!rotates || moving.current) return;
    setAnimate(!reduced);
    moving.current = !reduced;
    if (reduced) setStart(current => (current + direction + partners.length) % partners.length);
    else setIndex(direction);
  }

  useEffect(() => {
    if (!rotates || !onscreen || hidden || hovered || focused || paused || reduced) return;
    const timer = window.setInterval(() => advance(1), 3500);
    return () => window.clearInterval(timer);
  }, [rotates, onscreen, hidden, hovered, focused, paused, reduced, partners.length]);

  // Transition-end is authoritative; timeout also releases the lock if motion is interrupted.
  function finish() {
    moving.current = false;
    if (index !== 0) {
      setAnimate(false);
      setStart(current => (current + index + partners.length) % partners.length);
      setIndex(0);
    }
  }
  useEffect(() => {
    if (!moving.current) return;
    const timer = window.setTimeout(finish, 720);
    return () => window.clearTimeout(timer);
  }, [index, partners.length]);

  if (!partners.length) return null;
  // Rebase the ordered originals after each move: visible settled links are never clones.
  const ordered = [...partners.slice(start), ...partners.slice(0, start)];
  const slides = rotates
    ? [...ordered.slice(-visible).map(p => ({ p, clone: true })), ...ordered.map(p => ({ p, clone: false })), ...ordered.slice(0, visible).map(p => ({ p, clone: true }))]
    : partners.map(p => ({ p, clone: false }));
  const offset = rotates ? (visible + index) * (tileWidth + 12) : 0;

  return (
    <div className="mt-6 min-w-0" role="region" aria-label="Регистрирани фирми"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
      <div ref={viewport} className="overflow-hidden py-1" style={{ touchAction: "pan-y" }}
        onTouchStart={event => { touchStart.current = event.touches[0]?.clientX ?? null; }}
        onTouchEnd={event => {
          const end = event.changedTouches[0]?.clientX;
          if (touchStart.current !== null && end !== undefined && Math.abs(end - touchStart.current) > 40) advance(end < touchStart.current ? 1 : -1);
          touchStart.current = null;
        }}>
        <ul className="flex gap-3" data-partner-track="" onTransitionEnd={finish}
          style={{ transform: `translateX(-${offset}px)`, transition: animate && !reduced ? "transform 650ms cubic-bezier(0.22, 0.61, 0.36, 1)" : "none" }}>
          {slides.map(({ p, clone }, position) => {
            const originalIndex = position - (rotates ? visible : 0);
            const inView = !rotates || (originalIndex >= 0 && originalIndex < visible);
            const img = <img src={storageThumb(p.logo_url, 240, 216, { fit: "contain", quality: 62 })} alt={clone ? "" : p.name}
              loading="lazy" decoding="async" width={120} height={108} className="h-full w-full object-contain p-3" />;
            return <li key={`${p.id}-${position}`} aria-hidden={clone || !inView ? true : undefined}
              className="h-24 shrink-0 rounded-sm border border-border bg-card sm:h-28" style={{ width: tileWidth }}>
              {p.website_url ? <a href={p.website_url} target="_blank" rel="noopener noreferrer nofollow" title={p.name}
                tabIndex={clone || !inView ? -1 : 0} className="block h-full rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">{img}</a>
                : <span title={p.name} className="block h-full">{img}</span>}
            </li>;
          })}
        </ul>
      </div>
      {rotates && <div className="mt-2 flex justify-end gap-1">
        <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Предишно лого" title="Предишно лого" onClick={() => advance(-1)}><ChevronLeft /></Button>
        {!reduced && <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={paused ? "Продължи въртенето" : "Спри въртенето"} title={paused ? "Продължи въртенето" : "Спри въртенето"} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? <Play /> : <Pause />}</Button>}
        <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Следващо лого" title="Следващо лого" onClick={() => advance(1)}><ChevronRight /></Button>
      </div>}
    </div>
  );
}