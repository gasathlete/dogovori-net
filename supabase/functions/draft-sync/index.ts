// draft-sync — създава/обновява чернова на документ (activation continuity).
//
// Защо: анонимният потребител губеше отговорите и генерирания резултат при
// вход/регистрация (нов таб от имейл линка, OAuth пренасочване, друг браузър).
// Съдържанието се пази тук, а в браузъра остава само указател без лични данни.
//
// Достъпът до `public.anonymous_drafts` е само през service role. Кой може да
// пише се решава в `_shared/draft-auth.ts`:
//   - непотърсена чернова → само с верния claim токен;
//   - присвоена чернова  → само собственикът (JWT); токенът не важи повече;
//   - липсваща/изтекла   → типизиран отказ, НЕ тихо създаване на дубликат.
// Нова чернова се създава само по изричния път без `draft_id`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors, clientIp, hashIp } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import {
  ANON_DRAFT_TTL_MS,
  CLAIMED_DRAFT_TTL_MS,
  generateClaimToken,
  hashToken,
  isSafeRoute,
  isValidClaimToken,
  isValidDraftId,
  isValidFlow,
  payloadTooLarge,
} from "../_shared/draft-token.ts";
import {
  decideSyncWrite,
  isCreateRequest,
  logDraft,
  ownerUpdateAfterTransfer,
  REASON_STATUS,
  type DraftAuthRow,
  type DraftErrorReason,
} from "../_shared/draft-auth.ts";
import {
  anonymousWriteFilters,
  classifyLostWrite,
  ownerWriteFilters,
  updateGuarded,
  type DbLike,
} from "../_shared/draft-writes.ts";
import {
  findRestrictedIdentifierKindsDeep,
  RESTRICTED_IDENTIFIER_BLOCKED_CODE,
  restrictedIdentifierMessage,
} from "../_shared/text-identifier-gate.ts";


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

