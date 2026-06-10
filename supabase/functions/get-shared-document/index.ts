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
      .select("id, document_id, uploaded_contract_id, owner_id, expires_at, viewed_at, signed_at, signer_name, revoked_at, signed_pdf_path")
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

    let payloadResp: Record<string, unknown> = {};
    let kind = "contract";
    let title = "";
    let targetId: string | null = null;
    let targetType = "document";

    if (link.uploaded_contract_id) {
      const { data: uc } = await admin
        .from("uploaded_contracts")
        .select("id, title, source, storage_path, mime_type, extracted_text")
        .eq("id", link.uploaded_contract_id)
        .maybeSingle();
      if (!uc) {
        return new Response(JSON.stringify({ error: "document_missing" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      title = uc.title;
      kind = "uploaded";
      targetId = uc.id;
      targetType = "uploaded_contract";

      let original_url: string | null = null;
      if (uc.storage_path) {
        const { data: signed } = await admin.storage
          .from("user-contracts")
          .createSignedUrl(uc.storage_path, 60 * 60);
        original_url = signed?.signedUrl ?? null;
      }
      let signed_pdf_url: string | null = null;
      if (link.signed_pdf_path) {
        const { data: s } = await admin.storage
          .from("user-contracts")
          .createSignedUrl(link.signed_pdf_path, 60 * 60);
        signed_pdf_url = s?.signedUrl ?? null;
      }
      payloadResp = {
        source: uc.source,
        mime_type: uc.mime_type,
        original_url,
        signed_pdf_url,
        extracted_text: uc.source === "paste" ? uc.extracted_text : null,
      };
    } else {
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
      title = doc.title;
      kind = doc.kind;
      targetId = doc.id;
      payloadResp = { payload: doc.payload };
    }

    // Mark first view
    if (!link.viewed_at) {
      await admin.from("shared_links")
        .update({ viewed_at: new Date().toISOString() })
        .eq("id", link.id);
      await admin.from("audit_log").insert({
        user_id: link.owner_id,
        action: "share_link_viewed",
        target_type: targetType,
        target_id: targetId,
        ip_hash: await hashIp(clientIp(req)),
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        title,
        kind,
        ...payloadResp,
        signed_at: link.signed_at,
        signer_name: link.signer_name,
        expires_at: link.expires_at,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("edge function error", e);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
