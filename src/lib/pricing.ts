/**
 * pricing.ts — ЕДИНСТВЕН източник на истината за имената и стойностите на
 * абонаментните планове в целия frontend (банери, анонимен преглед, paywall,
 * checkout копия, ROI рамки).
 *
 * Стойностите тук огледално отразяват таблицата `plans` в базата
 * (виж /admin/plans). Никой компонент не трябва да съдържа литерални цени —
 * винаги ползвайте helper-ите отдолу. Автоматизираните тестове в
 * `src/test/pricingConfig.test.ts` и `src/test/pricingScreens.test.tsx`
 * гарантират, че екраните показват точно тези стойности.
 */

export type PricingPlanId = "free" | "professional" | "entrepreneur" | "team";

export interface PricingPlan {
  id: PricingPlanId;
  /** Публично име на български — никога не показвайте вътрешни ключове. */
  name: string;
  /** Месечна цена в EUR (с ДДС). `null` = няма месечен вариант. */
  monthly: number | null;
  /** Годишна цена в EUR (с ДДС). За Екип — на място. */
  yearly: number | null;
  /** Операции на месец (за Екип — на място). */
  opsPerMonth: number | null;
  /** Минимален брой места (само Екип). */
  seatMin: number | null;
  /** Stripe lookup keys за checkout. */
  priceIds: { monthly?: string; yearly?: string };
}

export const VAT_RATE = 0.2;
export const CURRENCY = "EUR" as const;

export const PRICING_PLANS: Record<PricingPlanId, PricingPlan> = {
  free: {
    id: "free",
    name: "Безплатен",
    monthly: 0,
    yearly: 0,
    opsPerMonth: 2,
    seatMin: null,
    priceIds: {},
  },
  professional: {
    id: "professional",
    name: "Професионалист",
    monthly: 12.9,
    yearly: 129,
    opsPerMonth: 50,
    seatMin: null,
    priceIds: { monthly: "professional_monthly", yearly: "professional_yearly" },
  },
  entrepreneur: {
    id: "entrepreneur",
    name: "Предприемач",
    monthly: 19.9,
    yearly: 199,
    opsPerMonth: 100,
    seatMin: null,
    priceIds: { monthly: "entrepreneur_monthly", yearly: "entrepreneur_yearly" },
  },
  team: {
    id: "team",
    name: "Екип",
    monthly: null,
    yearly: 109,
    opsPerMonth: 100,
    seatMin: 3,
    priceIds: { yearly: "team_yearly" },
  },
};

/** Еднократно отключване на един стриктен документ (EUR, с ДДС). */
export const STRICT_UNLOCK_EUR = 0.4;

/** Ориентировъчен адвокатски хонорар за изготвяне на един документ (EUR). */
export const LAWYER_FEE_MIN_EUR = 150;
export const LAWYER_FEE_MAX_EUR = 400;

/** Форматира EUR по български стандарт: 12,90 € */
export function fmtEur(amount: number): string {
  const hasCents = Math.round(amount * 100) % 100 !== 0;
  const value = hasCents ? amount.toFixed(2).replace(".", ",") : String(Math.round(amount));
  return `${value} €`;
}

/** „12,90 €/мес“ */
export function monthlyLabel(id: PricingPlanId): string {
  const p = PRICING_PLANS[id];
  if (p.monthly === null) throw new Error(`План ${id} няма месечна цена`);
  return `${fmtEur(p.monthly)}/мес`;
}

/** „129 €/год“ */
export function yearlyLabel(id: PricingPlanId): string {
  const p = PRICING_PLANS[id];
  if (p.yearly === null) throw new Error(`План ${id} няма годишна цена`);
  return id === "team" ? `${fmtEur(p.yearly)}/място/год` : `${fmtEur(p.yearly)}/год`;
}

/** „≈ 10,75 €/мес“ — месечен еквивалент на годишния план. */
export function yearlyPerMonthLabel(id: PricingPlanId): string {
  const p = PRICING_PLANS[id];
  if (p.yearly === null) throw new Error(`План ${id} няма годишна цена`);
  return `≈ ${fmtEur(Math.round((p.yearly / 12) * 100) / 100)}/мес`;
}

/** „100 операции“ */
export function opsLabel(id: PricingPlanId): string {
  const p = PRICING_PLANS[id];
  const suffix = id === "team" ? " на място" : "";
  return `${p.opsPerMonth} операции${suffix}`;
}

/** Минимална годишна стойност за Екип: 327 € */
export function teamMinYearlyTotal(): number {
  const t = PRICING_PLANS.team;
  return (t.yearly ?? 0) * (t.seatMin ?? 1);
}

/** „Екип — 109 €/място/год (мин. 3 места = 327 €/год)“ */
export function teamSummary(): string {
  const t = PRICING_PLANS.team;
  return `${t.name} — ${yearlyLabel("team")} (мин. ${t.seatMin} места = ${fmtEur(
    teamMinYearlyTotal(),
  )}/год)`;
}

/** „Предприемач — 19,90 €/мес (100 операции)“ */
export function planSummary(id: PricingPlanId): string {
  if (id === "team") return teamSummary();
  return `${PRICING_PLANS[id].name} — ${monthlyLabel(id)} (${opsLabel(id)})`;
}

/** Top-up пакети (само за активни абонати). */
export interface TopupPackConfig {
  priceId: "topup_5" | "topup_20" | "topup_50" | "topup_100";
  ops: number;
  eur: number;
  badge?: string;
}

export const TOPUP_PACK_CONFIG: TopupPackConfig[] = [
  { priceId: "topup_5", ops: 5, eur: 2.9 },
  { priceId: "topup_20", ops: 20, eur: 5.4 },
  { priceId: "topup_50", ops: 50, eur: 12.9, badge: "Най-избиран" },
  { priceId: "topup_100", ops: 100, eur: 23.9, badge: "Най-изгоден" },
];

/** „0,58 €/оп.“ */
export function perOpLabel(pack: TopupPackConfig): string {
  const per = pack.eur / pack.ops;
  const rounded = Math.round(per * 1000) / 1000;
  return `${String(rounded).replace(".", ",")} €/оп.`;
}

/** Имена, които вече не се използват — тестовете следят да не се връщат. */
export const DEPRECATED_PLAN_TERMS = ["Pro план", "Team план", "лв.", "BGN"] as const;

/** Най-ниската цена за една операция сред активните планове (за маркетинг копие). */
export function cheapestPerOpEur(): number {
  const rates: number[] = [];
  for (const id of ["professional", "entrepreneur"] as const) {
    const p = PRICING_PLANS[id];
    if (p.monthly !== null && p.opsPerMonth) rates.push(p.monthly / p.opsPerMonth);
  }
  const team = PRICING_PLANS.team;
  if (team.yearly !== null && team.opsPerMonth) rates.push(team.yearly / 12 / team.opsPerMonth);
  return Math.round(Math.min(...rates) * 100) / 100;
}

/** „0,09 €“ — най-изгодна цена за документ. */
export function cheapestPerOpLabel(): string {
  return fmtEur(cheapestPerOpEur());
}
