import { useEffect, useRef, useState } from "react";
import videoAsset from "@/assets/hero-bg-video.mp4.asset.json";
import posterUrl from "@/assets/hero-bg-poster.jpg";

/**
 * Full-bleed video background for the Hero section.
 *
 * - Autoplay + muted + loop + playsInline (mobile Safari friendly).
 * - Respects `prefers-reduced-motion` → renders poster image only.
 * - Pauses when off-screen to save CPU/battery.
 * - Layered overlays keep foreground text readable.
 */
export function HeroVideoBackdrop() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || reducedMotion) return;
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
  }, [reducedMotion]);

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {reducedMotion ? (
        <img
          src={posterUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          width={1920}
          height={1080}
          decoding="async"
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
  );
}
