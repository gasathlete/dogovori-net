/**
 * НОРМАЛИЗИРАНИ ГРЕШКИ ОТ AI ШЛЮЗА.
 *
 * Публичният отговор НИКОГА не носи тялото на шлюза, вътрешни съобщения или
 * текст на изключение: това може да съдържа части от подадения документ или
 * вътрешна инфраструктурна информация. Клиентът получава код, разбираемо
 * съобщение на български и (при уместност) време за нов опит.
 */

export type GatewayErrorCode =
  | "ai_rate_limited"
  | "ai_credits_exhausted"
  | "ai_unavailable"
  | "ai_invalid_output";

export interface NormalizedGatewayError {
  readonly code: GatewayErrorCode;
  readonly status: number;
  readonly message: string;
  readonly retry_after_seconds?: number;
}

/** Превежда HTTP код на шлюза в безопасен публичен отговор. */
export function normalizeGatewayStatus(status: number): NormalizedGatewayError {
  if (status === 429) {
    return {
      code: "ai_rate_limited",
      status: 429,
      message: "Достигнат е моментният лимит. Опитайте отново след малко.",
      retry_after_seconds: 60,
    };
  }
  if (status === 402) {
    return {
      code: "ai_credits_exhausted",
      status: 402,
      message: "Услугата е временно недостъпна поради изчерпан ресурс. Опитайте по-късно.",
      retry_after_seconds: 300,
    };
  }
  return {
    code: "ai_unavailable",
    status: 502,
    message: "Услугата не отговори коректно. Опитайте отново.",
    retry_after_seconds: 30,
  };
}

export const INVALID_OUTPUT: NormalizedGatewayError = {
  code: "ai_invalid_output",
  status: 502,
  message: "Резултатът не издържа проверката за качество. Опитайте отново.",
};

/** Готов Response без нито един байт от тялото на шлюза. */
export function gatewayErrorResponse(
  err: NormalizedGatewayError,
  headers: Record<string, string>,
  extra: Record<string, unknown> = {},
): Response {
  return new Response(
    JSON.stringify({
      error: err.message,
      code: err.code,
      ...(err.retry_after_seconds ? { retry_after_seconds: err.retry_after_seconds } : {}),
      ...extra,
    }),
    { status: err.status, headers: { ...headers, "Content-Type": "application/json" } },
  );
}
