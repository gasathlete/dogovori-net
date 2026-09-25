/**
 * Безопасно клиентско съобщение, когато сървърът затваря нова платена работа,
 * защото произходът на източника още не може да бъде удостоверен независимо.
 * Не твърди проверка, не обещава срок и казва, че плащане не се извършва.
 */
export const TRUSTED_SOURCE_UNAVAILABLE_CODE = "trusted_source_unavailable" as const;
export const TRUSTED_SOURCE_UNAVAILABLE_MESSAGE =
  "Проверката на произхода на документа още не е налична. Плащане не се извършва и нищо не се обработва. Вече получените резултати остават достъпни.";

export function productBlockedMessage(code: unknown, serverMessage: unknown): string | null {
  if (code === TRUSTED_SOURCE_UNAVAILABLE_CODE) return TRUSTED_SOURCE_UNAVAILABLE_MESSAGE;
  return typeof serverMessage === "string" && serverMessage.trim().length > 0
    ? serverMessage.trim().slice(0, 300)
    : null;
}
