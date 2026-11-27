import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowRight } from "@/icons";
import { useAudience } from "@/hooks/useAudience";
import { AudienceToggle } from "@/components/funnel/AudienceToggle";

export function CTABand() {
  const { copy } = useAudience();
  return (
    <section id="cta-band" className="container py-12 sm:py-16 md:py-20">
      <div
        className="gold-sweep-bg relative overflow-hidden rounded-2xl border border-gold/30 bg-card px-6 py-12 text-center text-foreground sm:px-10 sm:py-14 md:px-16 md:py-16"
        style={{
          boxShadow: "var(--shadow-elegant), var(--shadow-inset-line)",
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{ background: "var(--gradient-radial)" }}
        />
        <div className="absolute inset-x-0 top-0 hairline-x" />
        <div className="absolute inset-x-0 bottom-0 hairline-x opacity-60" />

        <span className="pointer-events-none absolute left-4 top-4 h-3 w-3 border-l border-t border-gold/50" />
        <span className="pointer-events-none absolute right-4 top-4 h-3 w-3 border-r border-t border-gold/50" />
        <span className="pointer-events-none absolute left-4 bottom-4 h-3 w-3 border-l border-b border-gold/50" />
        <span className="pointer-events-none absolute right-4 bottom-4 h-3 w-3 border-r border-b border-gold/50" />


        <div className="relative z-10">
          <div className="eyebrow mb-3 justify-center">Готови?</div>
          <h2 className="mx-auto max-w-2xl font-serif text-3xl font-bold leading-tight text-balance sm:text-4xl md:text-5xl">
            {copy.ctaHeadline}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {copy.ctaExample}
          </p>
          <p className="mx-auto mt-2 max-w-xl text-[12px] text-muted-foreground">
            {"\n"}
          </p>
          <div className="mt-5 flex justify-center">
            <AudienceToggle size="sm" />
          </div>
          <div className="mt-8 flex justify-center">
            <Link to="/catalog" className="btn-gold btn-press inline-flex min-h-11 items-center gap-2 px-6 py-3">
              <ArrowRight className="h-4 w-4" /> Намерете документ
            </Link>
          </div>
          <p className="mt-5 text-xs text-muted-foreground">Разглеждането е достъпно. Новото генериране и покупките са в подготовка.</p>
        </div>
      </div>
    </section>
  );
}
