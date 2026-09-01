/**
 * PrimaryChoice — единствената развилка в първия екран.
 * Три ясни пътя вместо стена от информация: изготви, разгледай, провери.
 */
import { useState } from "react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { FilePen, Search, ShieldCheck, ArrowRight } from "@/icons";
import { trackMetric } from "@/lib/metrics";
import { ChoiceFlow, type FlowId } from "@/components/home/ChoiceFlow";

const CHOICES = [
  {
    to: "/build",
    icon: FilePen,
    label: "Изготви документ",
    hint: "Отговаряш на въпроси — получаваш готов договор за 2 минути.",
    badge: "Най-бърз път",
    id: "build",
    primary: true,
  },
  {
    to: "/catalog",
    icon: Search,
    label: "Разгледай шаблони",
    hint: "Над 600 образца по ЗЗД, ТЗ, КТ и ЗУТ.",
    badge: "625 шаблона",
    id: "catalog",
    primary: false,
  },
  {
    to: "/analiz",
    icon: ShieldCheck,
    label: "Провери мой договор",
    hint: "AI анализ на риска — открива клопки и неравноправни клаузи.",
    badge: "AI одит",
    id: "analyze",
    primary: false,
  },
] as const;

export function PrimaryChoice() {
  return (
    <section aria-labelledby="primary-choice-title" className="container pb-10 pt-2 sm:pb-14">
      <div className="eyebrow mb-3 justify-center">
        <span className="font-serif text-base font-normal tracking-normal text-gold/60">01</span>
        <span className="h-px w-8 bg-gold/40" />
        Твоят избор
      </div>
      <h2
        id="primary-choice-title"
        className="mb-5 text-center font-serif text-2xl font-bold text-foreground sm:text-3xl"
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
                    ? "border-gold/50 bg-gold/[0.07] shadow-gold hover:border-gold hover:bg-gold/[0.12]"
                    : "border-border/70 bg-card/50 hover:border-gold/40 hover:bg-card")
                }
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="mb-1 inline-block rounded-full border border-gold/25 bg-gold/[0.07] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-gold">
                    {c.badge}
                  </span>
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
