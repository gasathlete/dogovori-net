import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Crown, Sparkles, ArrowRight, Check, MessageSquare, ShieldCheck,
  Zap, Users, LayoutDashboard, PenTool, Languages, BarChart3, LucideIcon,
} from "@/icons";
import { useIsPro } from "@/hooks/useIsPro";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

/**
 * Elegant, "digital" welcome dialog that appears exactly once per user
 * per plan transition (Professional → Entrepreneur → Team).
 *
 * Storage keys are versioned; bump the suffix to re-show on future revamps.
 */
type PlanKey = "professional" | "entrepreneur" | "team";

interface PlanCopy {
  storageKey: string;
  badge: string;
  title: string;
  subtitle: string;
  accent: string;      // tailwind gradient class for header ring
  icon: LucideIcon;
  ctaHref: string;
  ctaLabel: string;
  features: { icon: LucideIcon; title: string; desc: string }[];
}

const COPY: Record<PlanKey, PlanCopy> = {
  professional: {
    storageKey: "dgv:welcome:professional:v1",
    badge: "Професионалист · активен",
    title: "Добре дошли, Професионалист",
    subtitle: "50 операции/месец, пълен AI risk report и сваляне без воден знак.",
    accent: "from-sky-500/25 via-sky-400/10 to-transparent",
    icon: Zap,
    ctaHref: "/catalog",
    ctaLabel: "Изготви първи договор",
    features: [
      { icon: Languages, title: "Двуезични договори (BG/EN)", desc: "За международни партньори — с една команда." },
      { icon: ShieldCheck, title: "Пълен Risk Report", desc: "Детайлен анализ и препоръки за всяка клауза." },
      { icon: PenTool, title: "Автоматични корекции", desc: "AI прилага preferred wording на минути." },
    ],
  },
  entrepreneur: {
    storageKey: "dgv:welcome:entrepreneur:v2",
    badge: "Предприемач · активен",
    title: "Добре дошли, Предприемач",
    subtitle: "100 операции/месец, GPT-5 разсъждаване и 24/7 премиум поддръжка.",
    accent: "from-gold/30 via-gold/10 to-transparent",
    icon: Crown,
    ctaHref: "/catalog",
    ctaLabel: "Стартирай сделка",
    features: [
      { icon: Sparkles, title: "GPT-5 reasoning", desc: "Най-силният модел за сложни преговори и структури." },
      { icon: MessageSquare, title: "Преговорни тактики", desc: "Готови контра-аргументи за всяка проблемна клауза." },
      { icon: BarChart3, title: "Разширена аналитика", desc: "Мери операции, спестено време и ROI на всяка сделка." },
    ],
  },
  team: {
    storageKey: "dgv:welcome:team:v1",
    badge: "Екип · активен",
    title: "Добре дошли в Екип",
    subtitle: "100 операции/място, споделени папки, контакти и подписи за целия екип.",
    accent: "from-emerald-500/25 via-emerald-400/10 to-transparent",
    icon: Users,
    ctaHref: "/account?tab=team",
    ctaLabel: "Покани съотборници",
    features: [
      { icon: Users, title: "Многопотребителски достъп", desc: "Роли, права и одит на всяко действие." },
      { icon: LayoutDashboard, title: "Споделен Workspace", desc: "Обща библиотека от чернови, сделки и подписи." },
      { icon: ShieldCheck, title: "SSO и одит", desc: "SAML SSO, IP allowlist и лог за съответствие." },
    ],
  },
};

