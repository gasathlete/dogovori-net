import { Link } from "react-router-dom";
import { Coins, ArrowRight } from "@/icons";

/**
 * Дискретен продуктов микро-индикатор в хедъра на формулярите (/wizard/*, /build).
 *
 * Цел: потребителят да знае каква е „цената“ на резултата още преди да стигне
 * до гейта, и да има ненатрапчив път до /plans, без да губи сесията си във
 * формуляра (линкът се отваря в нов таб).
 */
export function OpsHintBar({ isPro }: { isPro?: boolean }) {
  return (
    <div className="border-b border-border/40 bg-card/20">
      <div className="container flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Coins className="h-3.5 w-3.5 text-gold/80" aria-hidden />
          {isPro ? (
            <>Активен абонамент · 1 операция = 1 сваляне / анализ / AI съобщение</>
          ) : (
            <>Включено в безплатния опит · 1 операция = 1 сваляне / анализ</>
          )}
        </span>
        <Link
          to="/plans"
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1 font-medium text-gold underline-offset-2 hover:underline"
        >
          Виж плановете <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
