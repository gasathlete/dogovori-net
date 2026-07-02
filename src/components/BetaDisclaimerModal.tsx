import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ArrowRight } from "lucide-react";


/**
 * BetaDisclaimerModal — shown on the first visit to announce the beta period
 * (until the official launch on 2026-09-01) and the perks early users get.
 *
 * Persistence:
 *  - `localStorage[STORAGE_KEY]` → permanent ack ("Не ме показвай повече" checked).
 *  - `sessionStorage[SESSION_KEY]` → suppress for current tab/session only when
 *    the user closes the modal without checking the box.
 */
const STORAGE_KEY = "dogovori_beta_ack_v1";
const SESSION_KEY = "dogovori_beta_ack_session_v1";
const LAUNCH_DATE = "01.09.2026";

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

const HIGHLIGHTS: Array<{ label: string; detail: string }> = [
  {
    label: "Фиксирана промо-цена",
    detail: "До 30% под официалната тарифа, заключена за 12 месеца.",
  },
  {
    label: "10 безплатни операции",
    detail: "След регистрация — без карта, без ангажимент.",
  },
  {
    label: "Пълен достъп до AI функциите",
    detail: "Асистент, Risk Analysis, е-Подпис и Комплекти.",
  },
  {
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
    // Avoid stacking on top of the cookie banner (which appears first on
    // fresh visits). Poll briefly for the banner to disappear before opening.
    const start = Date.now();
    const iv = window.setInterval(() => {
      const cookieBannerOpen = !!document.querySelector(
        '[aria-label="Бисквитки — управление по категории"]',
      );
      const elapsed = Date.now() - start;
      if (!cookieBannerOpen || elapsed > 8000) {
        window.clearInterval(iv);
        setOpen(true);
      }
    }, 400);
    return () => window.clearInterval(iv);
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
      <DialogContent className="max-h-[92vh] max-w-md overflow-y-auto border-border/60 bg-card p-0 sm:max-w-lg">
        {/* Header strip */}
        <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-gold" aria-hidden />
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Beta program
            </span>
          </div>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            Launch · {LAUNCH_DATE}
          </span>
        </div>

        {/* Body */}
        <div className="px-6 pb-6 pt-5">
          <h2 className="font-serif text-[26px] leading-tight tracking-tight text-foreground">
            Работим в бета до 1 септември 2026 г.
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Изграждаме dogovori.net заедно с първите ни потребители. Ранните акаунти
            получават закотвени условия, приоритет в поддръжката и глас в развитието
            на продукта.
          </p>

          <dl className="mt-5 divide-y divide-border/60 border-y border-border/60">
            {HIGHLIGHTS.map((item) => (
              <div key={item.label} className="grid grid-cols-[1fr_auto] items-start gap-4 py-3">
                <dt className="text-sm font-medium text-foreground">{item.label}</dt>
                <dd className="col-span-2 -mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {item.detail}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 flex flex-col gap-2">
            <Link
              to="/auth?tab=signup"
              onClick={close}
              className="group inline-flex items-center justify-center gap-2 rounded-md bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-transform hover:-translate-y-px"
            >
              Регистрация — 10 операции безплатно
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
