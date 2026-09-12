/**
 * Единствен източник за разпознаване на service_role повикване.
 *
 * Правило: service_role се доказва САМО с точно, constant-time сравнение на
 * bearer token-а със `SUPABASE_SERVICE_ROLE_KEY`. Никакво декодиране на JWT,
 * никакво доверяване на `role` claim и никакво мрежово auth търсене — service
 * ключът няма `sub` claim, затова GoTrue `/user` винаги отказва.
 */

/**
 * Сравнение на два низа по байтове с постоянна работа спрямо конфигурирания
 * ключ (`b`): няма ранно връщане при различна дължина. Акумулаторът стартира с
 * разликата в дължините, а липсващите байтове на кандидата се броят като 0,
 * затова цикълът винаги обхожда цялата дължина на ключа.
 * Минава само при точно еднакви байтове.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const candidate = enc.encode(a);
  const configured = enc.encode(b);
  let diff = candidate.length ^ configured.length;
  for (let i = 0; i < configured.length; i++) {
    const c = i < candidate.length ? candidate[i] : 0;
    diff |= c ^ configured[i];
  }
  return diff === 0;
}

/** Извлича bearer token от Authorization header. Празен низ, ако липсва. */
export function bearerToken(req: Request): string {
  const header = req.headers.get("Authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

/**
 * true САМО когато ключът е конфигуриран и token-ът е точно той.
 * Fail-closed при липсващ ключ или празен token.
 */
export function isExactServiceRoleToken(
  token: string | null | undefined,
  serviceKey: string | null | undefined,
): boolean {
  if (!token || !serviceKey) return false;
  return timingSafeEqualString(token, serviceKey);
}
