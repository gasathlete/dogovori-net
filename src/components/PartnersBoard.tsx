import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PartnerSubmitDialog } from "./PartnerSubmitDialog";
import { Handshake } from "@/icons";

type Partner = {
  id: string;
  name: string;
  website_url: string | null;
  logo_url: string;
};

const INITIAL_LIMIT = 12;

export function PartnersBoard() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

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
    if ((window as any).__partnersLoaded) return;
    (window as any).__partnersLoaded = true;
    load();
  }, []);

  const visible = expanded ? partners : partners.slice(0, INITIAL_LIMIT);
  const hasMore = partners.length > INITIAL_LIMIT;

  return (
    <section id="partners" className="container py-20 sm:py-24 md:py-28">
      <div className="mx-auto mb-10 max-w-xs gold-divider" />

      <div className="text-center mb-12 md:mb-16">
        <div className="eyebrow mb-5 justify-center">
          <Handshake className="h-3.5 w-3.5" />
          Партньори
        </div>
        <h2 className="font-serif text-3xl font-bold leading-tight text-balance sm:text-4xl md:text-5xl">
          Доверяват ни се водещи екипи
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
          Фирми и професионалисти, които използват Dogovori.net в ежедневието си.
        </p>
      </div>

      {partners.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 md:gap-6">
            {visible.map((p) => {
              const inner = (
                <div className="flex h-40 items-center justify-center rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/40 hover:shadow-soft sm:h-44 sm:p-7 md:h-48 md:p-8">
                  <img
                    src={p.logo_url}
                    alt={p.name}
                    loading="lazy"
                    decoding="async"
                    {...({ fetchpriority: "low" } as any)}
                    width={400}
                    height={144}
                    className="max-h-[72%] max-w-[80%] object-contain"
                  />
                </div>
              );
              return p.website_url ? (
                <a
                  key={p.id}
                  href={p.website_url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  title={p.name}
                  className="block"
                >
                  {inner}
                </a>
              ) : (
                <div key={p.id} title={p.name}>
                  {inner}
                </div>
              );
            })}
          </div>

          {hasMore && (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-gold"
              >
                {expanded ? "Покажи по-малко ↑" : `Покажи всички (${partners.length}) ↓`}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-10 text-center">
          <p className="text-base text-muted-foreground">
            Бъдете първите партньори, които се появяват тук.
          </p>
        </div>
      )}

      <div className="mt-10 flex justify-center">
        <button onClick={() => setOpen(true)} className="btn-ghost-gold">
          Регистрирайте Вашата фирма
        </button>
      </div>

      <PartnerSubmitDialog open={open} onOpenChange={setOpen} onSubmitted={load} />
    </section>
  );
}
