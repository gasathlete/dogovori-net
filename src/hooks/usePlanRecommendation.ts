/**
 * usePlanRecommendation — свързва „брой документи на месец" с най-подходящия план.
 *
 * Логиката е чиста функция (`recommendPlan`), за да е тестваема, а hook-ът
 * само мемоизира резултата спрямо реалните данни от `usePlans()`.
 */
import { useMemo } from "react";
import type { PlanId, PlanView, Billing } from "@/hooks/usePlans";

/** Средна цена на юрист за изготвяне на един стандартен документ (EUR). */
export const LAWYER_DOC_COST_EUR = 90;

export interface PlanRecommendation {
  planId: PlanId;
  plan: PlanView | null;
  /** Месечна цена на препоръчания план при избрания период. */
  monthlyEquivalent: number;
  /** Цена на един документ при този обем. */
  perDocEur: number;
  /** Спестено спрямо юрист на месец. */
  savedEur: number;
  /** Включени операции на месец (null = динамичен безплатен лимит). */
  opsCap: number | null;
  /** Дали обемът надхвърля включените операции. */
  needsTopup: boolean;
}

/**
 * Средно операции за един завършен документ:
 * генериране/изтегляне (1) + AI преглед за рискови клаузи (1) + подпис или
 * повторно изтегляне след корекции (1).
 */
export const OPS_PER_DOC = 3;

/** Операции, до които Професионалист е достатъчен без AI екстрите на Предприемач.
 *  При 10+ операции месечно препоръчваме Предприемач.
 */
const PROFESSIONAL_MAX_OPS = 9;

/**
 * Избира плана, който покрива обема документи с реалния разход на операции.
 *
 * Ключово: един документ рядко е една операция — затова Предприемач е
 * препоръчаният план от 10 операции месечно нататък (OCR, сравнение на договори,
 * преговорна стратегия и GPT-5 се включват само там).
 */
export function recommendPlan(plans: PlanView[], docsPerMonth: number): PlanId {
  const has = (id: PlanId) => plans.some((p) => p.id === id);
  const capOf = (id: PlanId) => plans.find((p) => p.id === id)?.ops_cap_monthly ?? null;

  if (docsPerMonth <= 2 && has("free")) return "free";

  const needOps = docsPerMonth * OPS_PER_DOC;

  const proCap = capOf("professional");
  if (
    has("professional") &&
    docsPerMonth <= PROFESSIONAL_MAX_DOCS &&
    (proCap === null || needOps <= proCap)
  ) {
    return "professional";
  }

  const entCap = capOf("entrepreneur");
  if (has("entrepreneur") && (entCap === null || needOps <= entCap)) return "entrepreneur";

  if (has("team")) return "team";
  return has("entrepreneur") ? "entrepreneur" : "professional";
}


export function usePlanRecommendation(
  plans: PlanView[],
  docsPerMonth: number,
  billing: Billing,
): PlanRecommendation {
  return useMemo(() => {
    const planId = recommendPlan(plans, docsPerMonth);
    const plan = plans.find((p) => p.id === planId) ?? null;

    const yearly = plan?.yearly?.price ?? null;
    const monthly = plan?.monthly?.price ?? null;

    let monthlyEquivalent = 0;
    if (planId !== "free" && plan) {
      if (billing === "yearly" && yearly !== null) {
        // Годишните цени са за 12 месеца (за Екип — на място).
        monthlyEquivalent = yearly / 12;
        if (planId === "team") monthlyEquivalent *= plan.seat_min ?? 3;
      } else if (monthly !== null) {
        monthlyEquivalent = monthly;
        if (planId === "team") monthlyEquivalent *= plan.seat_min ?? 3;
      } else if (yearly !== null) {
        monthlyEquivalent = (yearly / 12) * (planId === "team" ? (plan.seat_min ?? 3) : 1);
      }
    }

    const docs = Math.max(1, docsPerMonth);
    const perDocEur = monthlyEquivalent / docs;
    const savedEur = Math.max(0, docs * LAWYER_DOC_COST_EUR - monthlyEquivalent);

    const opsCap =
      planId === "free"
        ? 2
        : planId === "team"
          ? (plan?.ops_cap_monthly ?? 100) * (plan?.seat_min ?? 3)
          : (plan?.ops_cap_monthly ?? null);

    return {
      planId,
      plan,
      monthlyEquivalent,
      perDocEur,
      savedEur,
      opsCap,
      needsTopup: opsCap !== null && docs * OPS_PER_DOC > opsCap,
    };
  }, [plans, docsPerMonth, billing]);
}
