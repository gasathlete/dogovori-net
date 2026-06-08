import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Partner = { id: string; name: string; logo_url: string };

export function SocialProofStrip() {
  const [partners, setPartners] = useState<Partner[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Cheap query — reuses same `partners` table as PartnersBoard; minimal columns.
      const { data } = await supabase
        .from("partners")
        .select("id,name,logo_url")
        .eq("status", "approved")
        .order("display_order", { ascending: false })
        .limit(8);
      if (!cancelled) setPartners((data as Partner[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="border-y border-border/40 bg-card/20">
      <div className="container py-6 sm:py-7">
        <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Използван от 500+ адвокати, счетоводители и предприемачи в България
        </p>
        {partners.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 sm:gap-x-12">
            {partners.map((p) => (
              <img
                key={p.id}
                src={p.logo_url}
                alt={p.name}
                loading="lazy"
                decoding="async"
                width={120}
                height={32}
                {...({ fetchpriority: "low" } as any)}
                className="h-7 w-auto max-w-[120px] object-contain opacity-50 grayscale transition-opacity duration-200 hover:opacity-90 hover:grayscale-0 sm:h-8"
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
