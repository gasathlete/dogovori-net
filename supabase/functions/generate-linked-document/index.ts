// Edge function: generate a linked document (appendix, annex, handover
// protocol, declaration, power of attorney, notice) using the parent
// contract as context. Returns { contract: GeneratedContract }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";
import { getCorrelationId, correlationHeaders } from "../_shared/correlation.ts";
import { classifyDocumentBeforeAI } from "../_shared/classify.ts";
import { redactForAI, unredact } from "../_shared/redact.ts";
import { canonicalize, sha256Hex } from "../_shared/canonical-digest.ts";
import {
  asOperationId,
  type LedgerRpc,
  type PostModelContext,
  cancelDocumentOperation,
  cancelUnexpectedFailure,
  canonicalDocumentBinding,
  commitDocumentOperation,
  internalErrorResponse,
  ledgerBlockResponse,
  ledgerUnavailableResponse,
  lookupDocumentOperation,
  markDocumentModelStarted,
  markDocumentReconciliation,
  operationIdRequiredResponse,
  operationReconciliationResponse,
  ProviderCallBudget,
  reconcileUnexpectedFailure,
  reserveDocumentOperation,
} from "../_shared/ai-document-ledger.ts";

const KIND_SPECS: Record<string, { label: string; addendum: string }> = {
  appendix: {
    label: "Приложение към договора",
    addendum:
      "Изготви ПРИЛОЖЕНИЕ към основния договор. Заглавие: „ПРИЛОЖЕНИЕ №[N] към Договор [дата/номер]“. Кратък встъпителен параграф с препратка към конкретен член от основния договор, след което структуриран опис (таблично: №, описание, количество, ед. цена, стойност, забележка) според контекста. Място за подписи и дата. НЕ повтаряй клаузи от основния договор.",
  },
  annex: {
    label: "Анекс към договора",
    addendum:
      "Изготви АНЕКС към основния договор. Цитирай точно кой член/алинея се изменя (стар → нов текст). Структура: преамбюл със страните и препратка към договора, §1 Изменения, §2 Заключителни, подписи. Заяви изрично че останалите клаузи не се променят.",
  },
  handover_protocol: {
    label: "Приемо-предавателен протокол",
    addendum:
      "Изготви ПРИЕМО-ПРЕДАВАТЕЛЕН ПРОТОКОЛ. Дата и място, страни (предаващ / приемащ), препратка към основния договор, описание на обекта, състояние, показания на уреди, предадени ключове/документи, забележки, подписи.",
  },
  declaration: {
    label: "Декларация",
    addendum:
      "Изготви ДЕКЛАРАЦИЯ — едностранен документ. Долуподписаният [име, ЕГН, адрес], декларативна част с ясно формулирано съдържание, наказателна отговорност по чл. 313 НК ако е приложимо, дата и подпис. Без двустранна структура.",
  },
  power_of_attorney: {
    label: "Пълномощно",
    addendum:
      "Изготви ПЪЛНОМОЩНО. Упълномощител, упълномощен, конкретен обхват на представителна власт, срок, преупълномощаване, дата и подпис. При разпоредителни сделки посочи че се изисква нотариална заверка.",
  },
  notice: {
    label: "Уведомление / Нотариална покана",
    addendum:
      "Изготви УВЕДОМЛЕНИЕ / НОТАРИАЛНА ПОКАНА. Изпращач, получател, препратка към договора, ясно формулирано изискване, срок за отговор, последици, дата и подпис. Официален тон.",
  },
};

const SYSTEM_PROMPT = `Ти си български правен архитект. Пишеш на професионален юридически български. Създаваш ДОПЪЛНИТЕЛЕН документ, свързан с ОСНОВЕН договор — контекстът от основния договор ти е предоставен.

Върни СТРОГО валиден JSON (без markdown ограждания):
{
  "contract": {
    "title": "...",
    "preamble": "...",
    "clauses": [{"number":"I.","title":"...","body":"Чл. 1. ...\\nЧл. 2. ..."}],
    "closing": "..."
  }
}

Правила:
- Използвай СЪЩИТЕ страни (имена, ЕГН/ЕИК, адреси) от основния договор.
- Референции към основния договор пишеш ясно: „...съгласно чл. X от Договор от [дата]".
- НЕ преповтаряй целия основен договор — създаваш самостоятелен свързан документ.
- Ако конкретни данни липсват — използвай плейсхолдъри в [квадратни скоби].
- Договори.нет НЕ събира лични данни; ако липсват, използвай плейсхолдъри без коментар.`;

