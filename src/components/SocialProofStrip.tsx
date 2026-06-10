import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Partner = { id: string; name: string; logo_url: string; website_url?: string | null };

export function SocialProofStrip() {
  const [partners, setPartners] = useState<Partner[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("partners")
        .select("id,name,logo_url,website_url")
        .eq("status", "approved")
        .order("display_order", { ascending: false })
        .limit(24);
      if (!cancelled) setPartners((data as Partner[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Duplicate the list so the marquee loops seamlessly.
  const loop = partners.length > 0 ? [...partners, ...partners] : [];

  return (
    <section
      id="partners"
      aria-label="Партньори"
      className="border-y border-border/40 bg-card/20"
    >
      <div className="container py-8 sm:py-10">
        <p className="mb-6 text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          БЪЛГАРСКА ПЛАТФОРМА, ИЗПОЛЗВАНА ОТ 500+ ПРЕДПРИЕМАЧИ, АДВОКАТИ, СЧЕТОВОДИТЕЛИ У НАС И В ЧУЖБИНА
        </p>

        {loop.length > 0 && (
          <div className="partners-marquee group relative overflow-hidden">
            {/* edge fades */}
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-background to-transparent sm:w-24" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-background to-transparent sm:w-24" />

            <div className="partners-marquee__track flex w-max gap-4 sm:gap-5">
              {loop.map((p, i) => {
                const card = (
                  <div className="flex h-24 w-44 items-center justify-center rounded-xl border border-border/60 bg-card/80 px-3 shadow-[0_1px_0_0_hsl(var(--border)/0.6),0_8px_24px_-12px_hsl(var(--background)/0.6)] backdrop-blur-sm transition-colors duration-200 hover:border-gold/50 sm:h-28 sm:w-52">
                    <img
                      src={p.logo_url}
                      alt={p.name}
                      loading="lazy"
                      decoding="async"
                      width={200}
                      height={80}
                      {...({ fetchpriority: "low" } as any)}
                      className="h-[80%] w-[80%] object-contain"
                    />
                  </div>
                );
                return p.website_url ? (
                  <a
                    key={`${p.id}-${i}`}
                    href={p.website_url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    title={p.name}
                    aria-label={p.name}
                    className="shrink-0"
                  >
                    {card}
                  </a>
                ) : (
                  <div key={`${p.id}-${i}`} title={p.name} className="shrink-0">
                    {card}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
