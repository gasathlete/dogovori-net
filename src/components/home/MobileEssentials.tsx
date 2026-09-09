/**
 * Мобилният „всичко останало" блок: три кратки връзки към основните задачи и
 * един спокоен ред с условията. Нищо повече — дългата десктоп поредица не се
 * рендира на телефон.
 */
import { Link } from "react-router-dom";
import { prefetchHandlers } from "@/lib/routePrefetch";
import { ArrowRight, FileUp, FileText, BookOpen } from "@/icons";
import { ONE_TIME_TERMS } from "@/lib/products";

const ESSENTIALS = [
  { to: "/analiz", label: "Качи договор", hint: "Проверка на свой документ", icon: FileUp },
  { to: "/build", label: "Изготви документ", hint: "Ново от въпроси и отговори", icon: FileText },
  { to: "/catalog", label: "Разгледай шаблони", hint: "Готови бланки по сектор", icon: BookOpen },
];

export function MobileEssentials() {
  return (
    <section
      aria-labelledby="mobile-essentials-title"
      data-testid="mobile-essentials"
      className="container py-8"
    >
      <h2
        id="mobile-essentials-title"
        className="mb-3 font-serif text-[19px] font-bold text-foreground"
      >
        Или започнете направо
      </h2>
      <ul className="flex flex-col gap-2">
        {ESSENTIALS.map((e) => {
          const Icon = e.icon;
          return (
            <li key={e.to}>
              <Link
                to={e.to}
                {...prefetchHandlers(e.to)}
                className="flex min-h-[56px] items-center gap-3 rounded-xl border border-border/70 bg-card/50 px-3.5 transition-colors hover:border-gold/40"
              >
                <Icon className="h-[18px] w-[18px] shrink-0 text-gold/80" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-foreground">{e.label}</span>
                  <span className="block text-[11.5px] text-muted-foreground">{e.hint}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-[11.5px] leading-relaxed text-muted-foreground">
        {ONE_TIME_TERMS} · Данните ви се обработват съгласно GDPR.
      </p>
    </section>
  );
}

/** Единственото затварящо действие на мобилната страница. */
export function MobileFinalCta() {
  return (
    <section className="container pb-10">
      <div className="rounded-2xl border border-gold/30 bg-gold/[0.06] p-4 text-center">
        <p className="text-[14px] font-semibold text-foreground">
          Готови ли сте да проверите договора си?
        </p>
        <Link
          to="/produkti"
          {...prefetchHandlers("/produkti")}
          className="btn-gold btn-press mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl text-[15px] font-bold"
        >
          Разгледайте продуктите
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
