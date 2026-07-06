import { useEffect, useRef, useState } from "react";
import { CheckCircle2, X } from "lucide-react";

/**
 * SocialProofToast — auto-rotating "live activity" notifications.
 *
 * Показва маскиран имейл + скорошно действие. Първо появяване след 60s,
 * след което ротацията минава по фиксирана последователност от интервали
 * [60, 90, 50, 30, 60, 20] секунди и се завърта в кръг. Round-robin върху
 * POOL. Dismissable per session.
 *
 * Данните са изцяло измислени/анонимизирани — не разкриват реални
 * потребители. Форматът наподобява истинска активност:
 *   „потребител Kal********@gmail.com
 *    изтегли Договор за наем"
 */

type Activity = { email: string; action: string };

const INTERVALS_SEC = [60, 90, 50, 30, 60, 20];

const EMAILS = [
  "Kal********@gmail.com",
  "iva********@abv.bg",
  "geo********@mail.bg",
  "Mar********@gmail.com",
  "sto********@abv.bg",
  "Nik********@yahoo.com",
  "vic********@gmail.com",
  "Ele********@outlook.com",
  "dim********@abv.bg",
  "pet********@gmail.com",
  "ste********@mail.bg",
  "ale********@gmail.com",
  "yan********@abv.bg",
  "Bor********@yahoo.com",
];

const ACTIONS = [
  "изтегли Договор за наем",
  "генерира NDA",
  "анализира Трудов договор",
  "изтегли Граждански договор",
  "генерира Договор за услуга",
  "подписа електронно Пълномощно",
  "изтегли Договор за заем",
  "анализира Договор за наем",
  "започна 7-дневен trial",
  "генерира Пълномощно",
  "изтегли Предварителен договор",
  "подписа Анекс към договор",
  "анализира NDA",
  "генерира Трудов договор",
];

const POOL: Activity[] = EMAILS.map((email, i) => ({
  email,
  action: ACTIONS[i % ACTIONS.length],
}));

const STORAGE_KEY = "social_proof_dismissed_v1";
const LEAD_MAGNET_KEY = "lead_magnet_shown_v1";

export function SocialProofToast() {
  const [poolIdx, setPoolIdx] = useState(0);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const stepRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_KEY) === "1") {
        setDismissed(true);
        return;
      }
      // Ако lead magnet-ът вече е показан в тази сесия — не струпваме UI.
      if (sessionStorage.getItem(LEAD_MAGNET_KEY) === "1") {
        setDismissed(true);
        return;
      }
    } catch {}

    const schedule = () => {
      const seconds = INTERVALS_SEC[stepRef.current % INTERVALS_SEC.length];
      timerRef.current = window.setTimeout(() => {
        setVisible(true);
        setPoolIdx((i) => (i + 1) % POOL.length);
        stepRef.current += 1;
        schedule();
      }, seconds * 1000);
    };

    schedule();
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  if (dismissed || !visible) return null;
  const a = POOL[poolIdx];

  const onClose = () => {
    setDismissed(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {}
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] left-3 z-40 max-w-[19rem] sm:bottom-6 sm:left-6"
    >
      <div
        key={poolIdx}
        className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-card/95 p-3 pr-2 shadow-elegant backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-500"
      >
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500">
          <CheckCircle2 className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-snug text-foreground">
            <span className="text-muted-foreground">потребител </span>
            <strong className="font-semibold break-all">{a.email}</strong>
            <br />
            <span className="text-muted-foreground">{a.action}</span>
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
