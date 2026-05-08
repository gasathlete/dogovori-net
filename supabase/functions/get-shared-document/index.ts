import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors, clientIp, hashIp } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = buildCors(req, "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let token = url.searchParams.get("token");
    if (!token && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      token = (body as { token?: string }).token ?? null;
    }
    if (!token || token.length < 16) {
      return new Response(JSON.stringify({ error: "invalid_token" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: link } = await admin
      .from("shared_links")
      .select("id, document_id, owner_id, expires_at, viewed_at, signed_at, signer_name, revoked_at")
      .eq("token", token)
      .maybeSingle();

    if (!link) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (link.revoked_at) {
      return new Response(JSON.stringify({ error: "revoked" }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (new Date(link.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "expired" }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: doc } = await admin
      .from("saved_documents")
      .select("id, title, kind, payload")
      .eq("id", link.document_id)
      .maybeSingle();
    if (!doc) {
      return new Response(JSON.stringify({ error: "document_missing" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark first view
    if (!link.viewed_at) {
      await admin.from("shared_links")
        .update({ viewed_at: new Date().toISOString() })
        .eq("id", link.id);
      await admin.from("audit_log").insert({
        user_id: link.owner_id,
        action: "share_link_viewed",
        target_type: "document",
        target_id: link.document_id,
        ip_hash: await hashIp(clientIp(req)),
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        title: doc.title,
        kind: doc.kind,
        payload: doc.payload,
        signed_at: link.signed_at,
        signer_name: link.signer_name,
        expires_at: link.expires_at,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
