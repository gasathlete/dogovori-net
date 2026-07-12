// One-off admin utility to provision the brandguardian@dogovori.net user with admin role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const email = "brandguardian@dogovori.net";
    const password = "Dogovorinet2026";

    // Try to create; if exists, look up and update password.
    let userId: string | null = null;
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createErr) {
      // Likely already exists — find and update.
      const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
      const existing = list?.users.find((u) => u.email?.toLowerCase() === email);
      if (!existing) {
        return new Response(JSON.stringify({ error: createErr.message }), { status: 500 });
      }
      userId = existing.id;
      await supabase.auth.admin.updateUserById(userId, { password, email_confirm: true });
    } else {
      userId = created.user!.id;
    }

    // Grant admin role (unique on user_id+role).
    await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });

    return new Response(JSON.stringify({ ok: true, user_id: userId }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