/** Потребителят идва само от JWT-то в заявката; анонимният ключ не е потребител. */
async function userIdFromRequest(db: ReturnType<typeof admin>, req: Request): Promise<string | null> {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return null;
  try {
    const { data } = await db.auth.getUser(jwt);
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
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
    logDraft("draft-sync", { reason, status: REASON_STATUS[reason] });
    return json({ ok: false, reason }, REASON_STATUS[reason]);
  };

  try {
    const body = (await req.json().catch(() => ({}))) as Body;

    if (!isValidFlow(body.flow)) return fail("invalid_request");
    if (!isSafeRoute(body.route)) return fail("invalid_request");
    if (payloadTooLarge(body.payload)) return fail("payload_too_large");

    // ПРЕГРАДА ЗА ОГРАНИЧЕНИ ИДЕНТИФИКАТОРИ — ПРЕДИ всякакъв запис в
    // `anonymous_drafts`. Отговорът съдържа само вида, никога стойността.
    {
      const kinds = findRestrictedIdentifierKindsDeep({
        payload: body.payload ?? null,
        doc_key: body.doc_key ?? null,
      });
      if (kinds.length > 0) {
        logDraft("draft-sync", { reason: RESTRICTED_IDENTIFIER_BLOCKED_CODE, status: 422 });
        return json({
          ok: false,
          reason: RESTRICTED_IDENTIFIER_BLOCKED_CODE,
          code: RESTRICTED_IDENTIFIER_BLOCKED_CODE,
          message: restrictedIdentifierMessage(kinds),
          restricted_kinds: kinds,
        }, 422);
      }
    }

    const ipKey = await hashIp(clientIp(req));
    const rl = await checkRateLimit(`draft-sync:${ipKey}`, 120, 60);
    if (!rl.ok) return fail("rate_limited");

    const db = admin();
    const userId = await userIdFromRequest(db, req);
    const now = Date.now();

    const base = {
      flow: body.flow,
      doc_key: typeof body.doc_key === "string" ? body.doc_key.slice(0, 200) : null,
      route: body.route,
      step_idx: Number.isFinite(body.step_idx) ? Math.max(0, Math.trunc(body.step_idx as number)) : 0,
      has_result: !!body.has_result,
      payload: body.payload ?? {},
    };

    /* ----------------------------- Обновяване ----------------------------- */
    if (!isCreateRequest(body)) {
      if (!isValidDraftId(body.draft_id)) return fail("invalid_request");
      const draftId = body.draft_id as string;

      const { data: existing, error: readErr } = await db
        .from("anonymous_drafts")
        .select("id, token_hash, claimed_by, expires_at, saved_doc_id")
        .eq("id", draftId)
        .maybeSingle();
      if (readErr) return fail("network");

      const tokenHash = isValidClaimToken(body.claim_token) ? await hashToken(body.claim_token) : null;
      const decision = decideSyncWrite({
        row: (existing as DraftAuthRow | null) ?? null,
        tokenHash,
        userId,
        now,
      });
      if (!decision.ok) return fail(decision.reason);

      const expiresAt = new Date(
        now + (decision.mode === "owner" ? CLAIMED_DRAFT_TTL_MS : ANON_DRAFT_TTL_MS),
      ).toISOString();

      // Прехвърлена чернова: съдържанието вече живее в saved_documents и не се
      // връща обратно в таблицата — обновяват се само позиция и маршрут.
      const update = decision.transferred
        ? ownerUpdateAfterTransfer({ route: base.route, step_idx: base.step_idx, expires_at: expiresAt })
        : { ...base, expires_at: expiresAt };

      // Предикатите на решението пътуват в самия UPDATE: между четенето и
      // записа черновата може да е присвоена, токенът ротиран или редът изтекъл.
      const nowIso = new Date(now).toISOString();
      const filters =
        decision.mode === "owner"
          ? ownerWriteFilters(draftId, userId as string, nowIso)
          : anonymousWriteFilters(draftId, tokenHash as string, nowIso);

      const { row: updated, error: updErr } = await updateGuarded(
        db as unknown as DbLike,
        "anonymous_drafts",
        update,
        filters,
      );
      if (updErr) return fail("network");
      if (!updated) {
        // Нула реда → състоянието се е сменило. Прочитаме само нужното и
        // връщаме точния отказ; никога не пишем наново и не създаваме дубликат.
        const { data: fresh } = await db
          .from("anonymous_drafts")
          .select("id, token_hash, claimed_by, expires_at, saved_doc_id")
          .eq("id", draftId)
          .maybeSingle();
        return fail(
          classifyLostWrite((fresh as DraftAuthRow | null) ?? null, { userId, tokenHash, now }),
        );
      }

      logDraft("draft-sync", {
        status: 200,
        mode: decision.mode,
        flow: base.flow,
        has_result: base.has_result,
        transferred: decision.transferred,
      });
      return json({
        ok: true,
        draft_id: draftId,
        expires_at: expiresAt,
        claimed: decision.mode === "owner",
        transferred: decision.transferred,
      });
    }


    /* ------------------------------ Създаване ----------------------------- */
    // Влязъл потребител: черновата е негова от самото начало — няма анонимен
    // токен за пазене в браузъра; достъпът е само през JWT.
    const token = generateClaimToken();
    const claimed = !!userId;
    const expiresAt = new Date(now + (claimed ? CLAIMED_DRAFT_TTL_MS : ANON_DRAFT_TTL_MS)).toISOString();
    const insert = {
      ...base,
      // За присвоена при създаване чернова хешът е на еднократен, неразкрит
      // токен: колоната е NOT NULL, но никой не притежава стойността.
      token_hash: await hashToken(claimed ? generateClaimToken() : token),
      expires_at: expiresAt,
      ...(claimed ? { claimed_by: userId, claimed_at: new Date(now).toISOString() } : {}),
    };
    const { data: created, error } = await db
      .from("anonymous_drafts")
      .insert(insert)
      .select("id, expires_at")
      .single();
    if (error || !created) return fail("network");

    logDraft("draft-sync", { status: 201, mode: claimed ? "owner" : "anonymous", flow: base.flow, claimed });
    return json(
      {
        ok: true,
        draft_id: created.id,
        expires_at: created.expires_at,
        claimed,
        transferred: false,
        ...(claimed ? {} : { claim_token: token }),
      },
      201,
    );
  } catch (_e) {
    return fail("network");
  }
});
