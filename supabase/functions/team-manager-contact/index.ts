// Team plan support request -> account manager mailbox.
// Auth: requires Bearer JWT; sender must be a member of the given team.
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCors } from "../_shared/cors.ts";
import { sendAppEmail } from "../_shared/transactional-email-templates/send-and-log.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = userData?.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const teamId = typeof body?.teamId === "string" ? body.teamId : "";
    const contactEmail = typeof body?.contactEmail === "string" ? body.contactEmail.trim() : "";
    const contactName = typeof body?.contactName === "string" ? body.contactName.slice(0, 120) : "";
    const subjectText = typeof body?.subject === "string" ? body.subject.trim().slice(0, 200) : "";
    const message = typeof body?.message === "string" ? body.message.trim().slice(0, 5000) : "";
    const urgency = ["normal", "high", "incident"].includes(String(body?.urgency)) ? String(body?.urgency) : "normal";

    if (!teamId || !contactEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail) || !subjectText || !message) {
      return json({ error: "Невалидни данни" }, 400);
    }

    const { data: member } = await admin
      .from("team_members")
      .select("id")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) return json({ error: "Forbidden" }, 403);

    const { data: team } = await admin.from("teams").select("name").eq("id", teamId).maybeSingle();

    await sendAppEmail(admin, "team-manager-contact", "team@dogovori.net", {
      replyTo: contactEmail,
      templateData: {
        teamId,
        teamName: (team as { name?: string } | null)?.name ?? "—",
        contactName,
        contactEmail,
        urgency,
        subjectText,
        message,
      },
    });

    return json({ ok: true });
  } catch (e) {
    console.error("[team-manager-contact]", (e as Error).message);
    return json({ error: "Грешка при изпращане" }, 500);
  }
});
