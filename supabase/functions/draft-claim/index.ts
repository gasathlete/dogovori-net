// draft-claim — присвоява анонимна чернова към влезлия потребител.
//
// Извиква се веднага след успешен вход/регистрация. Връща маршрута и
// съдържанието, така че екранът се възстановява точно там, където е спрял
// потребителят — и никога не го изпраща към празен `/account`.
//
// Сигурност:
//  - потребителят се взема от JWT-то в заявката, НИКОГА от тялото;
//  - токенът се сравнява с хеша в базата с постоянно време;
//  - присвояването е атомарно (`claimed_by is null`) → втори claim е отказан;
//  - изтекла чернова се третира като липсваща;
//  - rate limit по потребител.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import {
  hashToken,
  isValidClaimToken,
  isValidDraftId,
  timingSafeEqual,
} from "../_shared/draft-token.ts";

interface Body {
  draft_id?: string;
  claim_token?: string;
}

interface DraftRow {
  id: string;
  token_hash: string;
  flow: string;
  doc_key: string | null;
  route: string;
  payload: Record<string, unknown> | null;
  step_idx: number;
  has_result: boolean;
  claimed_by: string | null;
  saved_doc_id: string | null;
  expires_at: string;
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
    const db = admin();

    // Потребителят идва само от токена в заявката.
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ ok: false, reason: "invalid_token" }, 401);
    const { data: userData } = await db.auth.getUser(jwt);
    const user = userData?.user ?? null;
    if (!user) return json({ ok: false, reason: "invalid_token" }, 401);

    const rl = await checkRateLimit(`draft-claim:${user.id}`, 30, 60);
    if (!rl.ok) return json({ ok: false, reason: "network" }, 429);

    const body = (await req.json().catch(() => ({}))) as Body;
    if (!isValidDraftId(body.draft_id) || !isValidClaimToken(body.claim_token)) {
      return json({ ok: false, reason: "invalid_token" }, 400);
    }

    const { data } = await db
      .from("anonymous_drafts")
      .select(
        "id, token_hash, flow, doc_key, route, payload, step_idx, has_result, claimed_by, saved_doc_id, expires_at",
      )
      .eq("id", body.draft_id)
      .maybeSingle();
    const draft = data as DraftRow | null;
    if (!draft) return json({ ok: false, reason: "expired" }, 404);

    const incoming = await hashToken(body.claim_token);
    if (!timingSafeEqual(draft.token_hash, incoming)) {
      return json({ ok: false, reason: "invalid_token" }, 403);
    }
    if (Date.parse(draft.expires_at) <= Date.now()) {
      return json({ ok: false, reason: "expired" }, 410);
    }

    // Вече присвоена: на същия собственик връщаме съдържанието (идемпотентно),
    // на друг — отказ.
    if (draft.claimed_by && draft.claimed_by !== user.id) {
      return json({ ok: false, reason: "already_claimed" }, 409);
    }

    let savedDocId = draft.saved_doc_id;

    if (!draft.claimed_by) {
      const { data: updated, error: updErr } = await db
        .from("anonymous_drafts")
        .update({ claimed_by: user.id, claimed_at: new Date().toISOString() })
        .eq("id", draft.id)
        .is("claimed_by", null)
        .select("id")
        .maybeSingle();
      if (updErr) return json({ ok: false, reason: "network" }, 500);
      if (!updated) return json({ ok: false, reason: "already_claimed" }, 409);
    }

    // Ако има готов документ — запазваме го в профила (без нова операция:
    // генерирането вече е таксувано в анонимната сесия).
    const payload = (draft.payload ?? {}) as Record<string, unknown>;
    if (draft.has_result && payload.result && !savedDocId) {
      const meta = (payload.meta ?? {}) as Record<string, unknown>;
      const title =
        (typeof meta.customTitle === "string" && meta.customTitle) ||
        (typeof meta.name === "string" && meta.name) ||
        draft.doc_key ||
        "Документ";
      const { data: saved } = await db
        .from("saved_documents")
        .insert({
          user_id: user.id,
          kind: "contract",
          title: String(title).slice(0, 200),
          payload: payload as never,
        })
        .select("id")
        .maybeSingle();
      if (saved?.id) {
        savedDocId = saved.id as string;
        await db.from("anonymous_drafts").update({ saved_doc_id: savedDocId }).eq("id", draft.id);
      }
    }

    return json({
      ok: true,
      route: draft.route,
      flow: draft.flow,
      doc_key: draft.doc_key,
      step_idx: draft.step_idx,
      has_result: draft.has_result,
      payload,
      saved_doc_id: savedDocId,
    });
  } catch (_e) {
    return json({ ok: false, reason: "network" }, 500);
  }
});
