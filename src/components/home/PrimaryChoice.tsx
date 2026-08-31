/**
 * PrimaryChoice — единствената развилка в първия екран.
 * Три ясни пътя вместо стена от информация: изготви, разгледай, провери.
 */
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { FilePen, Search, ShieldCheck, ArrowRight } from "@/icons";
import { trackMetric } from "@/lib/metrics";

const CHOICES = [
  {
    to: "/build",
    icon: FilePen,
    label: "Изготви документ",
    hint: "Отговаряш на въпроси — получаваш готов договор за 2 минути.",
    id: "build",
    primary: true,
  },
  {
    to: "/catalog",
    icon: Search,
    label: "Разгледай шаблони",
    hint: "Над 600 образца по ЗЗД, ТЗ, КТ и ЗУТ.",
    id: "catalog",
    primary: false,
  },
  {
    to: "/analiz",
    icon: ShieldCheck,
    label: "Провери мой договор",
    hint: "AI анализ на риска — открива клопки и неравноправни клаузи.",
    id: "analyze",
    primary: false,
  },
] as const;

export function PrimaryChoice() {
  return (
    <section aria-labelledby="primary-choice-title" className="container pb-10 pt-2 sm:pb-14">
      <h2
        id="primary-choice-title"
        className="mb-4 text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground"
      >
        Какво искаш да направиш?
      </h2>
      <ul role="list" className="mx-auto grid max-w-4xl gap-3 sm:grid-cols-3">
        {CHOICES.map((c) => {
          const Icon = c.icon;
          return (
            <li key={c.id}>
              <Link
                to={c.to}
                onClick={() => trackMetric("home_choice_click", { choice: c.id })}
                className={
                  "group flex h-full items-start gap-3 rounded-xl border p-4 transition-all hover:-translate-y-0.5 sm:flex-col sm:gap-2.5 sm:p-5 " +
                  (c.primary
                    ? "border-gold/50 bg-gold/[0.07] hover:border-gold hover:bg-gold/[0.12]"
                    : "border-border/70 bg-card/50 hover:border-gold/40 hover:bg-card")
                }
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground group-hover:text-gold">
                    {c.label}
                    <ArrowRight className="h-4 w-4 shrink-0 text-gold/70 transition-transform group-hover:translate-x-0.5" />
                  </span>
                  <span className="mt-1 block text-[13px] leading-relaxed text-muted-foreground">
                    {c.hint}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
