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
    const { document_id, uploaded_contract_id, expires_in_days, password } = body as {
      document_id?: string;
      uploaded_contract_id?: string;
      expires_in_days?: number;
      password?: string;
    };
    const isUploaded = !!uploaded_contract_id && typeof uploaded_contract_id === "string";
    const isDocument = !!document_id && typeof document_id === "string";
    if (isUploaded === isDocument) {
      return new Response(JSON.stringify({ error: "exactly_one_target_required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const days = Math.min(Math.max(Number(expires_in_days) || 7, 1), 30);

    // Paid-plan guard
    const { data: planRow } = await admin
      .from("download_quota")
      .select("plan, pro_until")
      .eq("user_id", userId)
      .maybeSingle();
    const isPro = !!planRow && (planRow.plan === "pro" ||
      (!!planRow.pro_until && new Date(planRow.pro_until) > new Date()));
    if (!isPro) {
      return new Response(
        JSON.stringify({ error: "pro_required", message: "Споделянето за подпис е достъпно за платени индивидуални планове." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let targetTitle = "";
    if (isDocument) {
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
      targetTitle = doc.title;
    } else {
      const { data: uc } = await admin
        .from("uploaded_contracts")
        .select("id, user_id, title")
        .eq("id", uploaded_contract_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!uc) {
        return new Response(JSON.stringify({ error: "Document not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      targetTitle = uc.title;
    }

    const linkToken = generateToken();
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    // Optional password protection
    let password_hash: string | null = null;
    let password_salt: string | null = null;
    if (typeof password === "string" && password.length > 0) {
      if (password.length < 4 || password.length > 128) {
        return new Response(
          JSON.stringify({ error: "invalid_password", message: "Паролата трябва да е между 4 и 128 символа." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const saltBytes = new Uint8Array(16);
      crypto.getRandomValues(saltBytes);
      password_salt = Array.from(saltBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
      const enc = new TextEncoder().encode(password_salt + password);
      const digest = await crypto.subtle.digest("SHA-256", enc);
      password_hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }

    const { data: link, error: linkErr } = await admin
      .from("shared_links")
      .insert({
        document_id: isDocument ? document_id : null,
        uploaded_contract_id: isUploaded ? uploaded_contract_id : null,
        owner_id: userId,
        token: linkToken,
        expires_at: expiresAt,
        password_hash,
        password_salt,
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
      target_type: isUploaded ? "uploaded_contract" : "document",
      target_id: isUploaded ? uploaded_contract_id! : document_id!,
      metadata: { token_prefix: linkToken.slice(0, 8), expires_at: expiresAt, password_protected: !!password_hash },
      ip_hash: await hashIp(clientIp(req)),
    });

    return new Response(
      JSON.stringify({ ok: true, token: linkToken, expires_at: expiresAt, link_id: link.id, password_protected: !!password_hash }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
