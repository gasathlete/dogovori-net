import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ArrowRight, Sparkles, Gift, Zap, Users, ShieldCheck } from "@/icons";

/**
 * BetaDisclaimerModal — shown ~10s after the first visit to announce the beta
 * period (until the official launch on 2026-09-01) and the perks early users
 * get. The delay avoids ambushing the visitor the moment the page loads.
 */
const STORAGE_KEY = "dogovori_beta_ack_v1";
const SESSION_KEY = "dogovori_beta_ack_session_v1";
const LAUNCH_DATE = "01.09.2026";
const APPEAR_DELAY_MS = 10_000;

function hasAcknowledged(): boolean {
  try {
    if (typeof window === "undefined") return true;
    return (
      !!window.localStorage.getItem(STORAGE_KEY) ||
      !!window.sessionStorage.getItem(SESSION_KEY)
    );
  } catch {
    return true;
  }
}

function markAcknowledged(permanent: boolean) {
  try {
    const ts = new Date().toISOString();
    if (permanent) {
      window.localStorage.setItem(STORAGE_KEY, ts);
    } else {
      window.sessionStorage.setItem(SESSION_KEY, ts);
    }
  } catch {
    // ignore
  }
}

type Highlight = {
  icon: typeof Gift;
  label: string;
  detail: string;
  badge?: string;
};

const HIGHLIGHTS: Highlight[] = [
  {
    icon: Gift,
    label: "Фиксирана промо-цена",
    detail: "До 30% под официалната тарифа, заключена за 12 месеца.",
    badge: "−30%",
  },
  {
    icon: Zap,
    label: "5 безплатни операции",
    detail: "След регистрация — без карта, без ангажимент.",
  },
  {
    icon: ShieldCheck,
    label: "Пълен достъп до AI функциите",
    detail: "Асистент, Risk Analysis, е-Подпис и Комплекти.",
  },
  {
    icon: Users,
    label: "Пряко участие в roadmap-а",
    detail: "Обратната ви връзка формира приоритетите ни.",
  },
];

export function BetaDisclaimerModal() {
  const [open, setOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(true);
  const location = useLocation();

  // Never show on routes where it can block critical user actions
  // (login/signup forms, wizard, checkout, account, admin).
  const BLOCKED_PATHS = ["/auth", "/n/", "/wizard", "/plans", "/account", "/admin", "/analiz"];
  const isBlockedRoute = BLOCKED_PATHS.some((p) => location.pathname.startsWith(p));

  useEffect(() => {
    if (isBlockedRoute) return;
    if (hasAcknowledged()) return;

    let timeoutId: number | null = null;
    let intervalId: number | null = null;

    // Wait ~10s so we don't ambush the user on first paint. After the delay,
    // still poll briefly so we don't stack on top of the cookie banner.
    timeoutId = window.setTimeout(() => {
      const start = Date.now();
      intervalId = window.setInterval(() => {
        const cookieBannerOpen = !!document.querySelector(
          '[aria-label="Бисквитки — управление по категории"]',
        );
        const elapsed = Date.now() - start;
        if (!cookieBannerOpen || elapsed > 8000) {
          if (intervalId) window.clearInterval(intervalId);
          setOpen(true);
        }
      }, 400);
    }, APPEAR_DELAY_MS);

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [isBlockedRoute]);

  const close = () => {
    markAcknowledged(dontShowAgain);
    setOpen(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) close();
    else setOpen(true);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-md flex-col overflow-hidden border-border/60 bg-card p-0 sm:max-w-lg">
        {/* Decorative gradient header */}
        <div className="relative shrink-0 overflow-hidden border-b border-border/60 bg-gradient-to-br from-gold/15 via-card to-card px-5 pt-5 pb-4 pr-14 sm:px-6 sm:pt-6 sm:pb-5 sm:pr-16">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gold/20 blur-3xl"
          />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
                <Sparkles className="h-3 w-3" aria-hidden />
                Beta program
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                Launch · {LAUNCH_DATE}
              </span>
            </div>
            <h2 className="mt-2.5 font-serif text-[20px] leading-tight tracking-tight text-foreground sm:text-[24px]">
              Работим в бета до 1 септември 2026 г.
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground sm:text-sm">
              Изграждаме dogovori.net заедно с първите ни потребители. Ранните акаунти
              получават закотвени условия и глас в развитието на продукта.
            </p>
          </div>
        </div>

        {/* Body — highlight grid (scrollable if viewport is short) */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-5 sm:px-6 sm:pt-5 sm:pb-6">
          <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {HIGHLIGHTS.map(({ icon: Icon, label, detail, badge }) => (
              <li
                key={label}
                className="group relative rounded-lg border border-border/60 bg-background/40 p-3 transition-colors hover:border-gold/40 hover:bg-gold/[0.04]"
              >
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gold/30 bg-gold/10 text-gold">
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-[13px] font-semibold leading-tight text-foreground">
                        {label}
                      </p>
                      {badge && (
                        <span className="rounded-sm bg-gold/15 px-1.5 py-0.5 text-[9px] font-bold text-gold">
                          {badge}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
                      {detail}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex flex-col gap-2">
            <Link
              to="/auth?tab=signup"
              onClick={close}
              className="group inline-flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-gold to-gold/80 px-4 py-2.5 text-sm font-semibold text-navy shadow-gold transition-transform hover:-translate-y-px"
            >
              Регистрация — 5 операции безплатно
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <button
              onClick={close}
              className="inline-flex min-h-11 items-center justify-center rounded-md text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Разгледай първо сайта
            </button>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 border-t border-border/60 pt-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="beta-dont-show-again"
                checked={dontShowAgain}
                onCheckedChange={(v) => setDontShowAgain(v === true)}
              />
              <Label
                htmlFor="beta-dont-show-again"
                className="cursor-pointer text-xs text-muted-foreground"
              >
                Не показвай отново
              </Label>
            </div>
            <Link
              to="/#partners"
              onClick={close}
              className="text-[11px] font-medium text-muted-foreground underline-offset-4 hover:text-gold hover:underline"
            >
              Партньорска програма →
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
