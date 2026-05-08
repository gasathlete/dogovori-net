import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      console.error("auth getUser failed:", userErr);
      return new Response(JSON.stringify({ error: "Unauthorized", detail: userErr?.message }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json();
    const { kind, title, payload, source_id, contact_id, saved_document_id } = body as {
      kind: "contract" | "template";
      title: string;
      payload: unknown;
      source_id?: string;
      contact_id?: string;
      saved_document_id?: string;
    };

    if (!["contract", "template"].includes(kind)) {
      return new Response(JSON.stringify({ error: "Invalid kind" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Re-download of an existing saved document is free.
    if (saved_document_id) {
      const { data: existing } = await admin
        .from("saved_documents")
        .select("id, payload, title, kind, user_id")
        .eq("id", saved_document_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!existing) {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ ok: true, payload: existing.payload, title: existing.title, free: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Read quota
    const { data: quota } = await admin
      .from("download_quota")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (!quota) {
      return new Response(JSON.stringify({ error: "Quota row missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isPro =
      quota.plan === "pro" || (quota.pro_until && new Date(quota.pro_until) > new Date());
    const used = kind === "contract" ? quota.contracts_used : quota.templates_used;
    const limit = 1;

    if (!isPro && used >= limit) {
      return new Response(
        JSON.stringify({ error: "quota_exceeded", kind, used, limit }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Find favorites folder
    const { data: fav } = await admin
      .from("folders")
      .select("id")
      .eq("user_id", userId)
      .eq("is_favorites", true)
      .maybeSingle();

    // Save document
    const { data: saved, error: saveErr } = await admin
      .from("saved_documents")
      .insert({
        user_id: userId,
        kind,
        title,
        payload,
        source_id: source_id ?? null,
        contact_id: contact_id ?? null,
        folder_id: fav?.id ?? null,
      })
      .select()
      .single();
    if (saveErr) {
      return new Response(JSON.stringify({ error: saveErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Increment counter (skip for pro)
    if (!isPro) {
      const patch =
        kind === "contract"
          ? { contracts_used: quota.contracts_used + 1 }
          : { templates_used: quota.templates_used + 1 };
      await admin.from("download_quota").update(patch).eq("user_id", userId);
    }

    return new Response(
      JSON.stringify({ ok: true, payload, title, saved_document_id: saved.id, free: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
