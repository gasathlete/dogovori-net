import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors, clientIp, hashIp } from "../_shared/cors.ts";

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const { document_id, expires_in_days } = body as {
      document_id?: string;
      expires_in_days?: number;
    };
    if (!document_id || typeof document_id !== "string") {
      return new Response(JSON.stringify({ error: "document_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const days = Math.min(Math.max(Number(expires_in_days) || 7, 1), 30);

    // Pro guard
    const { data: planRow } = await admin
      .from("download_quota")
      .select("plan, pro_until")
      .eq("user_id", userId)
      .maybeSingle();
    const isPro = !!planRow && (planRow.plan === "pro" ||
      (!!planRow.pro_until && new Date(planRow.pro_until) > new Date()));
    if (!isPro) {
      return new Response(
        JSON.stringify({ error: "pro_required", message: "Споделянето за подпис е достъпно за Pro потребители." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Verify document ownership
    const { data: doc } = await admin
      .from("saved_documents")
      .select("id, user_id, title")
      .eq("id", document_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!doc) {
      return new Response(JSON.stringify({ error: "Document not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const linkToken = generateToken();
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    const { data: link, error: linkErr } = await admin
      .from("shared_links")
      .insert({
        document_id,
        owner_id: userId,
        token: linkToken,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (linkErr) {
      return new Response(JSON.stringify({ error: linkErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await admin.from("audit_log").insert({
      user_id: userId,
      action: "share_link_created",
      target_type: "document",
      target_id: document_id,
      metadata: { token_prefix: linkToken.slice(0, 8), expires_at: expiresAt },
      ip_hash: await hashIp(clientIp(req)),
    });

    return new Response(
      JSON.stringify({ ok: true, token: linkToken, expires_at: expiresAt, link_id: link.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
