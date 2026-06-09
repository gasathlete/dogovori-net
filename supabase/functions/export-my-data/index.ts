// GDPR art. 15 / 20 — пълно копие на личните данни на потребителя в JSON.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors, clientIp, hashIp } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

Deno.serve(async (req) => {
  const cors = buildCors(req, "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthenticated" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user) {
      return new Response(JSON.stringify({ error: "unauthenticated" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Rate-limit: max 3 exports / 24h per user
    const ipKey = await hashIp(clientIp(req));
    const rl = await checkRateLimit(`export-data:${user.id}:${ipKey}`, 3, 24 * 60 * 60);
    if (!rl.ok) {
      return new Response(JSON.stringify({ error: "rate_limited", retry_after_s: rl.retry_after_s }), {
        status: 429, headers: { ...cors, "Content-Type": "application/json", "Retry-After": String(rl.retry_after_s) },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const uid = user.id;

    const tables = [
      "profiles", "download_quota", "folders", "contacts",
      "saved_documents", "uploaded_contracts", "risk_analyses",
      "deals", "document_kits", "document_kit_items",
      "user_consents", "notifications", "ai_audit_log",
      "shared_links", "signing_requests", "assistant_threads", "assistant_messages",
    ];

    const dump: Record<string, unknown> = {
      exported_at: new Date().toISOString(),
      user: { id: uid, email: user.email, created_at: user.created_at },
    };

    for (const t of tables) {
      try {
        const col = t === "profiles" ? "id" : "user_id";
        const { data } = await admin.from(t).select("*").eq(col, uid);
        dump[t] = data ?? [];
      } catch {
        dump[t] = [];
      }
    }

    return new Response(JSON.stringify(dump, null, 2), {
      headers: {
        ...cors,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="dogovori-export-${uid}.json"`,
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
