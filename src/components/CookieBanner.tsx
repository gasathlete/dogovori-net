import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cookie, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { getCookiePrefs, setCookiePrefs, initAnalytics } from "@/lib/analytics";
import { recordConsents } from "@/lib/consents";

export function CookieBanner() {
  const [open, setOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const p = getCookiePrefs();
    if (p === null) {
      setOpen(true);
    } else if (p.analytics) {
      initAnalytics();
    }
  }, []);

  if (!open) return null;

  const persist = (a: boolean, m: boolean) => {
    setCookiePrefs({ analytics: a, marketing: m });
    setOpen(false);
    // Record consent if user is logged in (no-op otherwise)
    recordConsents([
      { consent_type: "cookies", granted: true, metadata: { analytics: a, marketing: m } },
    ]).catch(() => undefined);
  };

  const acceptAll = () => persist(true, true);
  const onlyNecessary = () => persist(false, false);
  const saveCustom = () => persist(analytics, marketing);

  return (
    <div
      role="dialog"
      aria-label="Бисквитки — управление по категории"
      className="fixed inset-x-0 bottom-0 z-[45] border-t border-gold/20 bg-navy/95 shadow-lg backdrop-blur-md sm:inset-x-3 sm:bottom-3 sm:rounded-lg sm:border"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {!showSettings ? (
        <div className="mx-auto max-w-5xl px-4 py-3">
          <div className="flex items-start gap-2 sm:items-center">
            <Cookie className="mt-0.5 h-4 w-4 shrink-0 text-gold sm:mt-0" />
            <p className="min-w-0 flex-1 text-[12px] leading-snug text-foreground">
              Използваме бисквитки. За аналитика и маркетинг ни е нужно Вашето съгласие.{" "}
              <Link to="/cookies" className="inline-block py-1 text-gold underline underline-offset-2">
                Научи повече
              </Link>
            </p>
          </div>
          <div className="mt-2.5 flex items-center gap-2 sm:mt-0 sm:justify-end">
            <button
              onClick={() => setShowSettings(true)}
              className="min-h-10 rounded-md px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Настройки
            </button>
            <button
              onClick={onlyNecessary}
              className="min-h-10 rounded-md border border-border/50 px-3 text-[12px] font-medium text-foreground/80 transition-colors hover:bg-muted/40"
            >
              Само необходими
            </button>
            <Button
              size="sm"
              onClick={acceptAll}
              className="h-10 flex-1 bg-gradient-gold px-3 text-[13px] font-semibold text-navy sm:flex-none"
            >
              Приемам всички
            </Button>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-md p-4">

          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-serif text-sm font-bold">Настройки за бисквитки</h3>
            <button
              aria-label="Затвори настройки"
              onClick={() => setShowSettings(false)}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-3">
            <div className="rounded-md border border-border/60 bg-card/40 p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Строго необходими</Label>
                <Switch checked disabled />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                За вход, сесия и сигурност. Винаги активни.
              </p>
            </div>

            <div className="rounded-md border border-border/60 bg-card/40 p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="cookie-analytics" className="cursor-pointer text-xs font-semibold">
                  Аналитични
                </Label>
                <Switch
                  id="cookie-analytics"
                  checked={analytics}
                  onCheckedChange={setAnalytics}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Plausible (без бисквитки, анонимизирано) — помага да подобрим сайта.
              </p>
            </div>

            <div className="rounded-md border border-border/60 bg-card/40 p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="cookie-marketing" className="cursor-pointer text-xs font-semibold">
                  Маркетинг
                </Label>
                <Switch
                  id="cookie-marketing"
                  checked={marketing}
                  onCheckedChange={setMarketing}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Резервирано за бъдеще — засега не зареждаме маркетингови бисквитки.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button size="sm" onClick={saveCustom} className="h-9 flex-1 bg-gradient-gold px-3 text-xs text-navy">
              Запази избора
            </Button>
            <Button size="sm" variant="outline" onClick={acceptAll} className="h-9 flex-1 px-3 text-xs">
              Приеми всички
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
