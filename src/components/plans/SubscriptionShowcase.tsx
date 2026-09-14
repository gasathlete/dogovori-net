/**
 * SubscriptionShowcase — витрина на абонаментите за сегмент „Фирма“.
 *
 * Показва само каноничните планове и цени от `@/lib/pricing`. Без обещания,
 * без изчислена икономия и без изкуствен натиск.
 */
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowRight, Briefcase, Users, Sparkles } from "@/icons";
import type { LucideIcon } from "@/icons";
import {
  PRICING_PLANS,
  fmtEur,
  monthlyLabel,
  opsLabel,
  teamMinYearlyTotal,
  yearlyLabel,
  yearlyPerMonthLabel,
  type PricingPlanId,
} from "@/lib/pricing";
import { cn } from "@/lib/utils";
import subscriptionStillLife from "@/assets/subscription-still-life.jpg";

const PLAN_ICON: Record<"professional" | "entrepreneur" | "team", LucideIcon> = {
  professional: Sparkles,
  entrepreneur: Briefcase,
  team: Users,
};

const PLAN_EXCERPT: Record<"professional" | "entrepreneur" | "team", string> = {
  professional: "За фирма с редовна, но обозрима документална работа.",
  entrepreneur: "За фирма, която движи договори всяка седмица.",
  team: "За няколко колеги, които работят по общи документи.",
};

const PLAN_INCLUDES: Record<"professional" | "entrepreneur" | "team", string> = {
  professional: "Изготвяне, проверка, поправки и сваляне на документи в един профил.",
  entrepreneur: "По-голям месечен обем и същите функции без ограничение по вид документ.",
  team: "Отделен профил за всеки колега и общ достъп до документите на фирмата.",
};

function PlanCard({ id, featured = false }: { id: "professional" | "entrepreneur" | "team"; featured?: boolean }) {
  const plan = PRICING_PLANS[id];
  const Icon = PLAN_ICON[id];

  const priceLine = id === "team" ? yearlyLabel("team") : monthlyLabel(id);
  const secondLine =
    id === "team"
      ? `мин. ${plan.seatMin} места = ${fmtEur(teamMinYearlyTotal())}/год`
      : `${yearlyLabel(id)} при годишно плащане · ${yearlyPerMonthLabel(id)}`;

  return (
    <article
      data-testid={`subscription-plan-${id}`}
      className={cn(
        "group flex min-w-0 flex-col rounded-2xl border bg-card/45 p-4 transition-[border-color,box-shadow,transform] duration-300 motion-reduce:transition-none",
        "hover:-translate-y-0.5 hover:border-gold/50 hover:shadow-elegant motion-reduce:hover:translate-y-0",
        featured
          ? "col-span-2 border-gold/50 ring-1 ring-gold/15 lg:col-span-4"
          : "col-span-2 border-border/70 sm:col-span-1 lg:col-span-4",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-gold/30 bg-gold/[0.08] text-gold">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        {featured && (
          <span className="inline-flex min-h-7 items-center rounded-full border border-gold/35 bg-gold/[0.08] px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-gold">
            Най-избиран от фирми
          </span>
        )}
      </div>

      <h3 className="mt-4 font-serif text-xl font-bold leading-tight text-foreground">
        {plan.name}
      </h3>
      <p className="mt-1.5 text-base leading-snug text-muted-foreground">{PLAN_EXCERPT[id]}</p>

      <p className="mt-3 font-serif text-2xl font-bold text-gold">{priceLine}</p>
      <p className="mt-1 text-sm text-muted-foreground">{secondLine}</p>
      <p className="mt-1 text-sm text-foreground">{opsLabel(id)} на месец · цени с ДДС</p>

      <div className="mt-4 border-t border-border/60 pt-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Какво включва
        </p>
        <p className="mt-1 text-base leading-snug text-foreground">{PLAN_INCLUDES[id]}</p>
      </div>

      <Link
        to="/plans"
        className={cn(
          "btn-press mt-auto inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-3 pt-0 text-center text-sm font-bold",
          featured
            ? "btn-gold"
            : "border border-gold/35 text-gold hover:border-gold hover:bg-gold/[0.08]",
        )}
      >
        <span>Вижте плана</span>
        <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
      </Link>
    </article>
  );
}

export function SubscriptionShowcase() {
  const plans: PricingPlanId[] = ["professional", "entrepreneur", "team"];

  return (
    <div
      data-testid="subscription-showcase"
      className="grid grid-cols-2 items-stretch gap-3 sm:gap-5 lg:grid-cols-12"
    >
      <section
        aria-label="Абонаменти за фирми"
        className="col-span-2 overflow-hidden rounded-2xl border border-gold/30 bg-card/45 lg:col-span-12"
      >
        <div className="grid lg:grid-cols-2">
          <div className="relative aspect-[16/9] overflow-hidden border-b border-gold/20 lg:aspect-auto lg:border-b-0 lg:border-r">
            <img
              src={subscriptionStillLife}
              alt="Подредени папки с документи на тъмносиньо бюро под месингова лампа"
              width={1600}
              height={912}
              loading="lazy"
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent lg:bg-gradient-to-r" />
          </div>
          <div className="p-4 sm:p-6">
            <div className="eyebrow mb-3 justify-start">
              <span className="h-px w-8 bg-gold/40" />
              Абонамент за фирма
            </div>
            <h3 className="font-serif text-2xl font-bold leading-tight text-foreground sm:text-3xl">
              Когато документите са всяка седмица, а не веднъж
            </h3>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Абонаментът дава месечен обем действия — изготвяне, проверка, поправки и сваляне —
              в един профил на фирмата. Плащате веднъж месечно или годишно, без отделна покупка
              за всеки документ.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Предпочитате единичен документ? Превключете на „Частно лице“ и вижте трите
              еднократни продукта.
            </p>
            <Link
              to="/plans"
              className="btn-gold btn-press mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold"
            >
              <span>Разгледайте плановете</span>
              <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {plans.map((id) => (
        <PlanCard
          key={id}
          id={id as "professional" | "entrepreneur" | "team"}
          featured={id === "entrepreneur"}
        />
      ))}

      <p className="col-span-2 text-center text-sm text-muted-foreground lg:col-span-12">
        Всички цени са в евро с ДДС. Безплатният профил остава наличен с{" "}
        {PRICING_PLANS.free.opsPerMonth} действия месечно.
      </p>
    </div>
  );
}

export default SubscriptionShowcase;
