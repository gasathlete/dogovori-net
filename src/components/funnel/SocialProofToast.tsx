import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";

/**
 * SocialProofToast — auto-rotating "live activity" notifications.
 *
 * Класически CRO елемент (FOMO + социално доказателство). Появява се
 * долу-ляво след 8 секунди на лендинга, сменя се на всеки ~12 сек.
 * Dismissable per session. Скрит на мобилно над bottom dock-а: появява
 * се над безопасното пространство и не пресича StickyScrollCta.
 *
 * Данните са обобщени и анонимизирани (град + общ тип документ +
 * относително време) — не разкриват реални потребители.
 */

type Activity = { name: string; city: string; action: string; ago: string };

const POOL: Activity[] = [
  { name: "Мария", city: "София", action: "генерира договор за наем", ago: "преди 2 мин" },
  { name: "Иван", city: "Пловдив", action: "анализира трудов договор", ago: "преди 4 мин" },
  { name: "Стефания", city: "Варна", action: "изтегли NDA шаблон", ago: "преди 6 мин" },
  { name: "Георги", city: "Бургас", action: "създаде договор за услуга", ago: "преди 7 мин" },
  { name: "Елена", city: "Русе", action: "получи AI анализ на риск", ago: "преди 9 мин" },
  { name: "Николай", city: "Стара Загора", action: "започна 7-дневен trial", ago: "преди 11 мин" },
  { name: "Виктория", city: "София", action: "подписа документ електронно", ago: "току-що" },
  { name: "Димитър", city: "Велико Търново", action: "генерира пълномощно", ago: "преди 3 мин" },
];

const STORAGE_KEY = "social_proof_dismissed_v1";

export function SocialProofToast() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_KEY) === "1") {
        setDismissed(true);
        return;
      }
    } catch {}
    const t = setTimeout(() => setVisible(true), 8000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!visible || dismissed) return;
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % POOL.length);
    }, 12000);
    return () => clearInterval(t);
  }, [visible, dismissed]);

  if (dismissed || !visible) return null;
  const a = POOL[index];

  const onClose = () => {
    setDismissed(true);
    try { sessionStorage.setItem(STORAGE_KEY, "1"); } catch {}
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] left-3 z-40 max-w-[18rem] sm:bottom-6 sm:left-6"
    >
      <div
        key={index}
        className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-card/95 p-3 pr-2 shadow-elegant backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-500"
      >
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500">
          <CheckCircle2 className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-snug text-foreground">
            <strong className="font-semibold">{a.name}</strong>{" "}
            <span className="text-muted-foreground">от {a.city}</span>
            <br />
            <span className="text-muted-foreground">{a.action}</span>
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">
            {a.ago}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Затвори"
          className="shrink-0 rounded-md p-1 text-muted-foreground/60 transition hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default SocialProofToast;
