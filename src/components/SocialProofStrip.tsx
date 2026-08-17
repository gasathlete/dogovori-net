import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
// Леки константи вместо целия CATALOG/SECTORS (~1 MB JSON) — виж src/data/catalogCounts.ts
import { TEMPLATES_COUNT, SECTORS_COUNT } from "@/data/catalogCounts";


type Partner = { id: string; name: string; logo_url: string; website_url?: string | null };

async function fetchApprovedPartners(): Promise<Partner[]> {
  const { data } = await supabase
    .from("partners")
    .select("id,name,logo_url,website_url")
    .eq("status", "approved")
    .order("display_order", { ascending: false })
    .limit(24);
  const seen = new Set<string>();
  return ((data as Partner[]) ?? []).filter((p) => {
    const key = `${(p.name || "").trim().toLowerCase()}|${p.logo_url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchRegisteredUsers(): Promise<number> {
  const { data, error } = await supabase.rpc("get_registered_users_count");
  if (error || data === null || data === undefined) return 100;
  const n = typeof data === "number" ? data : Number(data);
  return Number.isFinite(n) ? Math.max(100, n) : 100;
}




export function SocialProofStrip() {
  // Public, near-static list. Cache aggressively — same data for every visitor.
  const { data: partners = [] } = useQuery({
    queryKey: ["public-partners"],
    queryFn: fetchApprovedPartners,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
  });

  const { data: registeredUsers = 100 } = useQuery({
    queryKey: ["public-registered-users-count"],
    queryFn: fetchRegisteredUsers,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  // Duplicate the list so the marquee loops seamlessly.
  const loop = partners.length > 0 ? [...partners, ...partners] : [];

  const metrics: { value: string; label: string }[] = [
    { value: `${registeredUsers}+`, label: "фирми и специалисти" },
    ...(TEMPLATES_COUNT > 0 ? [{ value: `${TEMPLATES_COUNT}`, label: "готови шаблона" }] : []),
    ...(SECTORS_COUNT > 0 ? [{ value: `${SECTORS_COUNT}`, label: "правни сектора" }] : []),
  ];

  return (
    <section id="partners" aria-label="Партньори" className="proof-band relative isolate">
      <div className="container relative py-10 sm:py-14">
        {/* Eyebrow: live индикатор + акцентиран брояч */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground backdrop-blur-sm">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold/70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-gold" />
            </span>
            Българска платформа
          </span>

          <p className="max-w-2xl text-balance text-sm leading-relaxed text-muted-foreground sm:text-base">
            Използвана от{" "}
            <span className="font-semibold tabular-nums text-foreground">{registeredUsers}+</span>{" "}
            &nbsp;&nbsp;фирми, специалисти на свободна практика, адвокати и счетоводители
            у нас и в чужбина.
          </p>
        </div>

        {loop.length > 0 && (
          <div className="partners-marquee group relative">
            <div className="partners-marquee__track flex w-max gap-6 py-3 sm:gap-8">
              {loop.map((p, i) => {
                const card = (
                  <div className="proof-logo-card flex aspect-square h-36 w-36 items-center justify-center rounded-2xl p-3 sm:h-44 sm:w-44">
                    <img
                      src={p.logo_url}
                      alt={p.name}
                      loading="lazy"
                      decoding="async"
                      width={200}
                      height={200}
                      {...({ fetchpriority: "low" } as any)}
                      className="proof-logo-img h-full w-full rounded-xl object-cover"
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
                    className="shrink-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
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

        {metrics.length > 0 && (
          <dl className="mx-auto mt-8 grid max-w-2xl grid-cols-3 divide-x divide-border/50 rounded-2xl border border-border/50 bg-card/40 py-4 backdrop-blur-sm">
            {metrics.map((m) => (
              <div key={m.label} className="flex flex-col items-center gap-0.5 px-2">
                <dt className="sr-only">{m.label}</dt>
                <dd className="font-serif text-xl tabular-nums text-foreground sm:text-2xl">{m.value}</dd>
                <span className="text-center text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {m.label}
                </span>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
