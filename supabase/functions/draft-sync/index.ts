// draft-sync — създава/обновява анонимна чернова на документ.
//
// Защо: анонимният потребител губеше отговорите и генерирания резултат при
// вход/регистрация (нов таб от имейл линка, OAuth пренасочване, друг браузър).
// Съдържанието се пази тук, а в браузъра остава само указател без лични данни.
//
// Достъпът до `public.anonymous_drafts` е само през service role — заявката се
// оторизира с `draft_id` + `claim_token` (хеширан в базата), не с JWT.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors, clientIp, hashIp } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import {
  ANON_DRAFT_TTL_MS,
  generateClaimToken,
  hashToken,
  isSafeRoute,
  isValidClaimToken,
  isValidDraftId,
  isValidFlow,
  payloadTooLarge,
  timingSafeEqual,
} from "../_shared/draft-token.ts";

interface Body {
  draft_id?: string;
  claim_token?: string;
  flow?: string;
  doc_key?: string | null;
  route?: string;
  step_idx?: number;
  has_result?: boolean;
  payload?: Record<string, unknown>;
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

Deno.serve(async (req) => {
  const cors = buildCors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  try {
    const body = (await req.json().catch(() => ({}))) as Body;

    if (!isValidFlow(body.flow)) return json({ error: "invalid flow" }, 400);
    if (!isSafeRoute(body.route)) return json({ error: "invalid route" }, 400);
    if (payloadTooLarge(body.payload)) return json({ error: "payload too large" }, 413);

    const ipKey = await hashIp(clientIp(req));
    const rl = await checkRateLimit(`draft-sync:${ipKey}`, 120, 60);
    if (!rl.ok) return json({ error: "rate_limited" }, 429);

    const db = admin();
    const expiresAt = new Date(Date.now() + ANON_DRAFT_TTL_MS).toISOString();
    const row = {
      flow: body.flow,
      doc_key: typeof body.doc_key === "string" ? body.doc_key.slice(0, 200) : null,
      route: body.route,
      step_idx: Number.isFinite(body.step_idx) ? Math.max(0, Math.trunc(body.step_idx as number)) : 0,
      has_result: !!body.has_result,
      payload: body.payload ?? {},
      expires_at: expiresAt,
    };

    // Обновяване на съществуваща чернова — само с валиден токен.
    if (isValidDraftId(body.draft_id) && isValidClaimToken(body.claim_token)) {
      const { data: existing } = await db
        .from("anonymous_drafts")
        .select("id, token_hash, expires_at, claimed_by")
        .eq("id", body.draft_id)
        .maybeSingle();

      const incoming = await hashToken(body.claim_token);
      if (
        existing &&
        typeof existing.token_hash === "string" &&
        timingSafeEqual(existing.token_hash, incoming) &&
        Date.parse(existing.expires_at as string) > Date.now()
      ) {
        const { error } = await db
          .from("anonymous_drafts")
          .update(row)
          .eq("id", body.draft_id);
        if (error) return json({ error: "update_failed" }, 500);
        return json({ draft_id: body.draft_id, expires_at: expiresAt });
      }
      // Невалиден/изтекъл токен → не разкриваме нищо, създаваме нова чернова.
    }

    const token = generateClaimToken();
    const { data: created, error } = await db
      .from("anonymous_drafts")
      .insert({ ...row, token_hash: await hashToken(token) })
      .select("id, expires_at")
      .single();
    if (error || !created) return json({ error: "insert_failed" }, 500);

    return json({ draft_id: created.id, claim_token: token, expires_at: created.expires_at });
  } catch (_e) {
    return json({ error: "unexpected" }, 500);
  }
});
