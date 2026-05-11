import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PartnerSubmitDialog } from "./PartnerSubmitDialog";
import { Handshake } from "lucide-react";

type Partner = {
  id: string;
  name: string;
  website_url: string | null;
  logo_url: string;
};

export function PartnersBoard() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("partners")
      .select("id,name,website_url,logo_url")
      .eq("status", "approved")
      .order("display_order", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(40);
    setPartners((data as Partner[]) ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  const loop = partners.length > 0 ? [...partners, ...partners] : [];

  return (
    <section id="partners" className="container py-14 sm:py-16 md:py-20">
      {/* Elegant gold divider above section */}
      <div className="mx-auto mb-10 max-w-xs gold-divider" />

      <div className="text-center mb-10">
        <div className="eyebrow mb-4 justify-center">
          <Handshake className="h-3.5 w-3.5" />
          Партньори
        </div>
        <h3 className="font-serif text-xl font-bold leading-tight text-balance sm:text-2xl md:text-3xl">
          Партньорите, които ни се довериха през последния месец
        </h3>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
          Фирми и професионалисти, които използват Dogovori.net в ежедневието си.
        </p>
      </div>

      {partners.length > 0 ? (
        <div className="relative">
          {/* Premium elevated frame */}
          <div
            className="group relative overflow-hidden rounded-2xl border border-hairline bg-fine-grid"
            style={{
              background:
                "var(--gradient-fine-noise), linear-gradient(180deg, hsl(220 38% 11%) 0%, hsl(220 42% 9%) 100%)",
              boxShadow:
                "inset 0 1px 0 hsl(43 55% 54% / 0.06), 0 20px 60px -15px hsl(220 60% 4% / 0.55)",
            }}
          >
            {/* Top hairline accent */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" />

            {/* Corner tick decorations */}
            <div className="absolute top-3 left-3 h-5 w-5 border-l border-t border-gold/30 pointer-events-none" />
            <div className="absolute top-3 right-3 h-5 w-5 border-r border-t border-gold/30 pointer-events-none" />
            <div className="absolute bottom-3 left-3 h-5 w-5 border-l border-b border-gold/30 pointer-events-none" />
            <div className="absolute bottom-3 right-3 h-5 w-5 border-r border-b border-gold/30 pointer-events-none" />

            <div className="py-12 sm:py-14 md:py-16">
              <div
                className="flex w-max items-center gap-20 sm:gap-24 md:gap-28 animate-marquee group-hover:[animation-play-state:paused]"
                style={{
                  maskImage:
                    "linear-gradient(to right, transparent, black 5%, black 95%, transparent)",
                  WebkitMaskImage:
                    "linear-gradient(to right, transparent, black 5%, black 95%, transparent)",
                }}
              >
                {loop.map((p, i) => {
                  const inner = (
                    <div className="flex items-center justify-center rounded-lg bg-card/40 border border-hairline/60 px-6 py-4 sm:px-8 sm:py-5 md:px-10 md:py-6 transition-all duration-300 hover:border-gold/25 hover:bg-card/70 hover:shadow-soft group/item">
                      <img
                        src={p.logo_url}
                        alt={p.name}
                        loading="lazy"
                        className="h-16 sm:h-20 md:h-24 w-auto max-w-[200px] sm:max-w-[240px] md:max-w-[280px] object-contain opacity-80 transition-all duration-300 group-hover/item:opacity-100 group-hover/item:scale-[1.03]"
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
                      className="shrink-0"
                    >
                      {inner}
                    </a>
                  ) : (
                    <div key={`${p.id}-${i}`} title={p.name} className="shrink-0">
                      {inner}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="relative overflow-hidden rounded-2xl border border-hairline p-10 text-center"
          style={{
            background:
              "var(--gradient-fine-noise), linear-gradient(180deg, hsl(220 38% 11%) 0%, hsl(220 42% 9%) 100%)",
          }}
        >
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" />
          <p className="text-sm text-muted-foreground">
            Бъдете първите партньори, които се появяват тук.
          </p>
        </div>
      )}

      <div className="mt-8 flex justify-center">
        <button onClick={() => setOpen(true)} className="btn-ghost-gold">
          Регистрирайте Вашата фирма
        </button>
      </div>

      <PartnerSubmitDialog open={open} onOpenChange={setOpen} onSubmitted={load} />
    </section>
  );
}
