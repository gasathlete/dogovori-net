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
      className="fixed inset-x-3 bottom-3 z-50 rounded-lg border border-gold/20 bg-navy/95 p-3 shadow-lg backdrop-blur-md sm:left-3 sm:right-auto sm:max-w-sm"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-center gap-2">
        <Cookie className="h-4 w-4 shrink-0 text-gold" />
        <p className="flex-1 text-xs text-foreground">
          Използваме бисквитки. <Link to="/cookies" className="text-gold underline-offset-2 hover:underline">Повече</Link>
        </p>
        <button
          aria-label="Затвори"
          onClick={decline}
          className="rounded p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={accept} className="h-8 flex-1 bg-gradient-gold px-3 text-xs text-navy sm:flex-none">
          Приемам
        </Button>
        <Button size="sm" variant="outline" onClick={decline} className="h-8 flex-1 px-3 text-xs sm:flex-none">
          Само необходимите
        </Button>
      </div>
    </div>
  );
}
