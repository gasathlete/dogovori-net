/**
 * Запазено намерение за плащане.
 *
 * Когато човек отвори плащането и го затвори, без да плати, пазим САМО избора
 * му (план и период) в рамките на браузърната сесия, за да може да продължи
 * оттам, където е спрял. Никакви лични или картови данни не се пазят и
 * намерението само по себе си не дава никакво право — правото възниква само
 * след проверено плащане.
 */
import { ENTRY_PACK_CONFIG, PRICING_PLANS, TOPUP_PACK_CONFIG, fmtEur, type PricingPlanId } from "@/lib/pricing";
import { isAllowedCheckoutPrice } from "@/lib/entryPack";

function knownPlan(plan: string) {
  return (PRICING_PLANS as Record<string, (typeof PRICING_PLANS)[PricingPlanId] | undefined>)[plan] ?? null;
}

const KEY = "dgv:checkout-intent";

export interface CheckoutIntent {
  /** Lookup key на цената, с която е отворено плащането. */
  priceId: string;
  plan: string;
  billing: string;
  /** Откъде е отворено (account_subscription, topup, team…). */
  source: string;
  /** Кога е запазено — по-старо от 7 дни не се показва. */
  savedAt: number;
}

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function saveCheckoutIntent(intent: Omit<CheckoutIntent, "savedAt">): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...intent, savedAt: Date.now() }));
  } catch {
    /* липсващо хранилище не е причина да спре плащането */
  }
}

export function readCheckoutIntent(): CheckoutIntent | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CheckoutIntent;
    if (!parsed?.priceId || typeof parsed.priceId !== "string") return null;
    if (!parsed.savedAt || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      clearCheckoutIntent();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearCheckoutIntent(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* няма какво да се чисти */
  }
}

/** Четим етикет на плана за панела „Продължете, откъдето спряхте“. */
export function intentPlanLabel(intent: CheckoutIntent): string {
  // Еднократните избори нямат план в PRICING_PLANS — етикетът идва от
  // съответната конфигурация, никога суровият priceId (напр. „topup_50“).
  if (intent.priceId === ENTRY_PACK_CONFIG.priceId) {
    return `Входен пакет · ${ENTRY_PACK_CONFIG.ops} действия`;
  }
  const topup = TOPUP_PACK_CONFIG.find((p) => p.priceId === intent.priceId);
  if (topup) return `Пакет +${topup.ops} действия`;
  if (intent.priceId === "branding_unlock_once") return "Отключване на фирмен бранд";
  const name = knownPlan(intent.plan)?.name ?? intent.plan;
  if (intent.billing === "yearly") return `${name} · годишно`;
  if (intent.billing === "monthly") return `${name} · месечно`;
  return name;
}

/**
 * Кои запазени намерения могат да бъдат довършени от панела в профила.
 * По-широко от URL allowlist-а: включва абонаменти, входния пакет, top-up
 * пакетите и бранд отключването. Всичко извън списъка се игнорира.
 */
export function isResumableCheckoutPrice(priceId: string | null | undefined): boolean {
  if (!priceId) return false;
  if (priceId === "branding_unlock_once") return true;
  if (TOPUP_PACK_CONFIG.some((p) => p.priceId === priceId)) return true;
  return isAllowedCheckoutPrice(priceId);
}

/**
 * Честен контекст за стойността на абонамента върху самия екран за плащане.
 *
 * Сравнението е с реалните еднократни цени в сайта, а не с измислена
 * икономия: при 5 документа месечно еднократните продукти излизат повече от
 * месечната такса. Без брояч, без краен срок и без измислен недостиг.
 */
export function checkoutValueNote(plan: string, billing: string): string | null {
  const known = knownPlan(plan);
  if (!known || !known.opsPerMonth) return null;
  const monthly = billing === "yearly" ? (known.yearly ?? 0) / 12 : known.monthly ?? 0;
  if (!Number.isFinite(monthly) || monthly <= 0) return null;
  const perOp = monthly / known.opsPerMonth;
  return `${fmtEur(monthly)} на месец при ${known.opsPerMonth} действия по документи — около ${fmtEur(
    Math.round(perOp * 100) / 100,
  )} за действие. Еднократната проверка на един документ е 2,99 €.`;
}
