import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PartnerSubmitDialog } from "./PartnerSubmitDialog";

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

  // Duplicate list so the marquee loops seamlessly
  const loop = partners.length > 0 ? [...partners, ...partners] : [];

  return (
    <section id="partners" className="container py-14 sm:py-16 md:py-20">
      <div className="text-center mb-8">
        <div className="eyebrow mb-3 justify-center">Партньори</div>
        <h3 className="font-serif text-xl font-bold leading-tight text-balance sm:text-2xl md:text-3xl">
          Партньорите, които ни се довериха през последния месец
        </h3>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
          Фирми и професионалисти, които използват Dogovori.net в ежедневието си.
        </p>
      </div>

      {partners.length > 0 ? (
        <div
          className="group relative overflow-hidden rounded-xl border border-hairline bg-card/40 py-6"
          style={{
            maskImage:
              "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
          }}
        >
          <div
            className="flex w-max items-center gap-10 animate-marquee group-hover:[animation-play-state:paused]"
          >
            {loop.map((p, i) => {
              const inner = (
                <img
                  src={p.logo_url}
                  alt={p.name}
                  loading="lazy"
                  className="h-14 w-auto max-w-[160px] object-contain opacity-80 transition-opacity hover:opacity-100"
                />
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
      ) : (
        <div className="rounded-xl border border-dashed border-hairline bg-card/30 p-8 text-center text-sm text-muted-foreground">
          Бъдете първите партньори, които се появяват тук.
        </div>
      )}

      <div className="mt-6 flex justify-center">
        <Button variant="outline" onClick={() => setOpen(true)}>
          Регистрирайте Вашата фирма
        </Button>
      </div>

      <PartnerSubmitDialog open={open} onOpenChange={setOpen} onSubmitted={load} />
    </section>
  );
}
