import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCors } from "../_shared/cors.ts";
import { createStripeClient } from "../_shared/stripe.ts";
import {
  StaticCatalogError, createStaticCheckout, deliverStaticCatalog, listStaticCatalog, listStaticOrders,
  registerStaticAsset, reviewStaticAsset, staticReadiness, staticRequest, type StaticDeps,
} from "../_shared/static-catalog.ts";

const ASSET_KEYS = ["action", "environment", "productKey", "templateSlug", "sourceRef", "version", "filename", "mimeType", "contentBase64",
  "amountCents", "stripePriceId", "reviewRef", "evidenceNote", "reviewerAttestation"];
const KEYS = ["action", "assetId", "requestId", "environment", "termsAccepted", "immediatePerformanceConsent", "withdrawalLossAcknowledged",
  "orderId", "decision", "reviewRef", "reviewerAttestation"];

Deno.serve(async (req) => {
  const cors = buildCors(req);
  const out = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  const json = (code: string, status: number) => out({ error: code, code }, status);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json("method_not_allowed", 405);
  try {
    const bearer = req.headers.get("Authorization");
    if (!bearer?.startsWith("Bearer ")) return json("unauthorized", 401);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await admin.auth.getUser(bearer.slice(7));
    if (error || !data.user) return json("unauthorized", 401);
    const register = new URL(req.url).searchParams.get("op") === "register";
    // Bounded streaming read: the register body may carry a ≤2 MB file as base64.
    const body = register ? await staticRequest(req, ASSET_KEYS, 2_900_000) : await staticRequest(req, KEYS);
    const deps: StaticDeps = { db: admin, stripe: (env) => createStripeClient(env), env: (k) => Deno.env.get(k) };
    const uid = data.user.id;
    if (register) return body.action === "register_asset" ? out(await registerStaticAsset(deps, uid, body)) : json("invalid_action", 400);
    switch (body.action) {
      case "catalog": return out(await listStaticCatalog(deps, uid, body.environment));
      case "orders": return out(await listStaticOrders(deps, uid, body.orderId));
      case "readiness": return out(await staticReadiness(deps, uid));
      case "review": return out(await reviewStaticAsset(deps, uid, body));
      case "download":
        if (Object.keys(body).some((k) => !["action", "orderId"].includes(k))) return json("invalid_body", 400);
        return await deliverStaticCatalog(deps, uid, body.orderId, cors);
      case "checkout":
        if (Object.hasOwn(body, "orderId")) return json("invalid_body", 400);
        return out(await createStaticCheckout(deps, uid, body));
    }
    return json("invalid_action", 400);
  } catch (e) {
    if (e instanceof StaticCatalogError) return json(e.code, e.status);
    console.error("static_catalog_failed", { name: e instanceof Error ? e.name : "unknown" });
    return json("internal_error", 500);
  }
});
