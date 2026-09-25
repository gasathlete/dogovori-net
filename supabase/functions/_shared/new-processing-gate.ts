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
  download_blank: "DOWNLOAD_BLANK_NEW_PROCESSING_ENABLED",
  team_checkout: "TEAM_CHECKOUT_ENABLED",
  team_seat_increase: "TEAM_SEAT_INCREASE_ENABLED",
  analyze_contract: "ANALYZE_CONTRACT_NEW_PROCESSING_ENABLED",
  review_document: "REVIEW_DOCUMENT_NEW_PROCESSING_ENABLED",
  correct_uploaded: "CORRECT_UPLOADED_NEW_PROCESSING_ENABLED",
  apply_corrections: "APPLY_CORRECTIONS_NEW_PROCESSING_ENABLED",
  refine_contract: "REFINE_CONTRACT_NEW_PROCESSING_ENABLED",
  negotiation_strategy: "NEGOTIATION_STRATEGY_NEW_PROCESSING_ENABLED",
  generate_linked_document: "GENERATE_LINKED_DOCUMENT_NEW_PROCESSING_ENABLED",
  generate_contract: "GENERATE_CONTRACT_NEW_PROCESSING_ENABLED",
});
export type NewProcessingSurface = keyof typeof NEW_PROCESSING_FLAGS;

export const NEW_PROCESSING_CODES: Readonly<Record<NewProcessingSurface, string>> = Object.freeze({
  assistant: "assistant_prelaunch_closed",
  subscription_checkout: "checkout_prelaunch_closed",
  strict_unlock_checkout: "checkout_prelaunch_closed",
  download_blank: "blank_prelaunch_closed",
  team_checkout: "checkout_prelaunch_closed",
  team_seat_increase: "seat_increase_prelaunch_closed",
  analyze_contract: "analysis_prelaunch_closed",
  review_document: "review_prelaunch_closed",
  correct_uploaded: "correction_prelaunch_closed",
  apply_corrections: "correction_prelaunch_closed",
  refine_contract: "refinement_prelaunch_closed",
  negotiation_strategy: "strategy_prelaunch_closed",
  generate_linked_document: "generation_prelaunch_closed",
  generate_contract: "generation_prelaunch_closed",
});

const MESSAGES: Readonly<Record<NewProcessingSurface, string>> = Object.freeze({
  assistant: "Новата обработка още не е отворена. Нищо не е изпратено и нищо не е таксувано.",
  subscription_checkout: "Плащането още не е отворено. Не е извършено плащане.",
  strict_unlock_checkout: "Плащането още не е отворено. Не е извършено плащане.",
  download_blank: "Изготвянето на нова бланка още не е отворено. Нищо не е таксувано.",
  team_checkout: "Плащането още не е отворено. Не е извършено плащане.",
  team_seat_increase: "Добавянето на места още не е отворено. Не е извършено плащане. Намаляването на места остава достъпно.",
  analyze_contract: "Новият анализ още не е отворен. Нищо не е изпратено и нищо не е таксувано.",
  review_document: "Новата проверка още не е отворена. Нищо не е изпратено и нищо не е таксувано.",
  correct_uploaded: "Новата поправка още не е отворена. Нищо не е изпратено и нищо не е таксувано.",
  apply_corrections: "Новата поправка още не е отворена. Нищо не е изпратено и нищо не е таксувано.",
  refine_contract: "Новото прецизиране още не е отворено. Нищо не е изпратено и нищо не е таксувано.",
  negotiation_strategy: "Новата преговорна стратегия още не е отворена. Нищо не е изпратено и нищо не е таксувано.",
  generate_linked_document: "Изготвянето на нов документ още не е отворено. Нищо не е изпратено и нищо не е таксувано.",
  generate_contract: "Изготвянето на нов документ още не е отворено. Нищо не е изпратено и нищо не е таксувано.",
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
