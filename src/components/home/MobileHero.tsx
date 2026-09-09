/**
 * Мобилното хero: едно обещание, най-много два поддържащи реда, едно основно
 * действие. Без видео, без превключватели, без промоционален шум.
 */
import { Link } from "react-router-dom";
import { prefetchHandlers } from "@/lib/routePrefetch";
import { ArrowRight, ShieldCheck } from "@/icons";
import { trackFunnelEvent, markFunnelStep } from "@/lib/funnel";
import { useEffect } from "react";

export function MobileHero() {
  useEffect(() => {
    markFunnelStep(1);
  }, []);

  return (
    <section className="relative overflow-hidden border-b border-border/40">
      <div className="container py-8">
        <h1 className="font-serif text-[26px] font-bold leading-[1.15] text-balance">
          Договорите ви —{" "}
          <em className="not-italic italic text-gold">проверени, поправени, готови</em>
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
          Качвате договор или изготвяте нов и получавате ясен резултат на един екран.
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          Плащате веднъж за избрания резултат — без абонамент.
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
          className="btn-gold btn-press mt-5 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl text-[16px] font-bold"
        >
          Разгледайте продуктите
          <ArrowRight className="h-4 w-4" />
        </Link>

        <div className="mt-3 flex items-center justify-between gap-3">
          <Link
            to="/build"
            {...prefetchHandlers("/build")}
            className="min-h-[44px] inline-flex items-center text-[13px] font-semibold text-muted-foreground transition-colors hover:text-gold"
          >
            Изготви документ
          </Link>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            GDPR
          </span>
        </div>
      </div>
    </section>
  );
}