Deno.serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Fail-closed контекст за НЕОЧАКВАНИ изключения.
  let postStart: PostModelContext | null = null;
  let preStart: PostModelContext | null = null;

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    let resolvedUserId: string | null = null;
    if (authHeader.startsWith("Bearer ")) {
      const { data: u } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
      resolvedUserId = u?.user?.id ?? null;
    }
    // УДОСТОВЕРЯВАНЕТО Е ЗАДЪЛЖИТЕЛНО: всяко повикване към модел минава през
    // трайния леджър (миграция 0040), а той изисква профил. Отказът е
    // детерминистичен и е ПРЕДИ търсене на операция, честотен лимит, ключ на
    // доставчик, правно заземяване и всякакъв запис.
    if (!resolvedUserId) {
      return new Response(
        JSON.stringify({
          error: "За да генерирате свързан документ, влезте безплатно с email или Google.",
          code: "login_required",
          requires_login: true,
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            ...correlationHeaders(correlationId),
            "Content-Type": "application/json",
          },
        },
      );
    }
    const userId: string = resolvedUserId;

    // Леджърът е СТРОГО service_role RPC — тесен контракт за тестваемост.
    const ledger = admin as unknown as LedgerRpc;
    const jsonHeaders = { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" };
    const ledgerHeaders = { ...corsHeaders, ...correlationHeaders(correlationId) };

    const body = await req.json();
    const kind = String(body.kind ?? "").trim();
    const spec = KIND_SPECS[kind];
    if (!spec) {
      return new Response(
        JSON.stringify({ error: "Неподдържан вид документ.", code: "invalid_kind" }),
        { status: 400, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } },
      );
    }

    const parentContract = body.parent_contract as {
      title?: string;
      preamble?: string;
      clauses?: Array<{ number?: string; title?: string; body?: string }>;
      closing?: string;
    } | null;
    const parentSlug = String(body.parent_slug ?? "");
    const number = String(body.number ?? "").trim();
    const notes = String(body.notes ?? "").trim();

    if (!parentContract || !parentContract.title) {
      return new Response(
        JSON.stringify({ error: "Липсва основен договор като контекст.", code: "missing_parent" }),
        { status: 400, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } },
      );
    }

    // === Точно едно изпълнение (Gate 2) ===
    // Обвързването е с ТОЧНИЯ вид, отпечатъка на родителския документ и
    // всяка опция, която влияе на резултата. Сурово съдържание НЕ влиза в леджъра.
    const operationId = asOperationId(body.operation_id);
    if (!operationId) return operationIdRequiredResponse(ledgerHeaders);

    const parentDigest = await sha256Hex(canonicalize([
      "linked_parent_v1",
      String(parentContract.title ?? ""),
      String(parentContract.preamble ?? ""),
      (parentContract.clauses ?? []).map((c) => [c.number ?? "", c.title ?? "", c.body ?? ""]),
      String(parentContract.closing ?? ""),
    ]));
    const binding = await canonicalDocumentBinding({
      purpose: "generate_linked_document",
      userId,
      resourceId: parentSlug || null,
      resourceVersion: parentDigest,
      options: { kind, number, notes_digest: await sha256Hex(notes) },
    });

    // САМО-ЧЕТЯЩО повторение — преди честотния лимит, ключа на доставчика,
    // RAG и всяко счетоводно записване.
    const existing = await lookupDocumentOperation(ledger, {
      operationId, userId, purpose: "generate_linked_document", binding,
    });
    if (existing.kind === "committed") {
      return new Response(JSON.stringify(existing.result), { headers: jsonHeaders });
    }
    const blockedByLedger = ledgerBlockResponse(existing, ledgerHeaders);
    if (blockedByLedger) return blockedByLedger;

    // Честотен лимит: 5 генерации за 24 часа на профил.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("function_name", "generate-linked-document")
      .gte("created_at", since)
      .eq("user_id", userId);
    if ((count ?? 0) >= 5) {
      return new Response(
        JSON.stringify({
          error: "Достигнахте дневния лимит от 5 генерации. Опитайте утре или вземете Pro.",
          code: "rate_limited",
        }),
        { status: 429, headers: jsonHeaders },
      );
    }

    const reserved = await reserveDocumentOperation(ledger, {
      operationId, userId, purpose: "generate_linked_document", binding,
      resourceId: parentSlug || null,
      resourceVersion: parentDigest,
      leaseSeconds: 600,
    });
    if (reserved.kind === "committed") {
      return new Response(JSON.stringify(reserved.result), { headers: jsonHeaders });
    }
    if (reserved.kind !== "reserved") {
      return ledgerBlockResponse(reserved, ledgerHeaders) ?? ledgerUnavailableResponse(ledgerHeaders);
    }
    preStart = { db: ledger, operationId, userId };

    /** Детерминиран провал ПРЕДИ модела — резервацията се отменя. */
    const cancelAndRespond = async (reason: string, response: Response): Promise<Response> => {
      await cancelDocumentOperation(ledger, { operationId, userId, reason });
      return response;
    };
    /** Несигурност СЛЕД модела — без връщане и без второ повикване. */
    const reconcileAndRespond = async (reason: string): Promise<Response> => {
      await markDocumentReconciliation(ledger, { operationId, userId, reason });
      return operationReconciliationResponse(ledgerHeaders, reason);
    };
    const budget = new ProviderCallBudget("generate_linked_document");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return await cancelAndRespond("provider_key_missing", new Response(
        JSON.stringify({ error: "Обработката е временно недостъпна.", code: "provider_unavailable" }),
        { status: 503, headers: jsonHeaders },
      ));
    }

    const parentClausesText = (parentContract.clauses ?? [])
      .map((c) => `${c.number ?? ""} ${c.title ?? ""}\n${c.body ?? ""}`)
      .join("\n\n");

    // КЛАСИФИКАЦИЯ + СТРУКТУРИРАНА РЕДАКЦИЯ на ЦЯЛОТО изходящо съдържание
    // (заглавие, преамбюл, клаузи, заключение и указанията на потребителя)
    // преди всяка външна заявка. Полетата НЕ се възстановяват по разделител.
    const outboundCorpus = [
      notes,
      parentContract.title ?? "",
      parentContract.preamble ?? "",
      parentClausesText,
      parentContract.closing ?? "",
    ].join("\n\n");
    const classification = classifyDocumentBeforeAI(outboundCorpus);
    if (classification.risk_level === "blocked") {
      return await cancelAndRespond("content_blocked", new Response(
        JSON.stringify({ error: "Съдържанието не може да бъде обработено.", code: "content_blocked", charged: false }),
        { status: 422, headers: jsonHeaders },
      ));
    }

    const { redactFields } = await import("../_shared/structured-redact.ts");
    const redaction = redactFields({
      notes,
      title: String(parentContract.title ?? ""),
      preamble: String(parentContract.preamble ?? ""),
      clauses: parentClausesText,
      closing: String(parentContract.closing ?? ""),
    });
    const safeNotes = redaction.fields.notes;
    const safeTitle = redaction.fields.title;
    const safeParentText = [
      `ЗАГЛАВИЕ: ${safeTitle}`,
      `ПРЕАМБЮЛ:\n${redaction.fields.preamble}`,
      redaction.fields.clauses,
      `ЗАКЛЮЧЕНИЕ:\n${redaction.fields.closing}`,
    ].join("\n\n").slice(0, 12000);

    const userPrompt = `ВИД НА СВЪРЗАНИЯ ДОКУМЕНТ: ${spec.label}${number ? ` №${number}` : ""}
${safeNotes.trim() ? `ДОПЪЛНИТЕЛНИ УКАЗАНИЯ ОТ ПОТРЕБИТЕЛЯ:\n${safeNotes.trim()}\n` : ""}
СПЕЦИФИКА ЗА ТОЗИ ВИД:
${spec.addendum}

ОСНОВЕН ДОГОВОР (контекст — не преповтаряй, само реферирай):
${safeParentText}

Задача: Изготви ПЪЛНИЯТ свързан документ на български според описаната по-горе структура. Върни СТРОГО валиден JSON по схемата.`;

    // СТРОГО ЗАЗЕМЯВАНЕ преди модела и преди запис на ai_usage.
    const { retrieveLegalContext } = await import("../_shared/legal-rag.ts");
    // Заземяването се търси по ЦЕЛИЯ редактиран корпус (вид, заглавие, указания,
    // преамбюл, клаузи, заключение), а не само по заглавието — така релевантните
    // клаузи на основния договор участват в извличането. Суровите лични данни
    // никога не достигат до извличането: използват се само редактирани полета.
    const corpusParts = [
      spec.label,
      safeTitle,
      safeNotes,
      redaction.fields.preamble,
      redaction.fields.clauses,
      redaction.fields.closing,
    ].filter((part) => part && part.trim().length > 0);
    const corpus = corpusParts.join("\n");

    // ОГРАНИЧЕНО МНОГОСЕГМЕНТНО ИЗВЛИЧАНЕ: детерминирани сегменти (начало,
    // среда, край) вместо отрязване на първите 4000 знака. Един и същ вход дава
    // един и същ заземен контекст, затова повторният опит ползва същия контекст.
    const SEGMENT = 2000;
    const segments: string[] = [];
    const head = `${spec.label}\n${safeTitle}\n${safeNotes}`.trim().slice(0, SEGMENT);
    if (head.length > 0) segments.push(head);
    if (corpus.length <= SEGMENT) {
      if (corpus.trim().length > 0 && corpus !== head) segments.push(corpus);
    } else {
      const mid = Math.max(0, Math.floor((corpus.length - SEGMENT) / 2));
      segments.push(corpus.slice(0, SEGMENT));
      segments.push(corpus.slice(mid, mid + SEGMENT));
      segments.push(corpus.slice(Math.max(0, corpus.length - SEGMENT)));
    }

    const seenChunks = new Set<string>();
    const mergedCitations: Array<Record<string, unknown>> = [];
    const promptBlocks: string[] = [];
    for (const segment of segments.slice(0, 4)) {
      const part = await retrieveLegalContext(admin, LOVABLE_API_KEY, segment, { matchCount: 4 });
      if (!part.hasMatches) continue;
      for (const c of part.citations) {
        const key = String((c as { chunk_id?: string; short_code?: string }).chunk_id ??
          (c as { short_code?: string }).short_code ?? JSON.stringify(c));
        if (seenChunks.has(key)) continue;
        seenChunks.add(key);
        mergedCitations.push(c as unknown as Record<string, unknown>);
      }
      if (part.promptBlock) promptBlocks.push(part.promptBlock);
    }
    const legal = {
      hasMatches: mergedCitations.length > 0,
      citations: mergedCitations,
      promptBlock: promptBlocks.join("\n\n").slice(0, 12000),
    };
    if (!legal.hasMatches) {
      const { legalVerificationUnavailableResponse } = await import("../_shared/legal-gate.ts");
      return await cancelAndRespond(
        "legal_unavailable",
        legalVerificationUnavailableResponse({ headers: ledgerHeaders }),
      );
    }
    const groundedSystem = `${SYSTEM_PROMPT}\n\n${legal.promptBlock}`;

    // ТРАЙНО начало на модела ПРЕДИ първото повикване към доставчик.
    const started = await markDocumentModelStarted(ledger, {
      operationId, userId, purpose: "generate_linked_document", binding,
    });
    if (!started.ok) {
      return ledgerBlockResponse(started.outcome, ledgerHeaders) ?? ledgerUnavailableResponse(ledgerHeaders);
    }
    // От тук нататък всяко неочаквано изключение отива в изравняване.
    postStart = { db: ledger, operationId, userId };
    preStart = null;

    // ТВЪРД БЮДЖЕТ: точно 1 повикване към доставчик за цялата операция.
    budget.take();
    let aiResp: Response;
    try {
      aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: groundedSystem },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
      });
    } catch (_networkError) {
      return await reconcileAndRespond("provider_uncertainty");
    }


    if (!aiResp.ok) {
      // Никога не се записва и не се връща тяло/детайл от шлюза.
      console.error("generate-linked-document ai_failed", { status: aiResp.status, cid: correlationId });
      return await reconcileAndRespond(`provider_http_${aiResp.status}`);
    }

    const rawJson = await aiResp.json().catch(() => null);
    const content: string = rawJson?.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) return await reconcileAndRespond("empty_response");

    const { parseAiJsonWithRetry } = await import("../_shared/ai-json-retry.ts");
    let rawParsed: unknown;
    try {
      // Бюджетът е 1 повикване: НЯМА повторно генериране при негоден JSON.
      rawParsed = (await parseAiJsonWithRetry({
        content,
        messages: [
          { role: "system", content: groundedSystem },
          { role: "user", content: userPrompt },
        ],
        model: "google/gemini-2.5-flash",
        apiKey: LOVABLE_API_KEY,
        fn: "generate-linked-document",
        correlationId,
        regenerateAttempts: 0,
      })).parsed;
    } catch (_parseError) {
      return await reconcileAndRespond("malformed_response");
    }
    const parsed = JSON.parse(unredact(JSON.stringify(rawParsed), redaction.mapping));

    const payload = {
      ...parsed,
      citations: legal.citations,
      meta: { kind, parent_slug: parentSlug, number },
    };

    // АТОМАРНО: резултатът за точно повторение + счетоводството наведнъж.
    const committed = await commitDocumentOperation(ledger, {
      operationId, userId, purpose: "generate_linked_document", binding,
      result: payload as Record<string, unknown>,
      resultTtlSeconds: 86400,
      usageFunction: "generate-linked-document",
    });
    if (committed.kind !== "committed") {
      return await reconcileAndRespond("commit_uncertain");
    }

    return new Response(JSON.stringify(payload), { headers: jsonHeaders });
  } catch (e) {
    // Нормализиран запис: без сурови съобщения от шлюза или изключения.
    const headers = { ...corsHeaders, ...correlationHeaders(correlationId) };
    if (postStart) return await reconcileUnexpectedFailure(postStart, headers, e);
    if (preStart) return await cancelUnexpectedFailure(preStart, headers, e, correlationId);
    console.error("generate-linked-document error", {
      cid: correlationId,
      name: e instanceof Error ? e.name : "unknown",
    });
    return internalErrorResponse(headers, correlationId);
  }
});
