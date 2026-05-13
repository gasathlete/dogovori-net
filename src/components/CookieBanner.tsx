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
      className="fixed bottom-3 left-3 z-50 max-w-sm rounded-lg border border-gold/20 bg-navy/90 p-3 shadow-lg backdrop-blur-md"
    >
      <div className="flex items-center gap-2">
        <Cookie className="h-4 w-4 shrink-0 text-gold" />
        <p className="text-xs text-foreground">
          Използваме бисквитки. <Link to="/cookies" className="text-gold underline-offset-2 hover:underline">Повече</Link>
        </p>
        <button
          aria-label="Затвори"
          onClick={decline}
          className="ml-1 rounded p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={accept} className="h-7 bg-gradient-gold px-2 text-xs text-navy">
          Приемам
        </Button>
        <Button size="sm" variant="outline" onClick={decline} className="h-7 px-2 text-xs">
          Само необходимите
        </Button>
      </div>
    </div>
  );
}
