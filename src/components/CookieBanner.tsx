import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cookie, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getConsent, setConsent, initAnalytics } from "@/lib/analytics";

export function CookieBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (getConsent() === null) setOpen(true);
    else if (getConsent() === "granted") initAnalytics();
  }, []);

  if (!open) return null;

  const accept = () => { setConsent("granted"); setOpen(false); };
  const decline = () => { setConsent("denied"); setOpen(false); };

  return (
    <div
      role="dialog"
      aria-label="Бисквитки"
      className="fixed bottom-3 left-3 right-3 z-50 mx-auto max-w-2xl rounded-xl border border-gold/30 bg-navy/95 p-4 shadow-gold backdrop-blur-xl sm:p-5"
    >
      <div className="flex items-start gap-3">
        <Cookie className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
        <div className="flex-1 text-sm">
          <p className="text-foreground">
            Използваме само технически бисквитки, нужни за работата на сайта. С Ваше съгласие можем
            да добавим и анонимизирана статистика, която ни помага да подобряваме услугата.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Подробности в <Link to="/cookies" className="text-gold underline-offset-4 hover:underline">Политика за бисквитките</Link>.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={accept} className="bg-gradient-gold text-navy">
              Приемам
            </Button>
            <Button size="sm" variant="outline" onClick={decline}>
              Само необходимите
            </Button>
          </div>
        </div>
        <button
          aria-label="Затвори"
          onClick={decline}
          className="rounded-md p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
