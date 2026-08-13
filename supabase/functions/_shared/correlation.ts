/**
 * Correlation ID — един идентификатор от клиентската заявка до repair стъпката.
 *
 * Приема се от заглавка (x-correlation-id / x-request-id) или се генерира.
 * Връща се в отговорите (и особено при грешки), за да може даден дефект да се
 * проследи в Server Logs и в /admin/ai-json.
 */

export const CORRELATION_HEADER = "x-correlation-id";

function uuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `cid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** Извлича (или създава) correlation ID за текущата заявка. */
export function getCorrelationId(req: Request): string {
  const raw =
    req.headers.get(CORRELATION_HEADER) ??
    req.headers.get("x-request-id") ??
    req.headers.get("cf-ray") ??
    "";
  const clean = raw.trim().slice(0, 100).replace(/[^\w.:-]/g, "");
  return clean || uuid();
}

/** Заглавки, които да се добавят към всеки отговор. */
export function correlationHeaders(cid: string): Record<string, string> {
  return { [CORRELATION_HEADER]: cid };
}

/** JSON тяло за грешка, обогатено с correlation ID. */
export function errorBody(message: string, cid: string, extra?: Record<string, unknown>) {
  return JSON.stringify({ error: message, correlation_id: cid, ...(extra ?? {}) });
}
