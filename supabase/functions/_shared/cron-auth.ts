// Shared helper: enforces that cron-only endpoints can only be invoked
// by callers presenting the service_role key (pg_cron uses the service role
// key from vault). Returns null on success, or a Response to short-circuit.
//
// IMPORTANT: never call auth.getUser()/getClaims() with a service_role token —
// a service_role JWT has no `sub` claim, so the GoTrue /user lookup answers
// 403 bad_jwt "invalid claim: missing sub claim" and every cron run is denied.
// We compare the bearer token with the configured service role key directly
// (constant time) and additionally accept a locally decoded service_role JWT.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
}

function decodeRole(token: string): string | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
    const claims = JSON.parse(json) as { role?: string };
    return typeof claims.role === "string" ? claims.role : null;
  } catch {
    return null;
  }
}

export function requireServiceRole(req: Request): Response | null {
  const forbidden = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return forbidden(401, "unauthorized");

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  // Fail closed if the key is not configured.
  if (!serviceKey) return forbidden(403, "forbidden");

  if (timingSafeEqual(token, serviceKey)) return null;
  // Legacy/rotated service_role JWTs: accept only when the role claim matches.
  if (decodeRole(token) === "service_role" && decodeRole(serviceKey) === "service_role") {
    return null;
  }
  return forbidden(403, "forbidden");
}
