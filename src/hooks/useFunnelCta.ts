/**
 * useFunnelCta — single source of truth for the primary CTA on every funnel
 * step. Pre-login users always see „Започни безплатно" (per user rule); after
 * login, the CTA personalizes by plan and step.
 */
import { useAuth } from "@/hooks/useAuth";
import { useIsPro } from "@/hooks/useIsPro";
import type { FunnelStep } from "@/lib/funnel";

export interface FunnelCta {
  label: string;
  href: string;
  /** "primary" = filled gold; "secondary" = outline */
  variant: "primary" | "secondary";
  /** Optional sub-label / micro-copy underneath */
  subLabel?: string;
}

export function useFunnelCta(step: FunnelStep): FunnelCta {
  const { user, loading: authLoading } = useAuth();
  const { isPro, isTeam, isEntrepreneur, loading: planLoading } = useIsPro();

  // While loading, default to the pre-login CTA — it's the safest fallback.
  const loading = authLoading || planLoading;
  const isAnonymous = !user || loading;

  if (isAnonymous) {
    // Pre-login: always „Започни безплатно", target depends on step.
    const href =
      step === 1
        ? "/analiz"
        : step === 2
        ? "/analiz"
        : step === 3
        ? "/auth?tab=signup&redirect=%2Fanaliz"
        : "/auth?tab=signup&redirect=%2Fplans";
    return {
      label: "Започни безплатно",
      href,
      variant: "primary",
      subLabel: step >= 3 ? "Без карта · 60 секунди" : undefined,
    };
  }

  // Post-login, paid plans
  if (isTeam || isEntrepreneur || isPro) {
    if (step === 1)
      return { label: "Изготви нов документ", href: "/build", variant: "primary" };
    if (step === 2 || step === 3)
      return { label: "Анализирай документ", href: "/analiz", variant: "primary" };
    return {
      label: isTeam ? "Покани член в екипа" : "Добави Top-up пакет",
      href: isTeam ? "/team" : "/account?tab=subscription",
      variant: "secondary",
    };
  }

  // Post-login, free plan
  if (step === 1)
    return { label: "Към моите документи", href: "/account", variant: "primary" };
  if (step === 2 || step === 3)
    return {
      label: "Анализирай документ",
      href: "/analiz",
      variant: "primary",
      subLabel: "Остава 1 безплатна · Активирай 7-дневен trial",
    };
  return {
    label: "Активирай Предприемач — 7 дни безплатно",
    href: "/plans?trial=entrepreneur",
    variant: "primary",
  };
}
