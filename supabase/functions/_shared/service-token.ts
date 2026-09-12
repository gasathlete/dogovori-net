/**
 * Единствен източник за разпознаване на service_role повикване.
 *
 * Правило: service_role се доказва САМО с точно, constant-time сравнение на
 * bearer token-а със `SUPABASE_SERVICE_ROLE_KEY`. Никакво декодиране на JWT,
 * никакво доверяване на `role` claim и никакво мрежово auth търсене — service
 * ключът няма `sub` claim, затова GoTrue `/user` винаги отказва.
 */

/** Constant-time сравнение на два низа (по байтове). */
export function timingSafeEqualString(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
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
