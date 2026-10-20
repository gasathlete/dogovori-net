import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
// Леки константи вместо целия CATALOG/SECTORS (~1 MB JSON) — виж src/data/catalogCounts.ts
import { TEMPLATES_COUNT, SECTORS_COUNT } from "@/data/catalogCounts";
import { storageThumb } from "@/lib/imageThumb";


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

/**
 * Единствен източник на истината за броя регистрирани потребители.
 * При грешка или невалиден резултат хвърля — не връща измислена стойност.
 */
async function fetchRegisteredUsers(): Promise<number> {
  const { data, error } = await supabase.rpc("get_registered_users_count");
  if (error) throw error;
  const n = typeof data === "number" ? data : Number(data);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new Error("Невалиден брой регистрирани потребители");
  }
  return n;
}

/**
 * Точният проверен брой се показва директно след индикатора за зареждане —
 * без анимация от видима нула, за да не изглежда като по-малко потребители.
 */
function ExactCount({ value, className }: { value: number; className?: string }) {
  return (
    <span className={className}>
      <span className="tabular-nums">{value.toLocaleString("bg-BG")}</span>
    </span>
  );
}




export function SocialProofStrip() {
  // Public, near-static list. Cache aggressively — same data for every visitor.
  const { data: partners = [] } = useQuery({
    queryKey: ["public-partners"],
    queryFn: fetchApprovedPartners,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
  });

  const {
    data: registeredUsers,
    isPending: usersPending,
    isError: usersError,
  } = useQuery({
    queryKey: ["public-registered-users-count"],
    queryFn: fetchRegisteredUsers,
    retry: false,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  const hasUsers = !usersError && typeof registeredUsers === "number";

  // Дублираме списъка достатъчно пъти, за да е пистата ≥2× екрана и loop-ът да е безшевен.
  const base =
    partners.length > 0 && partners.length < 6
      ? [...partners, ...partners, ...partners].slice(0, Math.max(partners.length * 2, 6))
      : partners;
  const loop = base.length > 0 ? [...base, ...base] : [];

  const catalogMetrics: { value: string; label: string }[] = [
    ...(TEMPLATES_COUNT > 0 ? [{ value: `${TEMPLATES_COUNT}`, label: "образеца в каталога" }] : []),
    ...(SECTORS_COUNT > 0 ? [{ value: `${SECTORS_COUNT}`, label: "правни сектора" }] : []),
  ];
  const metricsCols = catalogMetrics.length + (hasUsers || usersPending ? 1 : 0);

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
            {hasUsers ? (
              <>
                Използвана от{" "}
                <ExactCount
                  value={registeredUsers as number}
                  className="font-semibold text-foreground"
                />{" "}
                регистрирани фирми, специалисти на свободна практика, адвокати и счетоводители у
                нас и в чужбина.
              </>
            ) : usersPending ? (
              <>
                Използвана от{" "}
                <span
                  aria-hidden="true"
                  className="inline-block h-[1em] w-12 translate-y-[0.15em] animate-pulse rounded bg-muted align-baseline"
                />{" "}
                регистрирани фирми, специалисти на свободна практика, адвокати и счетоводители у
                нас и в чужбина.
              </>
            ) : (
              <>
                Използвана от фирми, специалисти на свободна практика, адвокати и счетоводители у
                нас и в чужбина.
              </>
            )}
          </p>
        </div>

        {loop.length > 0 && (
          <div className="partners-marquee group relative">
            <div className="partners-marquee__track flex w-max gap-5 py-4 sm:gap-6 lg:gap-8">
              {loop.map((p, i) => {
                const card = (
                  <div className="proof-logo-card flex h-44 w-44 items-center justify-center rounded-2xl p-3 sm:h-56 sm:w-56 sm:p-4 lg:h-72 lg:w-80 lg:p-5">
                    <img
                      src={storageThumb(p.logo_url, 640, 576, { fit: "cover", quality: 62 })}
                      alt={p.name}
                      loading="lazy"
                      decoding="async"
                      width={320}
                      height={288}
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

        {metricsCols > 0 && (
          <dl
            className="mx-auto mt-8 grid max-w-2xl divide-x divide-border/50 rounded-2xl border border-border/50 bg-card/40 py-4 backdrop-blur-sm"
            style={{ gridTemplateColumns: `repeat(${metricsCols}, minmax(0, 1fr))` }}
          >
            {hasUsers && (
              <div className="flex flex-col items-center gap-0.5 px-2">
                <dt className="sr-only">регистрирани потребители</dt>
                <dd
                  className="font-serif text-xl text-foreground sm:text-2xl"
                  aria-label={`${(registeredUsers as number).toLocaleString("bg-BG")} регистрирани потребители`}
                >
                  <ExactCount value={registeredUsers as number} />
                </dd>
                <span className="text-center text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  регистрирани потребители
                </span>
              </div>
            )}
            {!hasUsers && usersPending && (
              <div className="flex flex-col items-center gap-0.5 px-2">
                <dt className="sr-only">регистрирани потребители</dt>
                <dd className="font-serif text-xl text-foreground sm:text-2xl">
                  <span
                    aria-hidden="true"
                    className="inline-block h-[1em] w-10 animate-pulse rounded bg-muted"
                  />
                  <span className="sr-only">Зарежда се</span>
                </dd>
                <span className="text-center text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  регистрирани потребители
                </span>
              </div>
            )}
            {catalogMetrics.map((m) => (
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
