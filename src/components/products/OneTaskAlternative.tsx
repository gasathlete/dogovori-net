/**
 * „Само за една задача?“ — компактна, подчинена алтернатива на плановете.
 * Води към трите канонични продуктови страници. Без натиск и без обещания.
 */
import { Link } from "react-router-dom";
import {
  ONE_TIME_PRODUCTS,
  ONE_TIME_TERMS,
  productPath,
} from "@/lib/products";
import { ProductPrice } from "./ProductPrice";
import { ArrowRight } from "@/icons";
import { cn } from "@/lib/utils";

export const ONE_TASK_HEADING = "Само за една задача?";

export function OneTaskAlternative({ className }: { className?: string }) {
  return (
    <aside
      aria-label="Еднократни продукти за една задача"
      className={cn(
        "py-2",
        className,
      )}
    >
      <p className="text-[13px] font-semibold text-foreground">{ONE_TASK_HEADING}</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
        Плащате само за конкретния резултат, без абонамент.
      </p>
      <ul className="mt-4 grid gap-0 divide-y divide-border">
        {ONE_TIME_PRODUCTS.map((p) => (
          <li key={p.id}>
            <Link
              to={productPath(p)}
              className="grid min-h-11 gap-4 py-4 text-sm text-foreground transition-colors hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[1fr_auto]"
            >
              <span className="min-w-0">
                <span className="block font-semibold">{p.name}</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{p.shortOutcome}</span>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-gold">Вижте продукта <ArrowRight className="size-3.5" /></span>
              </span>
              <ProductPrice id={p.id} size="sm" />
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11.5px] text-muted-foreground">{ONE_TIME_TERMS}</p>
    </aside>
  );
}
