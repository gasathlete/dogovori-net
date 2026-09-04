// draft-claim — присвоява анонимна чернова към влезлия потребител.
//
// Извиква се веднага след успешен вход/регистрация. Връща маршрута и
// съдържанието, така че екранът се възстановява точно там, където е спрял
// потребителят — и никога не го изпраща към празен `/account`.
//
// Сигурност (правилата са в `_shared/draft-auth.ts`):
//  - потребителят се взема от JWT-то в заявката, НИКОГА от тялото;
//  - токенът се сравнява с хеша в базата с постоянно време;
//  - присвояването е атомарно (`claimed_by is null`) → втори claim е отказан;
//  - след claim токенът се ротира: старият указател в браузъра не важи повече;
//  - изтекла чернова се третира като липсваща;
//  - готовият документ се прехвърля в `saved_documents`, а съдържанието в
//    черновата се изтрива — остават само метаданни за идемпотентност;
//  - rate limit по потребител.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import {
  CLAIMED_DRAFT_TTL_MS,
  generateClaimToken,
  hashToken,
  isValidClaimToken,
  isValidDraftId,
} from "../_shared/draft-token.ts";
import {
  decideClaim,
  hasRestorableContent,
  logDraft,
  REASON_STATUS,
  rowAfterTransfer,
  type DraftErrorReason,
} from "../_shared/draft-auth.ts";

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
  const fail = (reason: DraftErrorReason) => {
    logDraft("draft-claim", { reason, status: REASON_STATUS[reason] });
    return json({ ok: false, reason }, REASON_STATUS[reason]);
  };

  try {
    const db = admin();

    // Потребителят идва само от токена в заявката.
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return fail("unauthorized");
    const { data: userData } = await db.auth.getUser(jwt);
    const user = userData?.user ?? null;
    if (!user) return fail("unauthorized");

    const rl = await checkRateLimit(`draft-claim:${user.id}`, 30, 60);
    if (!rl.ok) return fail("rate_limited");

    const body = (await req.json().catch(() => ({}))) as Body;
    if (!isValidDraftId(body.draft_id)) return fail("invalid_request");

    const { data, error: readErr } = await db
      .from("anonymous_drafts")
      .select(
        "id, token_hash, flow, doc_key, route, payload, step_idx, has_result, claimed_by, saved_doc_id, expires_at",
      )
      .eq("id", body.draft_id)
      .maybeSingle();
    if (readErr) return fail("network");
    const draft = data as DraftRow | null;

    const now = Date.now();
    const tokenHash = isValidClaimToken(body.claim_token) ? await hashToken(body.claim_token) : null;
    const decision = decideClaim({ row: draft, tokenHash, userId: user.id, now });
    if (!decision.ok) return fail(decision.reason);
    // decision.ok ⇒ draft съществува.
    const row = draft as DraftRow;

    let expiresAt = row.expires_at;

    if (!decision.idempotent) {
      // Атомарно присвояване + ротация на токена: от този момент анонимният
      // указател в браузъра (и всеки негов дубликат) е безполезен.
      expiresAt = new Date(now + CLAIMED_DRAFT_TTL_MS).toISOString();
      const { data: updated, error: updErr } = await db
        .from("anonymous_drafts")
        .update({
          claimed_by: user.id,
          claimed_at: new Date(now).toISOString(),
          token_hash: await hashToken(generateClaimToken()),
          expires_at: expiresAt,
        })
        .eq("id", row.id)
        .is("claimed_by", null)
        .select("id")
        .maybeSingle();
      if (updErr) return fail("network");
      if (!updated) return fail("already_claimed");
    }

    let savedDocId = row.saved_doc_id;
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    let purged = !!savedDocId;

    // Готов документ → в профила (без нова операция: генерирането вече е
    // таксувано в анонимната сесия). След това съдържанието напуска черновата.
    if (row.has_result && payload.result && !savedDocId) {
      const meta = (payload.meta ?? {}) as Record<string, unknown>;
      const title =
        (typeof meta.customTitle === "string" && meta.customTitle) ||
        (typeof meta.name === "string" && meta.name) ||
        row.doc_key ||
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
        const { error: purgeErr } = await db
          .from("anonymous_drafts")
          .update(rowAfterTransfer(savedDocId, await hashToken(generateClaimToken())))
          .eq("id", row.id)
          .eq("claimed_by", user.id);
        purged = !purgeErr;
      }
    }

    logDraft("draft-claim", {
      status: 200,
      flow: row.flow,
      idempotent: decision.idempotent,
      has_result: row.has_result,
      transferred: !!savedDocId,
    });

    return json({
      ok: true,
      route: row.route,
      flow: row.flow,
      doc_key: row.doc_key,
      step_idx: row.step_idx,
      has_result: row.has_result,
      expires_at: expiresAt,
      // Съдържанието се връща само ако има какво да се възстанови; след
      // прехвърляне източникът на истина е saved_documents.
      payload: hasRestorableContent(payload) ? payload : null,
      saved_doc_id: savedDocId,
      purged,
    });
  } catch (_e) {
    return fail("network");
  }
});
