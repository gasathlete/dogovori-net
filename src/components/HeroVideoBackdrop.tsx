import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import videoAsset from "@/assets/hero-bg-video.mp4.asset.json";
import posterUrl from "@/assets/hero-bg-poster.jpg";

/**
 * Full-bleed video background for the Hero section.
 *
 * - Autoplay + muted + loop + playsInline (mobile Safari friendly).
 * - Respects `prefers-reduced-motion` → renders poster image only.
 * - Pauses when off-screen to save CPU/battery.
 * - User can toggle playback via a small control in the bottom-right;
 *   when paused, only the poster image is visible.
 * - Layered overlays keep foreground text readable.
 */
export function HeroVideoBackdrop() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [paused, setPaused] = useState(false);
  /**
   * Видео се допуска само на по-широки екрани и при връзка без data-saver.
   * На телефон постерът е достатъчен — спестява трафик, декодиране и батерия
   * точно докато се мери LCP/INP.
   */
  const [videoAllowed, setVideoAllowed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const conn = (navigator as any).connection;
    const cheapData = !!conn?.saveData || /(^|-)2g$/.test(String(conn?.effectiveType ?? ""));
    const wide = window.matchMedia("(min-width: 768px)");
    const evaluate = () => setVideoAllowed(wide.matches && !cheapData);
    evaluate();
    wide.addEventListener?.("change", evaluate);
    return () => wide.removeEventListener?.("change", evaluate);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || reducedMotion || paused) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          video.play().catch(() => void 0);
        } else {
          video.pause();
        }
      },
      { threshold: 0.05 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [reducedMotion, paused]);

  const showPoster = reducedMotion || paused || !videoAllowed;


  const toggle = () => {
    const video = videoRef.current;
    setPaused((prev) => {
      const next = !prev;
      if (video) {
        if (next) video.pause();
        else video.play().catch(() => void 0);
      }
      return next;
    });
  };

  return (
    <>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {showPoster ? (
          <img
            src={posterUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            width={1920}
            height={1080}
            decoding="async"
            loading="eager"
            {...({ fetchpriority: "high" } as any)}

          />
        ) : (
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            src={videoAsset.url}
            poster={posterUrl}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
        )}

        {/* Main veil — tuned to the page background so the video melts into the next section */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/55 to-background" />
        {/* Warm gold highlight tying the video to the site's accent palette */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--gold)/0.10),transparent_55%)]" />
        {/* Soft vignette — lighter than before so the composition still feels airy */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,hsl(var(--background)/0.25)_100%)]" />
        {/* Bottom fade — bridges the hero into the following section without a hard edge */}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-background" />
      </div>

      {!reducedMotion && videoAllowed && (
        <button
          type="button"
          onClick={toggle}
          aria-label={paused ? "Пусни фоновото видео" : "Спри фоновото видео"}
          aria-pressed={paused}
          className="absolute bottom-4 right-4 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/60 text-foreground/80 backdrop-blur-md transition hover:bg-background/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {paused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
        </button>
      )}
    </>
  );
}
