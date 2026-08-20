// Shared CORS handling with allowlist for production domains.
// Edge functions should use buildCors(req) instead of `Access-Control-Allow-Origin: *`.

const ALLOWED_ORIGINS = new Set([
  "https://dogovori.net",
  "https://www.dogovori.net",
  "https://contract-architect-ai.lovable.app",
  "https://id-preview--6b2da12e-e1d6-4f97-8549-b632fb66ddd1.lovable.app",
  "http://localhost:8080",
]);

const ALLOWED_HOST_SUFFIXES = [".lovable.app", ".lovableproject.com", ".lovable.dev"];

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
      if (ALLOWED_HOST_SUFFIXES.some((s) => host.endsWith(s))) allow = origin;
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
