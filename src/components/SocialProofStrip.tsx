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
          БЪЛГАРСКА ПЛАТФОРМА, ИЗПОЛЗВАНА ОТ 500+ ПРЕДПРИЕМАЧИ, АДВОКАТИ, СЧЕТОВОДИТЕЛИ У НАС И В ЧУЖБИНА
        </p>
        {partners.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-5 sm:gap-x-14">
            {partners.map((p) => (
              <img
                key={p.id}
                src={p.logo_url}
                alt={p.name}
                loading="lazy"
                decoding="async"
                width={140}
                height={40}
                {...({ fetchpriority: "low" } as any)}
                className="h-9 w-auto max-w-[140px] object-contain opacity-70 transition-opacity duration-200 hover:opacity-100 sm:h-10"
              />
            ))}
          </div>
        )}

      </div>
    </section>
  );
}
