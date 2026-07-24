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

      {/* Darken for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-b from-navy/75 via-navy/55 to-navy/85" />
      {/* Subtle radial vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,hsl(var(--navy)/0.4)_100%)]" />
    </div>
  );
}
