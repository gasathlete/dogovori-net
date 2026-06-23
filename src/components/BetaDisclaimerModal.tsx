import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sparkles, Handshake, Lock, Gift, MessageSquareQuote, Tag } from "lucide-react";

/**
 * BetaDisclaimerModal — shown once on the very first visit to announce the
 * beta period (until the official launch on 2026-09-01) and the perks early
 * users get. Closing it sets a versioned localStorage flag so it never pops
 * up again unless we bump the version key.
 */
const STORAGE_KEY = "dogovori_beta_ack_v1";
const LAUNCH_DATE = "01.09.2026 г.";

function hasAcknowledged(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return true; // Fail-closed: don't pester users when storage is unavailable.
  }
}

function markAcknowledged() {
  try {
    window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
  } catch {
    // ignore
  }
}

export function BetaDisclaimerModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (hasAcknowledged()) return;
    // Small delay so the cookie banner appears first and we don't stack two
    // modal-like surfaces in the same paint frame.
    const t = window.setTimeout(() => setOpen(true), 600);
    return () => window.clearTimeout(t);
  }, []);

  const close = () => {
    markAcknowledged();
    setOpen(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) close();
    else setOpen(true);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto border-gold/30 bg-card">
        <DialogHeader>
          <div className="mx-auto mb-2 inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-gold">
            <Sparkles className="h-3.5 w-3.5" /> Beta
          </div>
          <DialogTitle className="text-center font-serif text-2xl">
            Сайтът е в БЕТА
          </DialogTitle>
          <DialogDescription className="text-center">
            Официално пускане: <span className="font-semibold text-gold">{LAUNCH_DATE}</span>
          </DialogDescription>
        </DialogHeader>

        <p className="mt-2 text-center text-sm text-muted-foreground">
          Изграждаме dogovori.net заедно с първите ни потребители. До официалното пускане
          работим в бета режим — функциите се развиват ежедневно, а ранните потребители
          получават специални условия.
        </p>

        <ul className="mt-4 space-y-3 text-sm">
          <li className="flex items-start gap-3">
            <Tag className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <span>
              <span className="font-semibold text-foreground">По-ниски цени</span>{" "}
              <span className="text-muted-foreground">
                — текущите тарифи са с до 30% под официалните; цената се фиксира за първите 12 месеца.
              </span>
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Handshake className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <span>
              <span className="font-semibold text-foreground">Партньорство</span>{" "}
              <span className="text-muted-foreground">
                — възможност за включване в партньорската мрежа (лого, препоръки, реферал бонуси).
              </span>
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <span>
              <span className="font-semibold text-foreground">Достъп до сложни функции</span>{" "}
              <span className="text-muted-foreground">
                — AI асистент, Risk Analysis, е-Подпис и Комплекти — всички безплатни операции след регистрация.
              </span>
            </span>
          </li>
          <li className="flex items-start gap-3">
            <Gift className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <span>
              <span className="font-semibold text-foreground">10 безплатни операции</span>{" "}
              <span className="text-muted-foreground">при регистрация — без карта.</span>
            </span>
          </li>
          <li className="flex items-start gap-3">
            <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <span>
              <span className="font-semibold text-foreground">Пряка обратна връзка</span>{" "}
              <span className="text-muted-foreground">
                — заявките ви влизат директно в roadmap-а.
              </span>
            </span>
          </li>
        </ul>

        <div className="mt-5 flex flex-col gap-2">
          <Link
            to="/auth?tab=signup"
            onClick={close}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-gradient-to-b from-gold to-gold/80 px-4 py-2.5 text-sm font-semibold text-navy shadow-[0_4px_14px_-4px_hsl(var(--gold)/0.55)] transition-all hover:brightness-110"
          >
            <Sparkles className="h-4 w-4" /> Регистрирай се безплатно
          </Link>
          <Link
            to="/#partners"
            onClick={close}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-gold/40 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-gold/10"
          >
            <Handshake className="h-4 w-4" /> Стани партньор
          </Link>
          <button
            onClick={close}
            className="mt-1 text-center text-xs text-muted-foreground transition-colors hover:text-gold"
          >
            Разгледай първо
          </button>
        </div>

        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Условията за партньорство и промо-цени важат до {LAUNCH_DATE}
        </p>
      </DialogContent>
    </Dialog>
  );
}
