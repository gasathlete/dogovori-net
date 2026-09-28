// Shared CORS handling with allowlist for production domains.
// Edge functions should use buildCors(req) instead of `Access-Control-Allow-Origin: *`.

const ALLOWED_ORIGINS = new Set([
  "https://dogovori.net",
  "https://www.dogovori.net",
  "https://contract-architect-ai.lovable.app",
  "https://id-preview--6b2da12e-e1d6-4f97-8549-b632fb66ddd1.lovable.app",
  "https://dogovori-net.lovable.app",
  "http://localhost:8080",
]);

/**
 * Само хостове на ТОЗИ проект (preview/sandbox варианти), не всеки
 * *.lovable.app / *.lovable.dev — иначе чужд проект би получил CORS достъп.
 */
const PROJECT_ID = "6b2da12e-e1d6-4f97-8549-b632fb66ddd1";
export function isProjectPreviewHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === `${PROJECT_ID}.lovableproject.com`) return true;
  if (h.endsWith(".lovable.app")) {
    const label = h.slice(0, -".lovable.app".length);
    return !label.includes(".") && (label === PROJECT_ID || label.endsWith(`--${PROJECT_ID}`));
  }
  return false;
}

// ВАЖНО: `x-correlation-id` се изпраща от всяка клиентска заявка
// (src/lib/invokeEdgeFunction.ts). Ако липсва тук, preflight-ът се отхвърля и
// браузърът връща „Failed to send a request to the Edge Function".
const ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-correlation-id, x-request-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

export function buildCors(req: Request, methods = "POST, OPTIONS") {
  const origin = req.headers.get("origin") ?? "";
  let allow = "";
  if (ALLOWED_ORIGINS.has(origin)) {
    allow = origin;
  } else {
    try {
      const host = new URL(origin).host;
      if (new URL(origin).protocol === "https:" && isProjectPreviewHost(host)) allow = origin;
    } catch {
      // ignore invalid origins
    }
  }
  // Fallback to canonical domain so the browser still sees a valid header
  if (!allow) allow = "https://dogovori.net";

  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Allow-Methods": methods,
    "Vary": "Origin",
  };
}

/** Липсващ ключ = недостъпна инфраструктура за идентичност, не разрешение. */
export class IdentityUnavailableError extends Error {
  constructor() {
    super("identity_unavailable");
    this.name = "IdentityUnavailableError";
  }
}

/**
 * Идентичност за безплатни права (анонимен чат): изисква ОТДЕЛЕН сървърен ключ.
 * Без ключ не се издава идентичност и не се консумира право.
 */
export async function hashAnonIdentity(
  ip: string,
  env: { get(name: string): string | undefined } = Deno.env,
): Promise<string> {
  const secret = env.get("ANON_IDENTITY_SECRET");
  if (typeof secret !== "string" || secret.trim().length < 16) {
    throw new IdentityUnavailableError();
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`anon-identity|${ip}`));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

/** Само за одитни записи (не носи права). */
export async function hashIp(ip: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(ip + "|dogovori-salt"),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  return (
    fwd.split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    "anon"
  );
}
