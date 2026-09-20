/**
 * ГРАНИЦА НА ДОСТЪПА ДО РЕВИЗИЯТА.
 *
 * - Изключване на проверката за лични данни става САМО по проверен манифест или
 *   по щабно (staff) изключение. Флаг от клиента сам по себе си не е основание.
 * - Ограничението се води по удостоверен потребител, а при липса на вход — по
 *   отпечатъка на съдържанието. Безсрочният манифест НЕ е пропуск за
 *   неограничени платени повиквания: без вход се допуска еднократна ревизия на
 *   един и същ документ за 24 часа.
 */

export function resolveIgnorePersonalData(input: {
  clientFlag: boolean;
  staffOverride: boolean;
  manifestDefersPersonal: boolean;
}): boolean {
  return (input.clientFlag && input.staffOverride) || input.manifestDefersPersonal;
}

export interface ReviewRatePolicy {
  key: string;
  max: number;
  windowSeconds: number;
}

export function reviewRatePolicy(input: {
  userId: string | null;
  manifestContentFingerprint: string | null;
}): ReviewRatePolicy {
  if (input.userId) {
    return { key: `review-document:user:${input.userId}`, max: 20, windowSeconds: 3600 };
  }
  const fp = input.manifestContentFingerprint && input.manifestContentFingerprint.trim()
    ? input.manifestContentFingerprint.trim()
    : "unknown";
  return { key: `review-document:content:${fp}`, max: 1, windowSeconds: 24 * 3600 };
}
