import { supabase } from "@/integrations/supabase/client";
import { buildWaitlistArgs, isPrelaunchFeature, type PrelaunchFeature } from "@/lib/prelaunch";
import { trackMetric } from "@/lib/metrics";

export type WaitlistResult = "accepted" | "invalid" | "unavailable";

export const PRELAUNCH_WAITLIST_EVENT = "dogovori:prelaunch-waitlist";

/**
 * Позволени източници (етикети без лични данни). Всичко друго става "other".
 * Никога имейл, текст, име на файл, query низ или платежен идентификатор.
 */
export const WAITLIST_SOURCES = [
  "assistant",
  "assistant_attach",
  "analyze",
  "wizard",
  "companion",
  "product_detail",
  "product_start",
  "checkout",
  "strict_unlock",
  "package_catalog",
  "package_detail",
  "kit_catalog",
  "kit_detail",
  "product_card",
  "plans",
  "other",
] as const;
export type WaitlistSource = (typeof WAITLIST_SOURCES)[number];

function safeSource(s: unknown): WaitlistSource {
  return (WAITLIST_SOURCES as readonly string[]).includes(s as string) ? (s as WaitlistSource) : "other";
}

/* ---- Минимален funnel с дедупликация в рамките на сесията на таба ---- */
const seen = new Set<string>();
function once(key: string, fn: () => void) {
  if (seen.has(key)) return;
  seen.add(key);
  fn();
}
/** Само за тестове. */
export function __resetWaitlistFunnel() {
  seen.clear();
}

export function trackWaitlistOpened(feature: PrelaunchFeature, source: WaitlistSource) {
  once(`open:${feature}:${source}`, () => trackMetric("prelaunch_waitlist_opened", { feature, source }));
}
export function trackProductIntent(productId: string, source: WaitlistSource) {
  // productId е каноничен етикет (напр. contract_check); не е платежен токен.
  if (!/^[a-z_]{3,40}$/.test(productId)) return;
  once(`intent:${productId}`, () => trackMetric("product_intent", { product: productId, source }));
}
/** Един опит = едно събитие; успехът се брои само веднъж на функция. */
export function trackWaitlistOutcome(feature: PrelaunchFeature, result: WaitlistResult) {
  if (result === "accepted") {
    once(`ok:${feature}`, () => trackMetric("prelaunch_waitlist_succeeded", { feature }));
  } else {
    trackMetric("prelaunch_waitlist_failed", { feature, reason: result });
  }
}

export function openPrelaunchWaitlist(
  feature: PrelaunchFeature,
  opts: { source?: WaitlistSource; productId?: string } = {},
): void {
  if (typeof window === "undefined") return;
  const source = safeSource(opts.source);
  trackWaitlistOpened(feature, source);
  if (opts.productId) trackProductIntent(opts.productId, source);
  window.dispatchEvent(new CustomEvent(PRELAUNCH_WAITLIST_EVENT, { detail: { feature } }));
}

/**
 * Записва заявката само чрез RPC `request_prelaunch_waitlist`.
 * Ако функцията липсва (неприложена миграция) или върне грешка — "unavailable";
 * никога не казваме „записано“, без сървърът да потвърди `true`.
 */
export async function submitPrelaunchWaitlist(input: {
  email: string;
  feature: string;
  consent: boolean;
}): Promise<WaitlistResult> {
  const args = buildWaitlistArgs(input);
  if (args === null) return "invalid";
  let result: WaitlistResult = "unavailable";
  try {
    // RPC още не е в генерираните типове (миграцията не е приложена).
    const rpc = supabase.rpc as unknown as (
      fn: string,
      a: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>;
    const { data, error } = await rpc("request_prelaunch_waitlist", { ...args });
    result = !error && data === true ? "accepted" : "unavailable";
  } catch {
    result = "unavailable";
  }
  if (isPrelaunchFeature(input.feature)) trackWaitlistOutcome(input.feature, result);
  return result;
}
