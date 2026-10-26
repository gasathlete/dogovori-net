/**
 * „Само за една задача?“ — компактна, подчинена алтернатива на плановете.
 * Води към трите канонични продуктови страници. Без натиск и без обещания.
 */
import { Link } from "react-router-dom";
import {
  ONE_TIME_PRODUCTS,
  ONE_TIME_TERMS,
  productPath,
  productPriceLabel,
} from "@/lib/products";
import { cn } from "@/lib/utils";

export const ONE_TASK_HEADING = "Само за една задача?";

export function OneTaskAlternative({ className }: { className?: string }) {
  return (
    <aside
      aria-label="Еднократни продукти за една задача"
      className={cn(
        "rounded-2xl border border-hairline bg-card/40 px-4 py-3.5 sm:px-5",
        className,
      )}
    >
      <p className="text-[13px] font-semibold text-foreground">{ONE_TASK_HEADING}</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
        Плащате само за конкретния резултат, без абонамент.
      </p>
      <ul className="mt-2.5 flex flex-col gap-1.5">
        {ONE_TIME_PRODUCTS.map((p) => (
          <li key={p.id}>
            <Link
              to={productPath(p)}
              className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-[13px] font-medium text-foreground/90 hover:bg-muted/50 hover:text-gold"
            >
              <span className="min-w-0 truncate">{p.name}</span>
              <span className="shrink-0 tabular-nums font-bold text-success">
                {productPriceLabel(p.id)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11.5px] text-muted-foreground">{ONE_TIME_TERMS}</p>
    </aside>
  );
}
