import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { BookOpen, CheckCircle2, Download, Loader2, Mail } from "@/icons";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { trackFunnelEvent } from "@/lib/funnel";
import { pickLeadMagnetByContext, type LeadMagnet } from "@/lib/leadMagnets";
import {
  LEAD_MAGNET_CONSENT_COPY,
  subscribeToLeadMagnetNewsletter,
} from "@/lib/leadMagnetSubscribe";
import {
  classifyLeadMagnetRoute,
  hasScrolledPast,
  isCookieDecisionPending,
  isLeadMagnetDismissed,
  isMobileViewport,
  isUserBusy,
  isValidLeadEmail,
  LEAD_MAGNET_DESKTOP_DWELL_MS,
  LEAD_MAGNET_EMAIL_MAX_LEN,
  LEAD_MAGNET_MOBILE_DWELL_MS,
  markLeadMagnetDismissed,
  markLeadMagnetShown,
  wasLeadMagnetShownThisSession,
  type LeadMagnetDismissReason,
  type LeadMagnetShowReason,
  type LeadMagnetSourceGroup,
} from "@/lib/leadMagnetTrigger";

type Step = "offer" | "newsletter" | "subscribed";

/**
 * Lead magnet в две стъпки:
 *   1) директно сваляне на PDF — без имейл, без запис в базата;
 *   2) незадължителен, ясно отделен opt-in за бюлетина (само имейл + незадължен
 *      чекбокс със цел/честота/отказ и връзка към политиката за поверителност).
 *
 * Показва се само на разрешени публични маршрути (home/catalog/template/blog),
 * най-много веднъж на сесия, след минимален престой (12 s desktop exit-intent;
 * 35 s + >50 % скрол на мобилно) и никога върху отворен диалог / активна форма.
 * В аналитиката и в базата пътува единствено грубата група на източника.
 */
