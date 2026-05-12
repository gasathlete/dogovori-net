// Edge function: трайно изтриване на акаунт (GDPR).
// Използва service-role ключа за да изтрие потребителя от auth.users.
// Свързаните данни се изтриват каскадно през ON DELETE CASCADE на user_id колоните.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const cors = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthenticated" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Идентифицираме потребителя по неговия JWT.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "unauthenticated" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Service-role клиент за самото изтриване.
    const admin = createClient(supabaseUrl, serviceKey);

    // Изтриваме потребителски данни (best-effort) — RLS не пречи на service-role.
    // Ако съществуват таблици с FK към auth.users без CASCADE, изтриването на user-а ще се провали.
    const tables = [
      "saved_documents",
      "uploaded_contracts",
      "risk_analyses",
      "contacts",
      "folders",
      "download_quota",
      "profiles",
    ];
    for (const t of tables) {
      try {
        await admin.from(t).delete().eq("user_id", user.id);
      } catch {/* ignore */}
    }
    try { await admin.from("profiles").delete().eq("id", user.id); } catch {/* ignore */}

    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) {
      return new Response(JSON.stringify({ error: delErr.message }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
