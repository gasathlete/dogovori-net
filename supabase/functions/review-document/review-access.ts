/**
 * ГРАНИЦА НА ДОСТЪПА ДО РЕВИЗИЯТА.
 *
 * - Изключване на проверката за лични данни става САМО по проверен манифест или
 *   по щабно (staff) изключение. Флаг от клиента сам по себе си не е основание.
 * - ОТОРИЗАЦИЯТА е в `review-authorization.ts` (проверен собственик или
 *   еднократен сървърен пропуск). Тук остава САМО ограничителят за
 *   натоварване, който НЕ е оторизация и никога не разрешава достъп.
 */

export function resolveIgnorePersonalData(input: {
  clientFlag: boolean;
  staffOverride: boolean;
  manifestDefersPersonal: boolean;
}): boolean {
  return (input.clientFlag && input.staffOverride) || input.manifestDefersPersonal;
}

export interface ReviewAbusePolicy {
  key: string;
  max: number;
  windowSeconds: number;
}

/**
 * Ограничител за натоварване за ВЕЧЕ ОТОРИЗИРАН собственик. Манифестът и
 * отпечатъкът на съдържанието вече НЕ са ключ за достъп.
 */
export function reviewAbusePolicy(input: { ownerId: string | null }): ReviewAbusePolicy {
  const owner = input.ownerId && input.ownerId.trim() ? input.ownerId.trim() : "unbound";
  return { key: `review-document:owner:${owner}`, max: 20, windowSeconds: 3600 };
}
