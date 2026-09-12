// Shared helper: enforces that cron-only endpoints can only be invoked by an
// authorized operational caller. Two accepted paths, in this exact order:
//
//   1. The bearer token is byte-identical to SUPABASE_SERVICE_ROLE_KEY
//      (constant-work comparison, no network, no RPC).
//   2. The bearer token is exactly 64 lowercase hex characters — the dedicated
//      internal cron credential — and public.verify_internal_cron_secret
//      confirms it via a service-role client.
//
// IMPORTANT: never call auth.getUser()/getClaims() with a service_role token —
// a service_role JWT has no `sub` claim, so the GoTrue /user lookup answers
// 403 bad_jwt "invalid claim: missing sub claim" and every cron run is denied.
// Role claims are never decoded or trusted. Everything fails closed.

import { bearerToken, isExactServiceRoleToken } from "./service-token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Точен формат на посветения cron ключ: 64 малки шестнайсетични символа. */
export const DEDICATED_CRON_SECRET_PATTERN = /^[0-9a-f]{64}$/;

/** Единственото позволено DB извикване преди no-op отговора. */
export const INTERNAL_CRON_VERIFIER_RPC = "verify_internal_cron_secret";

export interface CronAuthDeps {
  serviceKey: string | null | undefined;
  /** Проверява посветения ключ през public.verify_internal_cron_secret. */
  verifyDedicated?: (candidate: string) => Promise<boolean>;
}

export function isDedicatedCronCandidate(token: string): boolean {
  return DEDICATED_CRON_SECRET_PATTERN.test(token);
}

function deny(status: 401 | 403, error: "unauthorized" | "forbidden"): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Чиста, тестваема логика. Връща null при успех или Response за отказ.
 * Точният service ключ НИКОГА не стига до verifyDedicated.
 */
export async function authorizeCronRequest(
  deps: CronAuthDeps,
  token: string,
): Promise<Response | null> {
  if (!token) return deny(401, "unauthorized");

  if (isExactServiceRoleToken(token, deps.serviceKey)) return null;

  if (!isDedicatedCronCandidate(token)) return deny(403, "forbidden");
  if (!deps.verifyDedicated) return deny(403, "forbidden");

  try {
    const ok = await deps.verifyDedicated(token);
    return ok === true ? null : deny(403, "forbidden");
  } catch {
    return deny(403, "forbidden");
  }
}

/**
 * Извиква верификатора само когато токенът вече е валиден кандидат, затова
 * пътят с точния service ключ остава напълно без мрежа и без клиент.
 */
async function verifyDedicatedViaRpc(candidate: string): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) return false;
  const { createClient } = await import("npm:@supabase/supabase-js@2");
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.rpc(INTERNAL_CRON_VERIFIER_RPC, {
    _candidate: candidate,
  });
  if (error) throw error;
  return data === true;
}

/** Async guard за cron endpoint-ите. null = разрешено. */
export function requireServiceRole(req: Request): Promise<Response | null> {
  return authorizeCronRequest(
    {
      serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      verifyDedicated: verifyDedicatedViaRpc,
    },
    bearerToken(req),
  );
}
