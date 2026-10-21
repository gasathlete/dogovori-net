import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
// Леки константи вместо целия CATALOG/SECTORS (~1 MB JSON) — виж src/data/catalogCounts.ts
import { TEMPLATES_COUNT, SECTORS_COUNT } from "@/data/catalogCounts";
import { PartnerCarousel } from "@/components/PartnerCarousel";


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

  const catalogMetrics: { value: string; label: string }[] = [
    ...(TEMPLATES_COUNT > 0 ? [{ value: `${TEMPLATES_COUNT}`, label: "образеца в каталога" }] : []),
    ...(SECTORS_COUNT > 0 ? [{ value: `${SECTORS_COUNT}`, label: "правни сектора" }] : []),
  ];

  return (
    <section id="partners" aria-label="Партньори" className="border-b border-border bg-muted/50">
      <div className="container py-10 sm:py-12">
        <p className="max-w-[70ch] text-base leading-relaxed text-foreground/85">
          {hasUsers ? (
            <>
              Използвана от <ExactCount value={registeredUsers as number} className="font-semibold text-foreground" /> регистрирани
              фирми, специалисти на свободна практика, адвокати и счетоводители у нас и в чужбина.
            </>
          ) : (
            <>Използвана от фирми, специалисти на свободна практика, адвокати и счетоводители у нас и в чужбина.</>
          )}
          {usersPending && <span className="sr-only"> Зарежда се</span>}
        </p>

        <PartnerCarousel partners={partners} />

        {(hasUsers || catalogMetrics.length > 0) && (
          <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-2 text-sm text-muted-foreground">
            {hasUsers && (
              <div className="flex items-baseline gap-2">
                <dd className="font-serif text-xl text-foreground"><ExactCount value={registeredUsers as number} /></dd>
                <dt>регистрирани потребители</dt>
              </div>
            )}
            {catalogMetrics.map((m) => (
              <div key={m.label} className="flex items-baseline gap-2">
                <dd className="font-serif text-xl tabular-nums text-foreground">{m.value}</dd>
                <dt>{m.label}</dt>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
