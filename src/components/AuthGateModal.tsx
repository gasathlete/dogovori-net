import { useEffect, useState } from "react";
import { drainBufferedEvents } from "@/lib/bufferedEvents";
import { Link, useLocation } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Sparkles,
  ShieldCheck,
  FileSignature,
  BrainCircuit,
  Clock,
  Euro,
  FileText,
  ShieldAlert,
  Languages,
  Package,
  ArrowRight,
  X,
} from "@/icons";
import { TrustGuaranteeBar } from "@/components/funnel/TrustGuaranteeBar";

/**
 * Global auth gate modal.
 *
 * Listens for the `dogovori:require-auth` custom event and renders a single
 * conversion modal that prompts unauthenticated users to register before
 * running any billable operation (download, upload, AI send, e-sign, etc.).
 *
 * Public/SEO pages stay browsable — the gate only fires the moment a user
 * triggers an actual operation through the `useRequireAuth` hook.
 */
export const AUTH_GATE_EVENT = "dogovori:require-auth";

export interface AuthGateDetail {
  /** Short human label, e.g. "Изтегли бланка" — shown above the CTA. */
  action?: string;
  /** Path to return to after successful sign-in. Defaults to current URL. */
  redirect?: string;
}

export function AuthGateModal() {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<AuthGateDetail>({});
  const location = useLocation();

  useEffect(() => {
    const open = (detail: AuthGateDetail) => {
      setDetail(detail || {});
      setOpen(true);
    };
    const handler = (e: Event) => open((e as CustomEvent<AuthGateDetail>).detail);
    window.addEventListener(AUTH_GATE_EVENT, handler as EventListener);
    // Replay any dispatches that happened before this listener mounted
    // (e.g. a fast click while the overlay chunk was still loading).
    drainBufferedEvents(AUTH_GATE_EVENT, (d) => open((d as AuthGateDetail) || {}));
    return () => window.removeEventListener(AUTH_GATE_EVENT, handler as EventListener);
  }, []);

  // Close the gate automatically on route change so it never sticks across navigations.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const redirect = detail.redirect ?? (typeof window !== "undefined" ? location.pathname + location.search : "/");
  const safeRedirect = /^\/[^/\\]/.test(redirect) ? redirect : "/";
  const authHref = `/auth?redirect=${encodeURIComponent(safeRedirect)}`;
  const signupHref = `/auth?tab=signup&redirect=${encodeURIComponent(safeRedirect)}`;

  const skip = () => setOpen(false);

  const stats: Array<{ icon: any; value: string; label: string; tone: "gold" | "emerald" }> = [
    { icon: Clock, value: "~3 ч.", label: "спестено време / документ", tone: "emerald" },
    { icon: Euro, value: "~290 €", label: "вместо адвокат", tone: "gold" },
    { icon: ShieldAlert, value: ">95%", label: "уловени клопки", tone: "emerald" },
  ];

  const features: Array<{ icon: any; label: string }> = [
    { icon: FileText, label: "600+ шаблона" },
    { icon: BrainCircuit, label: "AI асистент" },
    { icon: ShieldAlert, label: "Анализ на риска" },
    { icon: FileSignature, label: "Е-Подпис" },
    { icon: Languages, label: "Двуезични (BG/EN)" },
    { icon: Package, label: "Готови комплекти" },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[92vh] max-w-md overflow-y-auto border-gold/30 bg-card p-0 sm:max-w-lg">
        {/* Skip / close — explicit & always visible */}
        <button
          type="button"
          onClick={skip}
          aria-label="Прескочи"
          className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur transition-colors hover:border-gold/40 hover:text-gold"
        >
          Прескочи
          <X className="h-3 w-3" />
        </button>

        {/* Header band */}
        <div
          className="rounded-t-lg px-5 pb-4 pt-6 sm:px-6"
          style={{
            background:
              "linear-gradient(135deg, hsl(var(--gold) / 0.16) 0%, transparent 75%)",
          }}
        >
          <DialogHeader className="space-y-1.5">
            <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-gold">
              <Sparkles className="h-5 w-5" />
            </div>
            <DialogTitle className="text-center font-serif text-xl leading-tight">
              Регистрирай се за да продължиш
            </DialogTitle>
            <DialogDescription className="text-center text-[13px]">
              {detail.action ? (
                <>
                  За „<span className="font-medium text-foreground">{detail.action}</span>" е необходим безплатен акаунт.
                </>
              ) : (
                <>За тази операция е необходим безплатен акаунт.</>
              )}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
          {/* Savings stats — 3 mini charts */}
          <div className="grid grid-cols-3 gap-2">
            {stats.map((s) => {
              const Icon = s.icon;
              const tone =
                s.tone === "emerald"
                  ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-500"
                  : "border-gold/30 bg-gold/5 text-gold";
              return (
                <div
                  key={s.label}
                  className={`flex flex-col items-center rounded-xl border ${tone} px-2 py-3 text-center`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="mt-1 font-serif text-base font-bold text-foreground sm:text-lg">
                    {s.value}
                  </span>
                  <span className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Visual savings bar */}
          <div className="mt-4 rounded-xl border border-border/60 bg-background/40 p-3">
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider">
              <span className="text-muted-foreground">Адвокат</span>
              <span className="text-emerald-500">DogovaryAI</span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-muted">
              <div className="absolute inset-y-0 left-0 w-full rounded-full bg-gradient-to-r from-rose-500/40 via-amber-400/40 to-emerald-500" />
              <div
                aria-hidden="true"
                className="absolute inset-y-0 right-0 w-[4%] rounded-r-full bg-emerald-500"
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground line-through">~290 €</span>
              <span className="font-semibold text-emerald-500">
                от 0.13 € / документ
              </span>
            </div>
          </div>

          {/* Features grid */}
          <div className="mt-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Какво получаваш
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {features.map((f) => {
                const Icon = f.icon;
                return (
                  <div
                    key={f.label}
                    className="flex items-center gap-2 rounded-lg border border-gold/15 bg-card/60 px-2.5 py-2 text-[12px] font-medium text-foreground"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-gold" />
                    <span className="truncate">{f.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Trust line + guarantees */}
          <div className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>5 безплатни операции · без карта · GDPR</span>
          </div>
          <div className="mt-3">
            <TrustGuaranteeBar compact />
          </div>

          {/* CTAs */}
          <div className="mt-4 flex flex-col gap-2">
            <Link
              to={signupHref}
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-gradient-to-b from-gold to-gold/80 px-4 py-3 text-sm font-semibold text-navy shadow-[0_4px_14px_-4px_hsl(var(--gold)/0.55)] transition-all hover:brightness-110"
            >
              <Sparkles className="h-4 w-4" /> Започни безплатно
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to={authHref}
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center rounded-md px-4 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-gold"
            >
              Имам акаунт → Вход
            </Link>
            <button
              type="button"
              onClick={skip}
              className="text-center text-[11px] text-muted-foreground/80 transition-colors hover:text-foreground"
            >
              Разгледай първо безплатно
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