export function PlanWelcomeDialog() {
  const { isPro, isTeam, isEntrepreneur, isProfessional, loading } = useIsPro();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  // User-scoped storage key so different accounts on same browser each see it once,
  // and one account never re-sees it after login. Also persisted to the user's
  // auth metadata (`plan_welcome_seen_at`) so the dialog shows only once per
  // profile — across devices/browsers/reinstalls, not just per localStorage.
  const uid = user?.id ?? "anon";
  const scopedKey = (base: string) => `${base}:u:${uid}`;
  const profileSeen = Boolean((user?.user_metadata as any)?.plan_welcome_seen_at);

  // Priority: Team > Entrepreneur > Professional. Only ONE dialog per user,
  // ever — when a higher tier is shown we also mark all lower-tier keys as
  // seen so a Team subscriber (who also satisfies isEntrepreneur / isPro)
  // does not get a second and third welcome popup in a row.
  const active = useMemo<PlanKey | null>(() => {
    if (loading || !user) return null;
    if (typeof window === "undefined") return null;
    if (profileSeen) return null;
    const seen = (k: string) => window.localStorage.getItem(scopedKey(k)) === "1";
    const anySeen =
      seen(COPY.team.storageKey) ||
      seen(COPY.entrepreneur.storageKey) ||
      seen(COPY.professional.storageKey);
    if (anySeen) return null;
    if (isTeam) return "team";
    if (isEntrepreneur) return "entrepreneur";
    if (isProfessional) return "professional";
    if (isPro) return "entrepreneur";
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPro, isTeam, isEntrepreneur, isProfessional, loading, user?.id, profileSeen]);

  useEffect(() => {
    if (!active) return;
    // Mark THIS plan + every other tier as seen so the dialog can never
    // appear again for this user on this device, regardless of plan flags.
    try {
      window.localStorage.setItem(scopedKey(COPY.team.storageKey), "1");
      window.localStorage.setItem(scopedKey(COPY.entrepreneur.storageKey), "1");
      window.localStorage.setItem(scopedKey(COPY.professional.storageKey), "1");
    } catch { /* ignore */ }
    // Persist across devices: write to the user's auth metadata once.
    supabase.auth
      .updateUser({ data: { plan_welcome_seen_at: new Date().toISOString(), plan_welcome_plan: active } })
      .catch(() => undefined);
    const t = setTimeout(() => setOpen(true), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);


  if (!active) return null;
  const copy = COPY[active];
  const Icon = copy.icon;

  const dismiss = () => {
    try { window.localStorage.setItem(scopedKey(copy.storageKey), "1"); } catch { /* ignore */ }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && dismiss()}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto overflow-x-hidden border-border/60 p-0 sm:w-full">
        {/* Header — animated gradient ring & subtle grid pattern for a "digital" feel */}
        <div className={`relative overflow-hidden bg-gradient-to-br ${copy.accent} px-6 pb-5 pt-8 text-center`}>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.15]"
            style={{
              backgroundImage:
                "linear-gradient(hsl(var(--foreground)/0.35) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)/0.35) 1px, transparent 1px)",
              backgroundSize: "22px 22px",
              maskImage: "radial-gradient(circle at 50% 0%, black 30%, transparent 75%)",
              WebkitMaskImage: "radial-gradient(circle at 50% 0%, black 30%, transparent 75%)",
            }}
          />
          <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-white/10 to-white/0 ring-1 ring-white/15 backdrop-blur">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-gold text-navy shadow-gold">
              <Icon className="h-6 w-6" />
            </div>
          </div>
          <div className="relative mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/20 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/80">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            {copy.badge}
          </div>
          <DialogHeader className="relative mt-2">
            <DialogTitle className="font-serif text-2xl">{copy.title}</DialogTitle>
          </DialogHeader>
          <p className="relative mt-1 text-sm text-muted-foreground">{copy.subtitle}</p>
        </div>

        {/* Features */}
        <div className="space-y-2 px-6 pb-2 pt-4">
          {copy.features.map((f) => (
            <div
              key={f.title}
              className="group flex items-start gap-3 rounded-lg border border-border/60 bg-card/40 p-3 transition-colors hover:border-gold/40 hover:bg-card/70"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold ring-1 ring-gold/20">
                <f.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold">{f.title}</div>
                <div className="text-xs text-muted-foreground">{f.desc}</div>
              </div>
              <Check className="ml-auto h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 px-6 pb-[calc(env(safe-area-inset-bottom,0)+1.25rem)] pt-3 sm:flex-row">
          <Button asChild className="flex-1 bg-gradient-gold text-navy hover:shadow-gold">
            <Link to={copy.ctaHref} onClick={dismiss}>
              {copy.ctaLabel} <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" className="flex-1" onClick={dismiss}>
            Разгледай профила
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
