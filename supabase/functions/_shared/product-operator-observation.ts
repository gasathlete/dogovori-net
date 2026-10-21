import { readProductIntegrationConfig, type EnvReader } from "./product-integration-config.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isLegalKnowledgeBaseReady } from "./product-legal-basis.ts";

export const PRODUCT_OPERATOR_BUILD = "product-operator-20261021-v3-9bc9fbd";
export type OperatorProbe = { state: "ready" | "not_ready" | "unknown"; code?: "probe_timeout" | "probe_error" };

/** Unlike a commerce gate, an operational failure is unknown, never false. */
export async function boundedOperatorProbe(run: () => Promise<boolean>, timeoutMs = 8000): Promise<OperatorProbe> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run().then((ready): OperatorProbe => ({ state: ready ? "ready" : "not_ready" })),
      new Promise<OperatorProbe>((resolve) => {
        timer = setTimeout(() => resolve({ state: "unknown", code: "probe_timeout" }), timeoutMs);
      }),
    ]);
  } catch {
    return { state: "unknown", code: "probe_error" };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Service-to-database only. No user impersonation, source text or request fields. */
export async function persistProductOperatorObservation(env: EnvReader): Promise<void> {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const write = async (body: Record<string, unknown>, method: "POST" | "PATCH") => {
    const path = method === "POST" ? "?on_conflict=build_marker" : `?build_marker=eq.${PRODUCT_OPERATOR_BUILD}`;
    const response = await fetch(`${url}/rest/v1/product_operator_observations${path}`, {
      method, headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("operator_write_failed");
  };
  // Persist synchronous config BEFORE any migration/legal probe.
  await write({ build_marker: PRODUCT_OPERATOR_BUILD, observed_at: new Date().toISOString(),
    config: readProductIntegrationConfig(env), migration_probe: { state: "unknown" }, legal_probe: { state: "unknown" } }, "POST");
  const migration = await boundedOperatorProbe(async () => {
    const response = await fetch(`${url}/rest/v1/rpc/product_rollout_capability`, {
      method: "POST", headers, body: "{}", signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) throw new Error("migration_probe_failed");
    const data = await response.json();
    return data?.ok === true && data?.migration === readProductIntegrationConfig(env).expectedMigration;
  });
  await write({ migration_probe: migration }, "PATCH");
  let legalHttpStatus: number | undefined;
  let legalFailure: "database_http_error" | "database_transport_error" | "probe_deadline" | undefined;
  const legal = await boundedOperatorProbe(async () => {
    const signal = AbortSignal.timeout(7000);
    let failed = false;
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: {
      fetch: async (input, init) => {
        try {
          const response = await fetch(input, { ...init, signal });
          if (!response.ok) { failed = true; legalHttpStatus = response.status; legalFailure = "database_http_error"; }
          return response;
        } catch (error) { failed = true; legalFailure = signal.aborted ? "probe_deadline" : "database_transport_error"; throw error; }
      },
    } });
    const ready = await isLegalKnowledgeBaseReady(db as never);
    if (signal.aborted || failed) throw new Error("legal_probe_failed");
    return ready;
  });
  await write({ legal_probe: { ...legal, ...(legalFailure ? { detail_code: legalFailure } : {}),
    ...(legalHttpStatus !== undefined ? { http_status: legalHttpStatus } : {}) } }, "PATCH");
}