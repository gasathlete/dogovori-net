import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { X } from "@/icons";
import { useAuth } from "@/hooks/useAuth";
import { useKeyboardOpen } from "@/hooks/useKeyboardOpen";
import { getCookiePrefs } from "@/lib/analytics";
import { trackMetric } from "@/lib/metrics";
import { REGISTRATION_DISMISS_KEY, shouldShowRegistrationInvitation } from "@/lib/registrationFunnel";
import { RegistrationCTA } from "./RegistrationCTA";
import { Button } from "@/components/ui/button";

const inView = (el: Element) => {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom > 80 && rect.top < window.innerHeight && getComputedStyle(el).visibility !== "hidden";
};

/** One home-only invitation, never over a form, cookie decision or another overlay. */
export function StickyScrollCta() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const keyboardOpen = useKeyboardOpen();
  const [shown, setShown] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(REGISTRATION_DISMISS_KEY) === "1"; } catch { return false; }
  });
  useEffect(() => {
    let raf = 0;
    let engaged = false;
    const started = Date.now();
    const update = () => {
      const hero = document.getElementById("hero-registration-cta");
      const focused = document.activeElement;
      const busy = keyboardOpen || document.hidden || getCookiePrefs() === null ||
        Boolean(focused?.closest("input, textarea, select, [contenteditable=true], form")) ||
        [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], [role="menu"], [aria-label="Мобилна навигация"], [aria-label="Бисквитки — управление по категории"]')].some(inView);
      const competingAction = [...document.querySelectorAll('[data-registration-cta="header"], [data-registration-cta="hero"], [data-registration-cta="plans_section"], #footer-registration, #cta-band, form')].some(inView);
      setShown(shouldShowRegistrationInvitation({ anonymous: !user, ready: !loading, home: pathname === "/", dismissed,
        engaged: engaged && Date.now() - started >= 8000,
        heroPassed: Boolean(hero && hero.getBoundingClientRect().bottom < 80), competingAction, busy }));
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); };
    const onScroll = () => { if (window.scrollY > 160) engaged = true; schedule(); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-state", "aria-hidden"] });
    const interval = window.setInterval(update, 1000);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("dogovori:cookie-preferences-changed", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    document.addEventListener("visibilitychange", schedule);
    update();
    return () => {
      observer.disconnect(); clearInterval(interval); if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", schedule);
      window.removeEventListener("dogovori:cookie-preferences-changed", schedule);
      document.removeEventListener("focusin", schedule); document.removeEventListener("focusout", schedule);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [user, loading, pathname, dismissed, keyboardOpen]);
  if (!shown) return null;
  return <aside aria-label="Безплатен профил" className="fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom,0px)+72px)] z-40 mx-auto flex max-w-md items-center gap-2 rounded border border-border bg-background p-2 shadow-lg lg:bottom-4">
    <RegistrationCTA source="sticky" className="btn-gold min-h-11 flex-1 px-3 text-sm" />
    <Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label="Скрий поканата за регистрация" onClick={() => {
      try { sessionStorage.setItem(REGISTRATION_DISMISS_KEY, "1"); } catch { /* this mount still respects dismissal */ }
      setDismissed(true); trackMetric("registration_invitation_dismissed", { source: "sticky" });
    }}><X className="size-4" /></Button>
  </aside>;
}
