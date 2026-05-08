import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors, clientIp, hashIp } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { token, signer_name, signature_data_url } = body as {
      token?: string;
      signer_name?: string;
      signature_data_url?: string;
    };
    if (!token || !signer_name?.trim() || !signature_data_url?.startsWith("data:image/")) {
      return new Response(JSON.stringify({ error: "invalid_input" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (signature_data_url.length > 500_000) {
      return new Response(JSON.stringify({ error: "signature_too_large" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: link } = await admin
      .from("shared_links")
      .select("id, document_id, owner_id, expires_at, signed_at, revoked_at")
      .eq("token", token)
      .maybeSingle();

    if (!link) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (link.revoked_at || new Date(link.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "expired" }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (link.signed_at) {
      return new Response(JSON.stringify({ error: "already_signed" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ipHash = await hashIp(clientIp(req));
    const now = new Date().toISOString();

    const { error: upErr } = await admin
      .from("shared_links")
      .update({
        signed_at: now,
        signed_signature: signature_data_url,
        signer_name: signer_name.trim().slice(0, 120),
        signer_ip_hash: ipHash,
      })
      .eq("id", link.id);

    if (upErr) {
      return new Response(JSON.stringify({ error: upErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await admin.from("audit_log").insert({
      user_id: link.owner_id,
      action: "share_link_signed",
      target_type: "document",
      target_id: link.document_id,
      metadata: { signer_name: signer_name.trim().slice(0, 120) },
      ip_hash: ipHash,
    });

    return new Response(
      JSON.stringify({ ok: true, signed_at: now }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