export function ExitIntentLeadMagnet() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [magnet, setMagnet] = useState<LeadMagnet | null>(null);
  const [sourceGroup, setSourceGroup] = useState<LeadMagnetSourceGroup | null>(null);
  const [step, setStep] = useState<Step>("offer");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [subscribeError, setSubscribeError] = useState(false);

  const triggered = useRef(false);
  const downloaded = useRef(false);
  const converted = useRef(false);
  const dismissedTracked = useRef(false);
  const mounted = useRef(true);
  /** Начало на непрекъснатия престой върху разрешени маршрути (null = отказан маршрут). */
  const allowedSince = useRef<number | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (triggered.current) return;
    if (isLeadMagnetDismissed() || wasLeadMagnetShownThisSession()) return;

    const group = classifyLeadMagnetRoute(location.pathname);
    if (group === null) {
      allowedSince.current = null;
      return;
    }
    if (allowedSince.current === null) allowedSince.current = Date.now();
    const dwellMs = () => Date.now() - (allowedSince.current ?? Date.now());

    // При смяна на маршрута ефектът се почиства и стартира наново, така че
    // `group`/`pathname` тук винаги отговарят на текущата страница.
    const pathname = location.pathname;
    const tryTrigger = (reason: LeadMagnetShowReason): boolean => {
      if (triggered.current) return false;
      if (isCookieDecisionPending() || isUserBusy(document)) return false;
      const picked = pickLeadMagnetByContext(pathname);
      triggered.current = true;
      setMagnet(picked);
      setSourceGroup(group);
      setStep("offer");
      setOpen(true);
      markLeadMagnetShown();
      trackFunnelEvent("lead_magnet_shown", { reason, magnet: picked.slug, source_group: group });
      return true;
    };

    // Desktop: exit-intent през горния ръб, но само след минимален престой.
    const onMouseLeave = (e: MouseEvent) => {
      if (e.clientY > 0) return;
      if (isMobileViewport(window)) return;
      if (dwellMs() < LEAD_MAGNET_DESKTOP_DWELL_MS) return;
      tryTrigger("exit_intent");
    };
    document.addEventListener("mouseleave", onMouseLeave);

    // Мобилно: няма exit сигнал — престой + дълбочина на скрола.
    let scrollHandler: (() => void) | null = null;
    const detachScroll = () => {
      if (scrollHandler) {
        window.removeEventListener("scroll", scrollHandler);
        scrollHandler = null;
      }
    };
    const remaining = Math.max(0, LEAD_MAGNET_MOBILE_DWELL_MS - dwellMs());
    const mobileTimer = window.setTimeout(() => {
      if (!isMobileViewport(window)) return;
      if (hasScrolledPast(window, document)) {
        tryTrigger("mobile_engaged");
        return;
      }
      scrollHandler = () => {
        if (!hasScrolledPast(window, document)) return;
        if (tryTrigger("mobile_engaged") || triggered.current) detachScroll();
      };
      window.addEventListener("scroll", scrollHandler, { passive: true });
    }, remaining);

    return () => {
      document.removeEventListener("mouseleave", onMouseLeave);
      window.clearTimeout(mobileTimer);
      detachScroll();
    };
  }, [location.pathname]);

  // Фокус върху полето за имейл при втората стъпка (без да вдигаме клавиатурата на мобилно).
  useEffect(() => {
    if (step !== "newsletter") return;
    if (typeof window === "undefined" || isMobileViewport(window)) return;
    const id = window.setTimeout(() => emailRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [step]);

  const trackDismiss = useCallback(
    (reason: LeadMagnetDismissReason) => {
      if (downloaded.current || dismissedTracked.current) return;
      dismissedTracked.current = true;
      trackFunnelEvent("lead_magnet_dismissed", {
        reason,
        magnet: magnet?.slug,
        source_group: sourceGroup ?? undefined,
      });
    },
    [magnet, sourceGroup],
  );

  const close = useCallback(
    (reason: LeadMagnetDismissReason) => {
      trackDismiss(reason);
      if (reason === "dont_show_again") markLeadMagnetDismissed();
      setOpen(false);
    },
    [trackDismiss],
  );

  const onDownload = () => {
    if (!magnet || !sourceGroup) return;
    // Свалянето е нативно (href + download) — не го спираме и не изискваме нищо.
    if (!downloaded.current) {
      downloaded.current = true;
      // PDF-ът е у потребителя — не го питаме отново в следващи сесии.
      markLeadMagnetDismissed();
      trackFunnelEvent("lead_magnet_downloaded", { magnet: magnet.slug, source_group: sourceGroup });
    }
    setStep("newsletter");
  };

  const canSubmit = consent && isValidLeadEmail(email) && !busy;

  const onSubscribe = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!magnet || !sourceGroup || !canSubmit) return;
    setBusy(true);
    setSubscribeError(false);
    const result = await subscribeToLeadMagnetNewsletter({
      email,
      magnetSlug: magnet.slug,
      sourceGroup,
      marketingConsent: consent,
    });
    if (!mounted.current) return;
    setBusy(false);
    if (result === "subscribed") {
      if (!converted.current) {
        converted.current = true;
        trackFunnelEvent("lead_magnet_converted", { magnet: magnet.slug, source_group: sourceGroup });
      }
      setEmail("");
      setStep("subscribed");
      return;
    }
    setSubscribeError(true);
  };

  if (!magnet || !sourceGroup) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close("close");
      }}
    >
      <DialogContent
        className="max-w-lg gap-0 overflow-hidden rounded-2xl border-brand/40 bg-card p-0 shadow-elegant motion-reduce:!animate-none motion-reduce:!duration-0 [&_.dialog-close]:h-11 [&_.dialog-close]:w-11"
        data-testid="lead-magnet-dialog"
      >
        {step === "offer" && (
          <>
            <div
              className="px-5 pb-4 pt-6 sm:px-7 sm:pt-7"
              style={{ background: "linear-gradient(135deg, hsl(var(--brand) / 0.18) 0%, transparent 80%)" }}
            >
              <div className="inline-flex items-center gap-1.5 rounded-full bg-brand/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-brand">
                <BookOpen className="h-3 w-3" aria-hidden="true" /> {magnet.eyebrow}
              </div>
              <DialogTitle className="mt-2 font-serif text-xl font-bold leading-tight sm:text-2xl">
                {magnet.title}
              </DialogTitle>
              <DialogDescription className="mt-1.5 text-sm text-muted-foreground">
                {magnet.subtitle}
              </DialogDescription>
            </div>

            <div className="px-5 pb-5 sm:px-7 sm:pb-6">
              <ul className="mb-4 space-y-1.5 text-[13px] text-foreground">
                {magnet.bullets.map((b) => (
                  <li key={b} className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                    {b}
                  </li>
                ))}
              </ul>

              <a
                href={magnet.fileUrl}
                download
                onClick={onDownload}
                data-testid="lead-magnet-download"
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-brand px-4 py-3 text-[15px] font-semibold text-white shadow-brand transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Изтегли безплатния PDF
              </a>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Директно сваляне — без имейл и без регистрация.
              </p>

              <div className="mt-3 flex items-center justify-between gap-3 text-[12px]">
                <button
                  type="button"
                  onClick={() => close("not_now")}
                  className="min-h-[44px] rounded-lg px-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Не сега
                </button>
                <button
                  type="button"
                  onClick={() => close("dont_show_again")}
                  className="min-h-[44px] rounded-lg px-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Не показвай повече
                </button>
              </div>
            </div>
          </>
        )}

        {step === "newsletter" && (
          <div className="px-5 pb-5 pt-6 sm:px-7 sm:pb-6 sm:pt-7">
            <div className="flex items-start gap-2.5 rounded-xl border border-brand/30 bg-brand/10 px-3 py-2.5 text-[13px]">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
              <p>
                PDF-ът се изтегля. Ако не започне автоматично —{" "}
                <a href={magnet.fileUrl} download className="font-semibold text-brand underline-offset-2 hover:underline">
                  изтегли отново
                </a>
                .
              </p>
            </div>

            <DialogTitle className="mt-5 font-serif text-lg font-bold leading-tight sm:text-xl">
              Искаш ли кратки практични съвети по имейл?
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm text-muted-foreground">
              Незадължително. Свалянето не зависи от това — можеш просто да затвориш прозореца.
            </DialogDescription>

            <form onSubmit={onSubscribe} className="mt-4 space-y-3" noValidate>
              <div>
                <label htmlFor="lm-email" className="mb-1 block text-xs font-semibold text-foreground">
                  Имейл
                </label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <input
                    id="lm-email"
                    ref={emailRef}
                    type="email"
                    name="email"
                    inputMode="email"
                    autoComplete="email"
                    maxLength={LEAD_MAGNET_EMAIL_MAX_LEN}
                    placeholder="имейл@пример.bg"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="min-h-[44px] w-full rounded-lg border border-border/60 bg-background/60 py-2.5 pl-9 pr-3 text-sm focus:border-brand/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>

              <div className="flex min-h-[44px] items-start gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5">
                <Checkbox
                  id="lm-consent"
                  checked={consent}
                  onCheckedChange={(v) => setConsent(v === true)}
                  aria-describedby="lm-consent-privacy"
                  className="mt-0.5 h-5 w-5"
                />
                <label htmlFor="lm-consent" className="cursor-pointer text-[12px] leading-relaxed text-foreground">
                  {LEAD_MAGNET_CONSENT_COPY.label}
                </label>
              </div>
              <p id="lm-consent-privacy" className="text-[11px] leading-relaxed text-muted-foreground">
                Обработваме имейла ти само за бюлетина, на основание твоето съгласие. Подробности —{" "}
                <a
                  href={LEAD_MAGNET_CONSENT_COPY.privacyHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-brand underline-offset-2 hover:underline"
                >
                  {LEAD_MAGNET_CONSENT_COPY.privacyLinkText}
                </a>
                .
              </p>

              {subscribeError && (
                <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                  Не успяхме да запишем абонамента. Провери имейла и опитай отново след малко.
                </p>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-border/60 px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Не, благодаря
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-gradient-brand px-5 text-sm font-semibold text-white shadow-brand transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 motion-reduce:transition-none"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
                  Абонирай ме
                </button>
              </div>
            </form>
          </div>
        )}

        {step === "subscribed" && (
          <div className="px-5 pb-6 pt-8 text-center sm:px-7">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand/15 text-brand">
              <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
            </div>
            <DialogTitle className="mt-3 font-serif text-lg font-bold">Записахме те. Благодарим!</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-muted-foreground">
              Ще получаваш най-много два имейла месечно. Отписване — с един клик от всеки имейл.
            </DialogDescription>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-border/60 px-5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Готово
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
