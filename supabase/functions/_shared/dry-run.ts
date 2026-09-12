/**
 * Общ, безсъстоятелен помощник за authenticated no-write dry-run проба.
 *
 * Правила:
 *  - Няма зависимости и няма достъп до средата (`Deno.env`).
 *  - Активира се САМО от JSON тяло с булев `true` за `dry_run`.
 *    Липсващо тяло, невалиден JSON, `"true"`, `1` и `false` НЕ активират.
 *  - Тялото се чете от `req.clone()`, затова оригиналният `req` остава четим.
 *  - Отговорът е чист no-op: без идентификатори, имена, имейли, документи или броячи.
 */

export async function isDryRunRequest(req: Request): Promise<boolean> {
  let parsed: unknown;
  try {
    parsed = await req.clone().json();
  } catch {
    return false;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return false;
  return (parsed as Record<string, unknown>).dry_run === true;
}

export function dryRunResponse(functionName: string, headers: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      dry_run: true,
      side_effects: false,
      function: functionName,
    }),
    { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
  );
}
