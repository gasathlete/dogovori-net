/**
 * Кратко сравнение по честота на работа — един документ, редовна работа, екип.
 *
 * Всички числа идват от каноничните източници (`@/lib/products` и
 * `@/lib/pricing`). Няма измислени проценти, икономии, брояч и натиск.
 * Използва се и на /produkti, и на /plans, за да е едно и също твърдение.
 */
import { Link } from "react-router-dom";
import { ArrowRight } from "@/icons";
import {
  PRICING_PLANS,
  monthlyLabel,
  opsLabel,
  teamSummary,
} from "@/lib/pricing";
import { lowestOneTimePriceLabel } from "@/lib/products";
import { cn } from "@/lib/utils";

export const FREQUENCY_COMPARE_HEADING = "Кое подхожда на Вашата работа";

interface Row {
  readonly key: string;
  readonly frequency: string;
  readonly price: string;
  readonly included: string;
  readonly href: string;
  readonly linkLabel: string;
}

function rows(): readonly Row[] {
  return [
    {
      key: "one_document",
      frequency: "Един документ",
      price: `от ${lowestOneTimePriceLabel()} еднократно`,
      included: "Плащате само избрания резултат за този документ.",
      href: "/produkti",
      linkLabel: "Вижте продуктите",
    },
    {
      key: "regular",
      frequency: "Няколко документа месечно",
      price: monthlyLabel("professional"),
      included: `${PRICING_PLANS.professional.name} — ${opsLabel(
        "professional",
      )} на месец, история и версии на едно място.`,
      href: "/plans",
      linkLabel: "Сравнете плановете",
    },
    {
      key: "team",
      frequency: "Постоянна работа в екип",
      price: teamSummary(),
      included: "Роли и обща история за фирмата.",
      href: "/plans",
      linkLabel: "Вижте Екип",
    },
  ];
}

export function FrequencyCompare({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="frequency-compare-heading"
      data-testid="frequency-compare"
      className={cn("mx-auto max-w-4xl", className)}
    >
      <h2
        id="frequency-compare-heading"
        className="text-center font-serif text-[20px] font-bold tracking-tight sm:text-[22px]"
      >
        {FREQUENCY_COMPARE_HEADING}
      </h2>
      <ul role="list" className="mt-4 grid gap-3 sm:grid-cols-3">
        {rows().map((row) => (
          <li
            key={row.key}
            data-testid={`frequency-row-${row.key}`}
            className="flex flex-col rounded-xl border border-border/70 bg-card/50 p-4"
          >
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {row.frequency}
            </span>
            <span className="mt-1.5 font-serif text-[17px] font-bold leading-snug tabular-nums text-gold">
              {row.price}
            </span>
            <span className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
              {row.included}
            </span>
            <Link
              to={row.href}
              className="mt-auto inline-flex min-h-[44px] items-center gap-1.5 pt-2 text-[13px] font-semibold text-foreground/90 hover:text-gold"
            >
              {row.linkLabel}
              <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-center text-[12.5px] text-muted-foreground">
        Еднократният продукт е за един документ. Планът има смисъл, когато
        документите са редовна работа.
      </p>
    </section>
  );
}
