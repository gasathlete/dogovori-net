/**
 * Една ограничена, детерминирана грешка за всички AI входни точки, когато
 * строгата правна проверка не е налична.
 *
 * Правила:
 *   * връща се ПРЕДИ основния модел и ПРЕДИ всякаква промяна на квотата;
 *   * не изтича нищо вътрешно — доставчик, източник, идентификатори;
 *   * съобщението е на български и казва истината: заявката и документът са
 *     запазени, нищо не е удържано, може да се опита отново.
 */

export const LEGAL_VERIFICATION_UNAVAILABLE = "legal_verification_unavailable";

/** Ограничен интервал за повторен опит (секунди). */
export const LEGAL_RETRY_AFTER_SECONDS = 900;

export const LEGAL_VERIFICATION_MESSAGE_BG =
  "Проверката на правната основа е временно недостъпна, затова не изпълняваме заявката. " +
  "Въведеното и документът са запазени, не е използвана квота и няма плащане. " +
  "Опитайте отново по-късно.";

export interface LegalGateResponseInit {
  readonly headers?: Record<string, string>;
  readonly retryAfterSeconds?: number;
}

export function legalVerificationUnavailableBody() {
  return {
    error: LEGAL_VERIFICATION_MESSAGE_BG,
    code: LEGAL_VERIFICATION_UNAVAILABLE,
    retryable: true as const,
    charged: false as const,
    saved: true as const,
  };
}

export function legalVerificationUnavailableResponse(
  init: LegalGateResponseInit = {},
): Response {
  const retryAfter = Math.max(
    1,
    Math.min(3600, Math.trunc(init.retryAfterSeconds ?? LEGAL_RETRY_AFTER_SECONDS)),
  );
  return new Response(JSON.stringify(legalVerificationUnavailableBody()), {
    status: 503,
    headers: {
      ...(init.headers ?? {}),
      "Content-Type": "application/json",
      "Retry-After": String(retryAfter),
    },
  });
}
