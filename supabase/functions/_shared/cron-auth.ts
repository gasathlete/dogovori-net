// Shared helper: enforces that cron-only endpoints can only be invoked
// by callers presenting the service_role key (pg_cron uses the service role
// key from vault). Returns null on success, or a Response to short-circuit.
//
// IMPORTANT: never call auth.getUser()/getClaims() with a service_role token —
// a service_role JWT has no `sub` claim, so the GoTrue /user lookup answers
// 403 bad_jwt "invalid claim: missing sub claim" and every cron run is denied.
// We compare the bearer token with the configured service role key directly
// (constant time). No network auth lookup is performed.

import { bearerToken, isExactServiceRoleToken } from "./service-token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function requireServiceRole(req: Request): Response | null {
  const forbidden = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const token = bearerToken(req);
  if (!token) return forbidden(401, "unauthorized");

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  // Fail closed if the key is not configured.
  if (!serviceKey) return forbidden(403, "forbidden");

  if (isExactServiceRoleToken(token, serviceKey)) return null;
  return forbidden(403, "forbidden");
}
