/**
 * Служебна (staff-only) проверка на цените в Stripe — САМО четене.
 *
 * Причина за съществуване: ако дори една цена липсва в реалната (live) сметка,
 * плащането не се отваря и клиентът си отива без съобщение, което да обясни
 * защо. Тази функция изброява всички канонични lookup ключове и връща дали
 * цената съществува, дали е активна, сумата, валутата и периода.
 *
 * Не създава, не променя и не изтрива нищо в Stripe и в базата.
 */

import { buildCors } from "../_shared/cors.ts";
import type { StripeEnv } from "../_shared/stripe.ts";
import { readProductIntegrationConfig } from "../_shared/product-integration-config.ts";
import { persistProductOperatorObservation } from "../_shared/product-operator-observation.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/** Всички ключове, по които приложението отваря плащане. */
const LOOKUP_KEYS = [
  "professional_monthly",
  "professional_yearly",
  "entrepreneur_monthly",
  "entrepreneur_yearly",
  "pro_monthly",
  "pro_yearly",
  "team_seat_yearly",
  "five_operations",
  "topup_5",
  "topup_20",
  "topup_50",
  "topup_100",
  "strict_doc_unlock",
  "branding_unlock_once",
  "contract_check_299",
  "contract_improve_399",
  "negotiation_package_799",
] as const;

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ error: "audit_failed" }, 500);
    const admin = createClient(
      url,
      serviceKey,
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthenticated" }, 401);
    const { data: u } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    const userId = u?.user?.id;
    if (!userId) return json({ error: "unauthenticated" }, 401);

    const { data: staff } = await admin.rpc("is_staff", { _user_id: userId });
    if (!staff) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => null);
    const rawEnv = (body as { environment?: unknown } | null)?.environment;
    if (rawEnv !== "sandbox" && rawEnv !== "live") return json({ error: "invalid_environment" }, 400);
    const env: StripeEnv = rawEnv;

    // Служебна read-only диагностика: само булеви стойности и кодове, без тайни.
    if ((body as { readiness_only?: unknown } | null)?.readiness_only === true) {
      const { productIntegrationReadiness } = await import("../_shared/product-integration.ts");
      const readiness = await productIntegrationReadiness(
        readProductIntegrationConfig((key) => Deno.env.get(key)),
        admin as never, admin as never,
      );
      return json({ environment: env, readiness });
    }

    const { createStripeClient } = await import("../_shared/stripe.ts");
    const stripe = createStripeClient(env);
    const rows: Array<Record<string, unknown>> = [];
    for (const key of LOOKUP_KEYS) {
      try {
        const list = await stripe.prices.list({ lookup_keys: [key], limit: 5 });
        const price = list.data.find((p) => p.lookup_key === key && p.active) ?? list.data[0] ?? null;
        rows.push({
          lookup_key: key,
          exists: Boolean(price),
          active: price?.active ?? false,
          amount: price?.unit_amount ?? null,
          currency: price?.currency ?? null,
          interval: price?.recurring?.interval ?? null,
          livemode: price?.livemode ?? null,
        });
      } catch (e) {
        rows.push({ lookup_key: key, exists: false, error: String((e as Error)?.message ?? e).slice(0, 200) });
      }
    }

    const missing = rows.filter((r) => !r.exists).map((r) => r.lookup_key);
    return json({ environment: env, missing, rows });
  } catch (e) {
    console.error("payments-price-audit error", e);
    return json({ error: "audit_failed" }, 500);
  }
});

// Serving starts first; internal observation cannot block public/auth handling.
const observation = persistProductOperatorObservation((name) => Deno.env.get(name))
  .catch(() => console.error("product_operator_observation_failed"));
const runtime = (globalThis as typeof globalThis & { EdgeRuntime?: { waitUntil(work: Promise<unknown>): void } }).EdgeRuntime;
runtime?.waitUntil(observation);
