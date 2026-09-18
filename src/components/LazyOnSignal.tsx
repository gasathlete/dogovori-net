/**
 * Монтира съдържание само след реален сигнал от посетителя.
 *
 * Плаващите помощници (търсачката с клавишна комбинация, изскачащите покани,
 * анимацията след завършено действие) досега се зареждаха при всяко отваряне на
 * сайта, макар повечето посетители никога да не ги задействат. Тук изчакваме
 * конкретно събитие — клавиш, движение на мишката извън страницата, скрол или
 * изтекло време — и едва тогава зареждаме съответния код.
 */
import { ReactNode, useEffect, useRef, useState } from "react";

type Props = {
  children: ReactNode;
  /** Събития върху window, които монтират съдържанието. */
  events?: string[];
  /** Монтиране при първи натиснат клавиш с Ctrl/Cmd и този символ. */
  commandKey?: string;
  /** Монтиране при извеждане на курсора извън страницата (exit intent). */
  onMouseLeave?: boolean;
  /** Монтиране след първия скрол. */
  onScroll?: boolean;
  /** Най-късно монтиране след толкова милисекунди (0 = без). */
  delayMs?: number;
};

export function LazyOnSignal({
  children,
  events,
  commandKey,
  onMouseLeave,
  onScroll,
  delayMs = 0,
}: Props) {
  const [mounted, setMounted] = useState(false);
  // Сигналът, който е монтирал съдържанието, се препредава след монтирането,
  // защото децата закачат своите слушатели едва след зареждане на кода си.
  const pendingRef = useRef<{ type: string; detail: unknown } | null>(null);

  useEffect(() => {
    if (mounted) return;
    const cleanups: (() => void)[] = [];
    const arm = () => setMounted(true);

    for (const name of events ?? []) {
      const onEvent = (e: Event) => {
        pendingRef.current = { type: e.type, detail: (e as CustomEvent).detail };
        arm();
      };
      window.addEventListener(name, onEvent as EventListener);
      cleanups.push(() => window.removeEventListener(name, onEvent as EventListener));
    }

    if (commandKey) {
      const onKey = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === commandKey.toLowerCase()) {
          e.preventDefault();
          arm();
          // Препредаваме сигнала, за да се отвори веднага след монтирането.
          window.setTimeout(() => window.dispatchEvent(new CustomEvent("dogovori:open-command")), 0);
        }
      };
      window.addEventListener("keydown", onKey);
      cleanups.push(() => window.removeEventListener("keydown", onKey));
    }

    if (onMouseLeave) {
      document.addEventListener("mouseleave", arm);
      cleanups.push(() => document.removeEventListener("mouseleave", arm));
    }

    if (onScroll) {
      window.addEventListener("scroll", arm, { passive: true, once: true });
      cleanups.push(() => window.removeEventListener("scroll", arm));
    }

    if (delayMs > 0) {
      const t = window.setTimeout(arm, delayMs);
      cleanups.push(() => window.clearTimeout(t));
    }

    return () => cleanups.forEach((fn) => fn());
  }, [mounted, events, commandKey, onMouseLeave, onScroll, delayMs]);

  return mounted ? <>{children}</> : null;
}

export default LazyOnSignal;
