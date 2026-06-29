/**
 * StickyScrollCta — appears after the user has scrolled past ~50% of the
 * landing page. Single primary CTA driven by `useFunnelCta(2)` (Educate
 * step). Dismissable per session.
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { X, ArrowRight } from "lucide-react";
import { useFunnelCta } from "@/hooks/useFunnelCta";
import { trackFunnelEvent } from "@/lib/funnel";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "funnel_sticky_dismissed_v1";

export function StickyScrollCta() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const cta = useFunnelCta(2);
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(DISMISS_KEY) === "1") {
      setDismissed(true);
      return;
    }
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const h = document.documentElement;
        const scrolled =
          (h.scrollTop + window.innerHeight) / Math.max(h.scrollHeight, 1);
        setVisible(scrolled > 0.5);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Only show on the landing page
  if (location.pathname !== "/" || dismissed) return null;

  return (
    <div
      aria-hidden={!visible}
      className={cn(
        "fixed inset-x-2 z-40 mx-auto max-w-md transition-all duration-300",
        "bottom-[calc(env(safe-area-inset-bottom,0)+72px)] md:bottom-4",
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-6 opacity-0",
      )}
    >
      <div className="flex items-center gap-2 rounded-full border border-gold/30 bg-background/90 px-3 py-2 shadow-xl backdrop-blur-xl">
        <Link
          to={cta.href}
          onClick={() =>
            trackFunnelEvent("sticky_cta_click", { step: 2, href: cta.href })
          }
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-gold px-4 py-2 text-[13px] font-semibold text-navy hover:bg-gold/90 transition-colors"
        >
          {cta.label}
          <ArrowRight className="h-4 w-4" />
        </Link>
        <button
          type="button"
          aria-label="Скрий"
          onClick={() => {
            sessionStorage.setItem(DISMISS_KEY, "1");
            setDismissed(true);
            trackFunnelEvent("sticky_cta_dismiss", { step: 2 });
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
