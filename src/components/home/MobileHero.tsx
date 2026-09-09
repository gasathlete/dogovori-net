/**
 * Мобилното hero: едно голямо обещание, една честна ценова котва и едно
 * доминиращо действие. Акцентът е code-native (тънка сканираща линия) —
 * без видео, изображение или безкрайна анимация.
 */
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { prefetchHandlers } from "@/lib/routePrefetch";
import { ArrowRight, ShieldCheck } from "@/icons";
import { trackFunnelEvent, markFunnelStep } from "@/lib/funnel";
import { lowestOneTimePriceLabel } from "@/lib/products";

export function MobileHero() {
  useEffect(() => {
    markFunnelStep(1);
  }, []);

  return (
    <section
      data-testid="mobile-hero"
      className="relative overflow-hidden border-b border-border/40"
    >
      {/* Дискретен цифров акцент: една сканираща линия, спира при reduced motion */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/70 to-transparent motion-safe:animate-scan-line"
      />
      <div className="container py-9">
        <h1
          data-testid="mobile-hero-title"
          className="font-serif text-[32px] font-bold leading-[1.08] tracking-tight text-balance"
        >
          Вашият договор.
          <br />
          Проверен. Поправен.{" "}
          <span className="text-gold">Готов.</span>
        </h1>

        <p
          data-testid="mobile-hero-price-cue"
          className="mt-4 inline-flex items-baseline gap-2 rounded-lg border border-gold/25 bg-gold/[0.07] px-3 py-1.5"
        >
          <span className="font-serif text-[22px] font-bold tabular-nums text-gold">
            от {lowestOneTimePriceLabel()}
          </span>
          <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            еднократно
          </span>
        </p>

        <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
          Качвате договор или изготвяте нов и получавате ясен резултат на един екран.
        </p>

        <Link
          to="/produkti"
          {...prefetchHandlers("/produkti")}
          onClick={() =>
            trackFunnelEvent("home_primary_cta_clicked", {
              destination: "/produkti",
              variant: "mobile",
            })
          }
          className="btn-gold btn-press mt-6 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-xl text-[17px] font-bold tracking-tight transition-transform duration-200"
        >
          Изберете резултат
          <ArrowRight className="h-[18px] w-[18px]" />
        </Link>

        <div className="mt-3 flex items-center justify-between gap-3">
          <Link
            to="/build"
            {...prefetchHandlers("/build")}
            className="inline-flex min-h-[44px] items-center text-[13px] font-semibold text-muted-foreground underline-offset-4 transition-colors duration-200 hover:text-foreground hover:underline"
          >
            Изготви нов договор
          </Link>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            GDPR
          </span>
        </div>
      </div>
    </section>
  );
}
