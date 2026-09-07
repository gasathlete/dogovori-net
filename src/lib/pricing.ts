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
    // Реалният lookup key на живия Екип поток (create-team) е team_seat_yearly.
    priceIds: { yearly: "team_seat_yearly" },
  },
};

/**
 * Входен („entry“) пакет БЕЗ абонамент — единственият еднократен продукт,
 * който предлагаме на нерегистрирани и на безплатни акаунти.
 *
 * ВАЖНО: това НЕ е top-up пакет. Top-up пакетите (`TOPUP_PACK_CONFIG`) са
 * достъпни само за активни абонати и имат отделни lookup keys. Никога не
 * приравнявайте `topup_5` и `five_operations` — това са различни продукти
 * с различна аудитория, дори когато числата съвпадат.
 */
export interface EntryPackConfig {
  readonly priceId: "five_operations";
  readonly ops: number;
  readonly eur: number;
}

export const ENTRY_PACK_CONFIG: EntryPackConfig = Object.freeze({
  priceId: "five_operations",
  ops: 5,
  eur: 2.9,
});

/** Стойност в стотинки, която живата Stripe цена трябва да има точно. */
export const ENTRY_PACK_AMOUNT_CENTS = Math.round(ENTRY_PACK_CONFIG.eur * 100);

/** Ориентировъчен адвокатски хонорар за изготвяне на един документ (EUR). */
export const LAWYER_FEE_MIN_EUR = 150;
export const LAWYER_FEE_MAX_EUR = 400;

/** Форматира EUR по български стандарт, винаги до 2 знака: 12,90 € / 129,00 € */
export function fmtEur(amount: number): string {
  return `${amount.toFixed(2).replace(".", ",")} €`;
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

/** „100 действия“ — публично формулиран капацитет за работа по документи. */
export function opsLabel(id: PricingPlanId): string {
  const p = PRICING_PLANS[id];
  const suffix = id === "team" ? " на място" : "";
  return `${p.opsPerMonth} действия${suffix}`;
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

/** „Предприемач — 19,90 €/мес (100 действия)“ */
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

/** „0,58 €/действие“ — работи и за top-up пакет, и за входния пакет. */
export function perOpLabel(pack: { ops: number; eur: number }): string {
  const per = pack.eur / pack.ops;
  const rounded = Math.round(per * 1000) / 1000;
  return `${String(rounded).replace(".", ",")} €/действие`;
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

/** Безплатни операции на месец за плана „Безплатен“. */
export const FREE_OPS_PER_MONTH = PRICING_PLANS.free.opsPerMonth ?? 2;

/**
 * Бонус при регистрация: през първите 30 дни безплатният план дава 5 операции
 * (сървърна истина: `public.free_ops_cap` / `public.consume_quota`), след което
 * се връща към `FREE_OPS_PER_MONTH`.
 */
export const FREE_OPS_ON_SIGNUP = 5;

/** Прозорецът в дни, през който важи бонусът при регистрация. */
export const FREE_OPS_SIGNUP_DAYS = 30;

/**
 * Канонично изречение за безплатната оферта. Използвайте го навсякъде, където
 * безплатният план се маркетира — така обещанието не се разминава с реалното
 * право (`free_ops_cap`).
 */
export const FREE_OFFER_RULE = `${FREE_OPS_ON_SIGNUP} действия по документи през първите ${FREE_OPS_SIGNUP_DAYS} дни, след това ${FREE_OPS_PER_MONTH} месечно`;

/**
 * Компактен вариант за CTA-та, които стартират анонимно: старт без регистрация,
 * но безплатните операции принадлежат на профила.
 */
export const FREE_OFFER_ANON_HELPER = `Старт без регистрация · с безплатен профил: ${FREE_OFFER_RULE} · без карта`;

/** Псевдоним за Hero trust линията — същият каноничен текст. */
export const FREE_OFFER_HERO_TRUST = FREE_OFFER_ANON_HELPER;

/**
 * Какво точно дава еднократният входен пакет (`five_operations`). Пакетът НЕ
 * отключва функции от абонаментните планове.
 */
export const ENTRY_PACK_FEATURES: readonly string[] = [
  `+${ENTRY_PACK_CONFIG.ops} действия по документи към профила`,
  "Използват се след включените безплатни действия",
  "Без абонамент · действията не изтичат",
  "Не отключва функции от платените планове",
];

/**
 * Септемврийска промоция 2026: −20% на всички абонаментни планове за
 * регистрации до 30.09.2026 включително (бета периодът е удължен до
 * 01.10.2026). Промокодът SEPT20 се осигурява сървърно в create-checkout.
 * Изтича автоматично на 01.10.2026 00:00 българско време.
 */
export const SEPTEMBER_PROMO = {
  code: "SEPT20",
  percent: 20,
  /** Край (изключващ) — 01.10.2026 00:00 Europe/Sofia (UTC+3). */
  endsAt: "2026-10-01T00:00:00+03:00",
  label: "Септемврийска промоция −20%",
} as const;

/** Активна ли е септемврийската промоция в момента. */
export function isSeptemberPromoActive(now: Date = new Date()): boolean {
  return now.getTime() < Date.parse(SEPTEMBER_PROMO.endsAt);
}

/** Промоционална цена с −20%, закръглена до стотинки: 12,90 → 10,32. */
export function promoPriceEur(amount: number): number {
  return Math.round(amount * (1 - SEPTEMBER_PROMO.percent / 100) * 100) / 100;
}


/**
 * ROI подзаглавие за платен план — колко правни разходи спестява месечно.
 * Базата е минималният адвокатски хонорар за един документ, умножен по
 * консервативни 1–2 документа месечно (спрямо обема на плана).
 */
export function roiSubtitle(id: PricingPlanId): string {
  const p = PRICING_PLANS[id];
  const price = p.monthly ?? (p.yearly !== null ? Math.round((p.yearly / 12) * 100) / 100 : null);
  if (price === null || price === 0) return "";
  const docsPerMonth = id === "professional" ? 1 : 2;
  const saved = LAWYER_FEE_MIN_EUR * docsPerMonth - price;
  const rounded = Math.floor(saved / 10) * 10;
  return `Спестява над ${fmtEur(rounded)}/мес от правни услуги`;
}
