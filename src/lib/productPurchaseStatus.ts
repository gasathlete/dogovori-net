/**
 * Наличност на НОВА покупка на еднократен продукт — от сървъра, не само от
 * prelaunch.ts. create-product-checkout остава авторитетът; това е само
 * показване, затова при съмнение е „Скоро“ (fail-closed).
 */
export type ProductPurchaseReason = "prelaunch" | "live_closed" | "sandbox_staff_only" | "unavailable";
export type ProductPurchaseState =
  | { status: "loading" }
  | { status: "available" }
  | { status: "closed"; reason: ProductPurchaseReason };

export const PRODUCT_CLOSED_MESSAGES: Readonly<Record<ProductPurchaseReason, string>> = {
  prelaunch: "Покупките на този продукт още не са отворени. Можете да разгледате обхвата и примерния резултат.",
  live_closed: "Покупките на този продукт временно са затворени. Можете да разгледате обхвата и примерния резултат.",
  sandbox_staff_only: "В тестовата версия покупките са достъпни само за екипа на Договори.нет. Можете да разгледате обхвата и примерния резултат.",
  unavailable: "В момента не можем да потвърдим, че покупките са отворени. Можете да разгледате обхвата и примерния резултат.",
};

/** Точни съобщения при отказ от create-product-checkout, без „Опитайте отново“. */
export const PRODUCT_CHECKOUT_REFUSAL_MESSAGES: Readonly<Record<string, string>> = {
  public_product_launch_closed: "Покупките на този продукт временно са затворени. Не е извършено плащане.",
  sandbox_forbidden: "В тестовата версия покупките са достъпни само за екипа на Договори.нет. Не е извършено плащане.",
  unauthorized: "Сесията Ви е изтекла. Влезте отново. Не е извършено плащане.",
};

export const PRODUCT_CHECKOUT_TECHNICAL_FAILURE =
  "Плащането не се отвори поради техническа грешка. Не е извършено плащане. Данните остават в този раздел.";

export function refusalMessage(code: unknown): string | null {
  return typeof code === "string" && code in PRODUCT_CHECKOUT_REFUSAL_MESSAGES
    ? PRODUCT_CHECKOUT_REFUSAL_MESSAGES[code]
    : null;
}

/** Комбинира клиентския prelaunch флаг със сървърния отговор. */
export function resolvePurchaseState(
  clientAvailable: boolean,
  server: { available?: unknown; reason?: unknown } | null | undefined,
): ProductPurchaseState {
  if (!clientAvailable) return { status: "closed", reason: "prelaunch" };
  if (!server || typeof server !== "object") return { status: "closed", reason: "unavailable" };
  if (server.available === true) return { status: "available" };
  const r = server.reason;
  return {
    status: "closed",
    reason: r === "live_closed" || r === "sandbox_staff_only" ? r : "unavailable",
  };
}
