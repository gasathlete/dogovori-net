// Shared guard against generation/analysis of documents with illegal content.
//
// Разпознаването живее в ЧИСТИЯ лист-модул `illegal-content-detector.ts` и се
// пре-експортира тук, за да останат всички досегашни вносители съвместими.
// Този файл добавя САМО страничния ефект: неутрален запис в
// `restricted_processing_events` и известяване на администратор. Пощата се внася
// СТАТИЧНО — без изчисляван адрес и без преобразуване на типове.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendAppEmail } from "./transactional-email-templates/send-and-log.ts";
import {
  BLOCKED_USER_MESSAGE,
  detectIllegalContent,
  normalizeForIllegalContent,
  type DetectionResult,
  type IllegalCategory,
} from "./illegal-content-detector.ts";

export {
  BLOCKED_USER_MESSAGE,
  detectIllegalContent,
  normalizeForIllegalContent,
  type DetectionResult,
  type IllegalCategory,
};

interface GuardArgs {
  admin: SupabaseClient;
  text: string;
  functionName: string;
  userId: string | null;
  userEmail?: string | null;
  ipHash?: string | null;
  // user-agent is intentionally accepted but NOT persisted
  userAgent?: string | null;
  corsHeaders: Record<string, string>;
}

/**
 * Returns a ready-to-send 403 Response when the content is blocked,
 * or null when it is safe to proceed. Logs ONLY minimal metadata —
 * no raw text excerpt, no matched term (per legal review).
 */
export async function guardIllegalContent(args: GuardArgs): Promise<Response | null> {
  const { admin, text, functionName, userId, userEmail, ipHash, corsHeaders } = args;
  const result = detectIllegalContent(text);
  if (!result.blocked) return null;

  let eventId: string | null = null;
  try {
    const { data } = await admin
      .from("restricted_processing_events")
      .insert({
        user_id: userId,
        user_email: userEmail ?? null,
        ip_hash: ipHash ?? null,
        function_name: functionName,
        category: result.category!,
        event_type: "illegal_content_blocked",
        action: "blocked_before_model_call",
      })
      .select("id")
      .single();
    eventId = data?.id ?? null;
  } catch (e) {
    // Never log payload content in errors.
    console.error("[restricted-processing] insert failed:", (e as Error).message);
  }

  // Fire-and-forget admin alert email(s). Excerpt is NEVER sent.
  const sendAlerts = async () => {
    try {
      const { data: admins } = await admin
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      const adminIds = (admins ?? []).map((r: { user_id: string }) => r.user_id);
      if (adminIds.length === 0) return;

      const recipients: string[] = [];
      for (const id of adminIds) {
        try {
          const { data: u } = await admin.auth.admin.getUserById(id);
          const email = u?.user?.email;
          if (email) recipients.push(email);
        } catch (e) {
          console.error("[restricted-processing] admin lookup failed:", (e as Error).message);
        }
      }

      for (const recipient of recipients) {
        try {
          await sendAppEmail(admin, "illegal-content-alert", recipient, {
            idempotencyKey: `restricted-${eventId ?? crypto.randomUUID()}-${recipient}`,
            templateData: {
              category: result.categoryLabel,
              functionName,
              userEmail: userEmail ?? "(анонимен)",
              userId: userId ?? "—",
              createdAt: new Date().toISOString(),
            },
          });
        } catch (e) {
          console.error("[restricted-processing] email send failed:", (e as Error).message);
        }
      }
    } catch (e) {
      console.error("[restricted-processing] alert pipeline failed:", (e as Error).message);
    }
  };

  // @ts-ignore — EdgeRuntime is a Deno Deploy global, optional.
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(sendAlerts());
  } else {
    sendAlerts().catch((e) => console.error("[restricted-processing]", e.message));
  }

  return new Response(
    JSON.stringify({
      error: BLOCKED_USER_MESSAGE,
      code: "blocked_illegal_content",
      category: result.category,
      categoryLabel: result.categoryLabel,
    }),
    { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

/**
 * Log a special-category detection event (e.g., health/biometric data
 * detected in upload). These are NOT illegal — only restricted from
 * automated AI processing. No raw content is persisted.
 */
export async function logSpecialCategoryEvent(args: {
  admin: SupabaseClient;
  userId: string | null;
  userEmail?: string | null;
  functionName: string;
  categoryCode: "health_data" | "biometric" | "criminal" | "minors" | "political_religious" | "other";
  action?: string;
}): Promise<void> {
  const { admin, userId, userEmail, functionName, categoryCode, action } = args;
  try {
    await admin.from("restricted_processing_events").insert({
      user_id: userId,
      user_email: userEmail ?? null,
      function_name: functionName,
      category: categoryCode,
      event_type: "special_category_detected",
      action: action ?? "blocked_before_model_call",
    });
  } catch (e) {
    console.error("[restricted-processing] special-category insert failed:", (e as Error).message);
  }
}
