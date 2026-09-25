/**
 * Сървърна преграда за НОВА обработка и НОВО плащане (предварителен режим).
 *
 * Правило: всяка повърхност е ЗАТВОРЕНА, освен ако server-side env флагът е
 * точно низът "true". Липсващ, празен, "TRUE", "1" и т.н. = затворено.
 * Разрешението НИКОГА не идва от тялото на заявката или от клиентски флаг.
 *
 * Не засяга: payments-webhook, customer-portal, refund/reversal, export,
 * delete, unsubscribe и възпроизвеждане на вече записани резултати.
 */
export type EnvReader = (key: string) => string | undefined;

export const NEW_PROCESSING_FLAGS = Object.freeze({
  assistant: "ASSISTANT_NEW_PROCESSING_ENABLED",
  subscription_checkout: "SUBSCRIPTION_CHECKOUT_ENABLED",
  strict_unlock_checkout: "STRICT_UNLOCK_CHECKOUT_ENABLED",
});
export type NewProcessingSurface = keyof typeof NEW_PROCESSING_FLAGS;

export const NEW_PROCESSING_CODES: Readonly<Record<NewProcessingSurface, string>> = Object.freeze({
  assistant: "assistant_prelaunch_closed",
  subscription_checkout: "checkout_prelaunch_closed",
  strict_unlock_checkout: "checkout_prelaunch_closed",
});

const MESSAGES: Readonly<Record<NewProcessingSurface, string>> = Object.freeze({
  assistant: "Новата обработка още не е отворена. Нищо не е изпратено и нищо не е таксувано.",
  subscription_checkout: "Плащането още не е отворено. Не е извършено плащане.",
  strict_unlock_checkout: "Плащането още не е отворено. Не е извършено плащане.",
});

const defaultEnv: EnvReader = (k) => {
  try {
    return Deno.env.get(k);
  } catch {
    return undefined;
  }
};

export function isNewProcessingOpen(surface: NewProcessingSurface, env: EnvReader = defaultEnv): boolean {
  return env(NEW_PROCESSING_FLAGS[surface]) === "true";
}

export function newProcessingClosedResponse(
  surface: NewProcessingSurface,
  corsHeaders: Record<string, string>,
  extra: Record<string, unknown> = {},
): Response {
  const message = MESSAGES[surface];
  return new Response(
    JSON.stringify({ error: message, message, code: NEW_PROCESSING_CODES[surface], ...extra }),
    { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "3600" } },
  );
}
