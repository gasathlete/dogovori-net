// Public lookup by signer's sign_token. Returns envelope + this signer's metadata.
// Also marks the signer as "viewed" on first GET.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors, clientIp, hashIp } from "../_shared/cors.ts";

serve(async (req) => {
  const cors = buildCors(req, "POST, OPTIONS");
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { token } = await req.json().catch(() => ({}));
    if (!token || typeof token !== "string") {
      return new Response(JSON.stringify({ error: "invalid_token" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: signer } = await admin.from("signing_request_signers")
      .select("*").eq("sign_token", token).maybeSingle();
    if (!signer) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const { data: env } = await admin.from("signing_requests")
      .select("id, title, document_snapshot, status, order_mode, expires_at, completed_at, owner_id, created_at")
      .eq("id", signer.request_id).maybeSingle();
    if (!env) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const { data: peers } = await admin.from("signing_request_signers")
      .select("id, name, role, order_idx, status, signed_at")
      .eq("request_id", env.id).order("order_idx");

    // Mark viewed once
    if (!signer.viewed_at) {
      await admin.from("signing_request_signers")
        .update({ viewed_at: new Date().toISOString(), status: signer.status === "pending" ? "viewed" : signer.status })
        .eq("id", signer.id);
      await admin.from("signing_audit_events").insert({
        request_id: env.id,
        signer_id: signer.id,
        event_type: "signer_viewed",
        ip_hash: await hashIp(clientIp(req)),
        user_agent: req.headers.get("user-agent") ?? null,
      });
    }

    // For sequential mode, indicate whether it's this signer's turn
    let canSignNow = true;
    if (env.order_mode === "sequential") {
      const prior = (peers ?? []).filter((p: any) => p.order_idx < signer.order_idx);
      canSignNow = prior.every((p: any) => p.status === "signed");
    }

    return new Response(JSON.stringify({
      ok: true,
      envelope: env,
      signer: {
        id: signer.id,
        name: signer.name,
        email: signer.email,
        role: signer.role,
        order_idx: signer.order_idx,
        status: signer.status,
        signed_at: signer.signed_at,
        declined_at: signer.declined_at,
      },
      peers: peers ?? [],
      can_sign_now: canSignNow,
      expired: new Date(env.expires_at) < new Date(),
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
