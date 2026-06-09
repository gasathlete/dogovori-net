import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cookie, X, Settings2 } from "lucide-react";
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
      className="fixed inset-x-3 bottom-3 z-[45] rounded-lg border border-gold/20 bg-navy/95 p-4 shadow-lg backdrop-blur-md sm:left-3 sm:right-auto sm:max-w-md"
      style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      {!showSettings ? (
        <>
          <div className="flex items-start gap-2">
            <Cookie className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <div className="flex-1">
              <p className="text-xs leading-relaxed text-foreground">
                Използваме бисквитки. Необходимите винаги са активни. За аналитика и маркетинг
                ни е нужно Вашето съгласие.{" "}
                <Link to="/cookies" className="text-gold underline-offset-2 hover:underline">
                  Научи повече
                </Link>
              </p>
            </div>
            <button
              aria-label="Затвори"
              onClick={onlyNecessary}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button size="sm" onClick={acceptAll} className="h-9 flex-1 bg-gradient-gold px-3 text-xs text-navy">
              Приемам всички
            </Button>
            <Button size="sm" variant="outline" onClick={onlyNecessary} className="h-9 flex-1 px-3 text-xs">
              Само необходими
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowSettings(true)}
              className="h-9 flex-1 px-3 text-xs"
            >
              <Settings2 className="mr-1 h-3.5 w-3.5" />
              Настройки
            </Button>
          </div>
        </>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
