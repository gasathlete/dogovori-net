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
 * Избира най-малкия план, който покрива зададения обем документи.
 * Използва реалните `ops_cap_monthly` стойности от базата, без хардкод.
 */
export function recommendPlan(plans: PlanView[], docsPerMonth: number): PlanId {
  if (!plans.length) return "entrepreneur";

  const order: PlanId[] = ["free", "professional", "entrepreneur", "team"];
  const sorted = order
    .map((id) => plans.find((p) => p.id === id))
    .filter((p): p is PlanView => Boolean(p));

  for (const plan of sorted) {
    const cap =
      plan.id === "free"
        ? 2
        : plan.id === "team"
          ? (plan.ops_cap_monthly ?? 100) * (plan.seat_min ?? 3)
          : plan.ops_cap_monthly;
    if (cap !== null && docsPerMonth <= cap) return plan.id;
  }
  return sorted[sorted.length - 1].id;
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
      needsTopup: opsCap !== null && docsPerMonth > opsCap,
    };
  }, [plans, docsPerMonth, billing]);
}
