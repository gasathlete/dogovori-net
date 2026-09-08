// Q2f — решение по предложение за редакция на запазен документ.
//
// Действия: accept / reject / undo. НЕ извиква AI и НЕ консумира AI квота.
// Цялият преход и промяната по документа са в една транзакция (SQL функция
// `assistant_edit_proposal_action`) с редови ключалки и проверка на актьора и
// текущия достъп. Тук се правят само предпазни проверки, четене през RLS и
// пре-обвързване на разговора към новата версия на контекста.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";
import {
  decideEditTransition,
  readLeafByPath,
  type EditAction,
} from "../_shared/assistant-edit.ts";
import { computeContextVersion } from "../_shared/assistant-context-version.ts";

const ACTIONS: EditAction[] = ["accept", "reject", "undo"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") return json({ ok: false, code: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, code: "unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    // Единственият клиент тук е с JWT-а на потребителя: RLS и SQL функцията
    // (auth.uid) са авторитетът. Service-role не се използва като заобикаляне.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return json({ ok: false, code: "unauthorized" }, 401);

    const body = await req.json().catch(() => null);
    const proposalId = typeof body?.proposalId === "string" ? body.proposalId.trim() : "";
    const action = body?.action;
    if (!UUID_RE.test(proposalId)) return json({ ok: false, code: "invalid_proposal_id" }, 400);
    if (!ACTIONS.includes(action)) return json({ ok: false, code: "invalid_action" }, 400);

    // ---- Предпазни проверки върху текущото състояние (авторитетът е SQL) ----
    const { data: proposal, error: pErr } = await userClient
      .from("assistant_edit_proposals")
      .select(
        "id, thread_id, saved_document_id, status, base_updated_at, applied_updated_at, before_text, after_text, target_path",
      )
      .eq("id", proposalId)
      .maybeSingle();
    if (pErr) return json({ ok: false, code: "proposal_unavailable" }, 503);
    if (!proposal) return json({ ok: false, code: "proposal_not_found" }, 404);

    const { data: docRow, error: dErr } = await userClient
      .from("saved_documents")
      .select("id, kind, title, payload, created_at, updated_at")
      .eq("id", proposal.saved_document_id)
      .maybeSingle();
    if (dErr) return json({ ok: false, code: "document_unavailable" }, 503);
    // Липсващ ред при RLS-обхванат достъп = няма право или изтрит документ.
    if (!docRow) return json({ ok: false, code: "forbidden" }, 403);

    const { data: threadRow, error: tErr } = await userClient
      .from("assistant_threads")
      .select("id, context_kind, context_entity_id, context_version")
      .eq("id", proposal.thread_id)
      .maybeSingle();
    if (tErr) return json({ ok: false, code: "thread_unavailable" }, 503);
    if (
      !threadRow ||
      (threadRow as any).context_kind !== "saved_document" ||
      (threadRow as any).context_entity_id !== proposal.saved_document_id
    ) {
      return json({ ok: false, code: "thread_mismatch" }, 409);
    }
    const previousVersion: string | null = (threadRow as any).context_version ?? null;

    const decision = decideEditTransition({
      action,
      proposal: {
        status: String(proposal.status),
        base_updated_at: String(proposal.base_updated_at),
        applied_updated_at: (proposal as any).applied_updated_at ?? null,
        before_text: String(proposal.before_text),
        after_text: String(proposal.after_text),
      },
      documentUpdatedAt: String((docRow as any).updated_at ?? ""),
      currentTargetValue: readLeafByPath(docRow as any, proposal.target_path),
    });
    if (!decision.ok) return json({ ok: false, code: decision.code }, 409);

    // ---- Авторитетен атомарен преход -------------------------------------
    const { data: rpcData, error: rpcErr } = await userClient.rpc(
      "assistant_edit_proposal_action",
      { _proposal_id: proposalId, _action: action },
    );
    if (rpcErr || !rpcData) return json({ ok: false, code: "action_unavailable" }, 503);
    const res = rpcData as any;
    if (!res.ok) return json({ ok: false, code: String(res.code ?? "action_failed") }, 409);

    const doc = res.document ?? {};
    const changed = res.changed === true;

    // ---- Обвързване на СЪЩИЯ разговор към ТЕКУЩАТА версия ----------------
    // Пре-обвързва се само срещу ДОКАЗАН резултат от този преход. Идемпотентен
    // повтор след чужда по-късна промяна НЕ обвързва разговора към нея.
    const resProposal = (res.proposal ?? {}) as Record<string, unknown>;
    const proven = proveTransitionResult({
      action,
      changed,
      idempotent: res.idempotent === true,
      status: String(resProposal.status ?? proposal.status ?? ""),
      appliedUpdatedAt: (resProposal.applied_updated_at as string | null) ?? null,
      revertedUpdatedAt: (resProposal.reverted_updated_at as string | null) ?? null,
      documentUpdatedAt: (doc.updated_at as string | null) ?? null,
      currentTargetValue: readLeafByPath(doc, proposal.target_path),
      beforeText: String(proposal.before_text),
      afterText: String(proposal.after_text),
    });

    let rebound = false;
    let contextVersion: string | null = previousVersion;
    if (doc.id) {
      const canonical = await computeContextVersion({
        kind: "saved_document",
        entityId: String(doc.id),
        fields: {
          title: doc.title ?? null,
          kind: doc.kind ?? null,
          payload: doc.payload ?? null,
          created_at: doc.created_at ?? null,
        },
      });
      contextVersion = canonical;

      // Текущо обвързаната версия се препрочита — тя може вече да е новата
      // (например при повторно изпратено същото действие).
      const { data: tNow } = await userClient
        .from("assistant_threads")
        .select("context_version")
        .eq("id", proposal.thread_id)
        .maybeSingle();
      const boundVersion: string | null = tNow
        ? ((tNow as any).context_version ?? null)
        : null;

      if (boundVersion && boundVersion === canonical) {
        rebound = true;
      } else {
        // Пре-обвързваме само ако документът все още е ТОЧНО състоянието, което
        // транзакцията върна, и само от точната текуща версия на разговора.
        const { data: recheck } = await userClient
          .from("saved_documents")
          .select("updated_at")
          .eq("id", doc.id)
          .maybeSingle();
        const stillSame = !!recheck &&
          Date.parse(String((recheck as any).updated_at)) === Date.parse(String(doc.updated_at));

        if (stillSame && boundVersion) {
          const { data: updated } = await userClient
            .from("assistant_threads")
            .update({ context_version: canonical })
            .eq("id", proposal.thread_id)
            .eq("context_version", boundVersion)
            .select("id")
            .maybeSingle();
          rebound = !!updated;
        }
      }
    }

    return json({
      ok: true,
      action,
      idempotent: res.idempotent === true,
      changed,
      proposal: res.proposal ?? null,
      document: { id: doc.id ?? null, updatedAt: doc.updated_at ?? null },
      contextVersion,
      rebound,
      // Ако обвързването не може да бъде доказано (включително при идемпотентен
      // повтор), интерфейсът ТРЯБВА да поиска нов разговор — старият контекст не
      // е доказано актуален.
      requiresNewThread: !rebound,
    });
  } catch (_e) {
    // Без текстове на документи/предложения в логовете.
    console.error("assistant-edit failed");
    return json({ ok: false, code: "unexpected_error" }, 500);
  }
});
