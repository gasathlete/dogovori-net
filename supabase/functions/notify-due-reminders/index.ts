// Cron-triggered: sends email notifications for document reminders that are due
// (remind_at <= now + 24h, not done, not yet notified). Idempotent via notified_at.
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireServiceRole } from "../_shared/cron-auth.ts";
import { sendAppEmail } from "../_shared/transactional-email-templates/send-and-log.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const denied = await requireServiceRole(req);
  if (denied) return denied;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date();
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  let sent = 0;
  const errors: string[] = [];

  try {
    const { data: due, error } = await admin
      .from("document_reminders")
      .select("id, user_id, saved_document_id, uploaded_contract_id, remind_at, kind, note")
      .is("done_at", null)
      .is("notified_at", null)
      .lte("remind_at", horizon)
      .limit(200);

    if (error) throw error;

    for (const r of (due as any[] | null) ?? []) {
      try {
        // Resolve document title
        let documentTitle: string | null = null;
        if (r.saved_document_id) {
          const { data } = await admin
            .from("saved_documents")
            .select("title")
            .eq("id", r.saved_document_id)
            .maybeSingle();
          documentTitle = (data as any)?.title ?? null;
        } else if (r.uploaded_contract_id) {
          const { data } = await admin
            .from("uploaded_contracts")
            .select("file_name")
            .eq("id", r.uploaded_contract_id)
            .maybeSingle();
          documentTitle = (data as any)?.file_name ?? null;
        }

        const { data: u } = await admin.auth.admin.getUserById(r.user_id);
        const email = u.user?.email ?? null;
        if (!email) {
          // Mark as notified to avoid retrying forever
          await admin.from("document_reminders").update({ notified_at: now.toISOString() }).eq("id", r.id);
          continue;
        }
        const { data: p } = await admin
          .from("profiles")
          .select("display_name")
          .eq("id", r.user_id)
          .maybeSingle();

        const remindOn = new Date(r.remind_at).toLocaleDateString("bg-BG");
        try {
          await sendAppEmail(admin, "reminder-due", email, {
            idempotencyKey: `reminder-due-${r.id}`,
            templateData: {
              name: (p as any)?.display_name ?? null,
              documentTitle,
              kind: r.kind,
              remindOn,
              note: r.note,
            },
          });
        } catch (e) {
          errors.push(`${r.id}: ${(e as Error).message}`);
          continue;
        }
        await admin
          .from("document_reminders")
          .update({ notified_at: now.toISOString() })
          .eq("id", r.id);
        sent++;
      } catch (e) {
        errors.push(`${r.id}: ${(e as Error).message}`);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notify-due-reminders error", e);
    return new Response(JSON.stringify({ ok: false, error: "internal_error", sent }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
