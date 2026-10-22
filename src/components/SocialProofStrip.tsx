import type * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
// Леки константи вместо целия CATALOG/SECTORS (~1 MB JSON) — виж src/data/catalogCounts.ts
import { TEMPLATES_COUNT, SECTORS_COUNT } from "@/data/catalogCounts";
import { PartnerCarousel } from "@/components/PartnerCarousel";
import { useCountUp } from "@/hooks/useCountUp";

function InlineCount({ value }: { value: number }) {
  const { ref, value: shown } = useCountUp(value, { duration: 900 });
  return (
    <strong ref={ref as React.Ref<HTMLElement>} data-testid="inline-users-count" aria-label={`${value} регистрирани`}
      className="inline-block min-w-[3ch] font-serif text-xl font-bold tabular-nums text-gold sm:text-2xl">
      <span aria-hidden="true">{Math.round(shown).toLocaleString("bg-BG")}</span>
    </strong>
  );
}


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
export async function fetchRegisteredUsers(): Promise<number> {
  const { data: result, error } = await supabase.rpc("get_registered_users_count");
  const data: unknown = result;
  if (error) throw error;
  if (data === null || data === undefined || data === "") throw new Error("Празен брой регистрирани потребители");
  const n = typeof data === "number" ? data : Number(data);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new Error("Невалиден брой регистрирани потребители");
  }
  return n;
}

function ExactCount({ value, className }: { value: number; className?: string }) {
  return (
    <span className={className} aria-label={`${value} регистрирани потребители`}>
      <span className="tabular-nums">{value.toLocaleString("bg-BG")}</span>
    </span>
  );
}

export function SocialProofStrip() {
  const { data: partners = [] } = useQuery({
    queryKey: ["public-partners"],
    queryFn: fetchApprovedPartners,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
  });

  const { data: registeredUsers, isPending: usersPending, isFetching, refetch } = useQuery({
    queryKey: ["public-registered-users-count"],
    queryFn: fetchRegisteredUsers,
    retry: 2,
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 4000),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  // Валидни кеширани данни остават видими и при временна грешка при опресняване.
  const hasUsers = typeof registeredUsers === "number";
  const usersUnavailable = !hasUsers && !usersPending;
  const retryUsers = () => { void refetch(); };

  const catalogMetrics: { value: string; label: string }[] = [
    ...(TEMPLATES_COUNT > 0 ? [{ value: `${TEMPLATES_COUNT}`, label: "образеца в каталога" }] : []),
    ...(SECTORS_COUNT > 0 ? [{ value: `${SECTORS_COUNT}`, label: "правни сектора" }] : []),
  ];

  return (
    <section id="partners" aria-label="Партньори" className="border-b border-border bg-muted/50">
      <div className="container py-10 sm:py-12">
        <p className="max-w-[70ch] text-base leading-relaxed text-foreground/85 sm:text-lg" data-testid="social-proof-sentence">
          Към нас вече се присъединиха{" "}
          {hasUsers ? <InlineCount value={registeredUsers} />
            : usersPending ? <span aria-hidden="true" className="inline-block h-5 w-12 animate-pulse rounded-sm bg-muted align-middle" />
            : null}
          {usersUnavailable ? "" : " "}потребители — фирми, специалисти на свободна практика, адвокати и счетоводители.
        </p>

        <PartnerCarousel partners={partners} />

        <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-2 text-sm text-muted-foreground">
          <div className="flex min-h-8 items-baseline gap-2" data-users-metric="">
            <dd className="min-w-[3ch] font-serif text-xl text-foreground">
              {hasUsers ? <ExactCount value={registeredUsers} />
                : usersPending ? <span aria-hidden="true" className="inline-block h-5 w-10 animate-pulse rounded-sm bg-muted align-middle" />
                : <span aria-hidden="true">—</span>}
            </dd>
            <dt>
              регистрирани потребители
              {usersPending && <span className="sr-only"> Зарежда се</span>}
              {usersUnavailable && (
                <>
                  <span className="sr-only"> — броят не е наличен в момента</span>
                  <button type="button" onClick={retryUsers} disabled={isFetching}
                    className="ml-2 inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground disabled:opacity-60">
                    {isFetching ? "Зарежда се…" : "Опитайте отново"}
                  </button>
                </>
              )}
            </dt>
          </div>
          {catalogMetrics.map((m) => (
            <div key={m.label} className="flex min-h-8 items-baseline gap-2">
              <dd className="font-serif text-xl tabular-nums text-foreground">{m.value}</dd>
              <dt>{m.label}</dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
