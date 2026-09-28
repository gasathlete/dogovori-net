import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "@/icons";
import videoAsset from "@/assets/hero-bg-video.mp4.asset.json";

/**
 * Full-bleed video background for the Hero section.
 *
 * - Poster is the LCP image: static files in /public/hero, preloaded from
 *   index.html with the same srcset, so it is discovered before JS runs.
 * - No video on phones / coarse pointers, save-data, slow networks or
 *   reduced motion — poster only.
 * - Video mounts after load + idle; it pauses while off-screen or while the
 *   tab is hidden, and the user can pause it with a 44px control.
 */
export const HERO_POSTER_SRC = "/hero/hero-poster-1280.webp";
export const HERO_POSTER_SRCSET = "/hero/hero-poster-960.webp 960w, /hero/hero-poster-1280.webp 1280w";

export function HeroVideoBackdrop() {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  videoRef.current = video;
  const [reducedMotion, setReducedMotion] = useState(false);
  const [paused, setPaused] = useState(false);
  const [videoAllowed, setVideoAllowed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    const capable =
      window.matchMedia("(min-width: 768px) and (pointer: fine)").matches &&
      !conn?.saveData &&
      !/(^|-)(2g|slow-2g|3g)$/.test(String(conn?.effectiveType ?? ""));
    if (!capable) return;
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (h: number) => void;
    };
    let idleHandle: number | undefined;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      if (w.requestIdleCallback) idleHandle = w.requestIdleCallback(() => setVideoAllowed(true), { timeout: 3000 });
      else timeoutHandle = setTimeout(() => setVideoAllowed(true), 1200);
    };
    if (document.readyState === "complete") arm();
    else window.addEventListener("load", arm, { once: true });
    return () => {
      window.removeEventListener("load", arm);
      if (idleHandle !== undefined) w.cancelIdleCallback?.(idleHandle);
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    };
  }, []);

  // Depends on the actual <video> node (callback ref), so the observer attaches
  // once the video mounts after idle — not only on the first render.
  useEffect(() => {
    if (!video || reducedMotion || paused) return;
    let onScreen = true;
    const sync = () => {
      if (onScreen && document.visibilityState === "visible") video.play().catch(() => void 0);
      else video.pause();
    };
    const observer = typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync(); }, { threshold: 0.05 });
    observer?.observe(video);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", sync);
      video.pause();
    };
  }, [video, reducedMotion, paused]);

  const showPoster = reducedMotion || paused || !videoAllowed;

  const toggle = () => {
    setPaused((prev) => {
      const next = !prev;
      if (next) videoRef.current?.pause();
      return next;
    });
  };

  return (
    <>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {showPoster ? (
          <img
            src={HERO_POSTER_SRC}
            srcSet={HERO_POSTER_SRCSET}
            sizes="100vw"
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            width={1280}
            height={720}
            decoding="async"
            loading="eager"
            {...({ fetchpriority: "high" } as Record<string, string>)}
          />
        ) : (
          <video
            ref={setVideo}
            className="absolute inset-0 h-full w-full object-cover"
            src={videoAsset.url}
            poster={HERO_POSTER_SRC}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            data-testid="hero-video"
          />
        )}

        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/55 to-background" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--gold)/0.10),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,hsl(var(--background)/0.25)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-background" />
      </div>

      {!reducedMotion && videoAllowed && (
        <button
          type="button"
          onClick={toggle}
          aria-label={paused ? "Пусни фоновото видео" : "Спри фоновото видео"}
          aria-pressed={paused}
          className="absolute bottom-4 right-4 z-20 inline-flex size-11 items-center justify-center rounded-full border border-gold/40 bg-background/70 text-gold backdrop-blur-sm transition-colors hover:bg-background/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
        </button>
      )}
    </>
  );
}
