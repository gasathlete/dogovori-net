import { cn } from "@/lib/utils";
import { HEADER_WORDMARK_PATHS, HEADER_WORDMARK_VIEWBOX } from "@/lib/headerWordmark";

/**
 * Калиграфският надпис „Договори.нет“ в хедъра. Векторни контури (без уеб шрифт),
 * затова няма прескачане при зареждане и кирилицата винаги е налична.
 * Пропорция ≈ 4.95 : 1 — размерите са фиксирани, за да не се мести менюто.
 */
export function HeaderWordmark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={HEADER_WORDMARK_VIEWBOX}
      role="img"
      aria-label="Договори.нет"
      data-testid="header-wordmark"
      className={cn("block h-10 w-[198px] shrink-0 text-foreground sm:h-11 sm:w-[218px]", className)}
    >
      {HEADER_WORDMARK_PATHS.map((d, i) => (
        <path key={i} d={d} fill="currentColor" />
      ))}
    </svg>
  );
}
