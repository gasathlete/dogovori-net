// Edge function: refine an already-generated contract based on a single free-text
// user feedback message. Applies the MINIMAL change necessary and returns the
// updated contract. Costs 1 op през единния регистър (quota_reserve/commit/cancel),
// available to all authenticated users — no Pro gate.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";
import { loadActivePrompt } from "../_shared/prompt-loader.ts";
import { guardIllegalContent } from "../_shared/illegal-content.ts";
import { classifyDocumentBeforeAI } from "../_shared/classify.ts";
import { redactForAI, unredact } from "../_shared/redact.ts";
import { routeModel } from "../_shared/model-router.ts";
import { logAiAudit } from "../_shared/ai-call.ts";
import { getCorrelationId, correlationHeaders } from "../_shared/correlation.ts";
import { restrictedIdentifierBlock } from "../_shared/text-identifier-gate.ts";
import { isNewProcessingOpen, newProcessingClosedResponse } from "../_shared/new-processing-gate.ts";


const SYSTEM_PROMPT = `Ти си водещ български правен архитект. Получаваш вече генериран договор (в JSON) и КРАТКА обратна връзка от потребителя за пропуск/грешка/подобрение.

Твоята задача:
1. Разбери какво точно посочва потребителят.
2. Провери дали е основателно от правна гледна точка (българско право — ЗЗД, ТЗ, ЗУТ и др.).
3. Ако е основателно — коригирай САМО минимално необходимите места в договора. НЕ пренаписвай целия документ. НЕ променяй клаузи, номерация, стил или формулировки, които не са свързани с обратната връзка.
4. Ако не е основателно или е неясно — обясни в change_summary защо не се променя, но пак върни договора непроменен.

ВАЖНО за задатък (чл. 93 ЗЗД):
- Купувач се отказва → задатъкът се задържа от продавача (единичен размер, НЕ двоен).
- Продавач се отказва → връща задатъка в двоен размер (НЕ "задатък + неустойка").
Ако потребителят посочи, че сегашният текст е сгрешил тези правила — задължително коригирай.

ВАЖНО: Договори.нет не събира лични данни. НЕ добавяй такива към текста; използвай плейсхолдъри в квадратни скоби.

Върни СТРОГО валиден JSON:
{
  "contract": { "title": "...", "preamble": "...", "clauses": [{"number":"I.","title":"...","body":"..."}], "closing": "..." },
  "changed_clause_numbers": ["I.", "IV."],
  "change_summary": "1-2 изречения на български какво е променено и защо (или защо не)."
}
Никакви markdown ограждания. Всички парични суми в евро (€).`;

const DAILY_LIMIT = 40;

Deno.serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;


    const body = await req.json();
    const contract = body?.contract;
    const feedback: string = String(body?.feedback ?? "").trim();
    const answers = body?.answers ?? {};
    const { asUuidOrNull, canonicalRequestDigest } = await import("../_shared/canonical-digest.ts");
    // Клиентският ключ на операцията е ЗАДЪЛЖИТЕЛЕН: без него повторният опит
    // не е идемпотентен и би генерирал и таксувал наново.
    const rawClientOpId = body?.operation_id ?? body?.client_operation_id;
    const operationId = asUuidOrNull(rawClientOpId);
    // batch_id е част от обвързването на ключа (вълна поправки), ако е подаден.
    const batchId = asUuidOrNull(body?.batch_id);
    const userConfirmed: boolean = !!body?.userConfirmed;

    if (!contract || !feedback) {
      return new Response(JSON.stringify({ error: "Липсва договор или обратна връзка" }), {
        status: 400, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" },
      });
    }
    if (!operationId) {
      return new Response(
        JSON.stringify({
          error: "Липсва или е невалиден идентификатор на операцията.",
          code: rawClientOpId ? "invalid_operation_id" : "operation_id_required",
          charge_state: "not_charged",
        }),
        { status: 400, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } },
      );
    }

    // ПРЕГРАДА ЗА ОГРАНИЧЕНИ ИДЕНТИФИКАТОРИ — преди квота, заземяване и модел.
    {
      const blocked = restrictedIdentifierBlock(body, {
        ...corsHeaders,
        ...correlationHeaders(correlationId),
      });
      if (blocked) return blocked;
    }

    if (feedback.length > 1500) {
      return new Response(JSON.stringify({ error: "Обратната връзка е твърде дълга (макс. 1500 символа)." }), {
        status: 400, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" },
      });
    }
    // КАНОНИЧЕН ОТПЕЧАТЪК на заявката — СЛЕД проверката на правата и схемата,
    // но ПРЕДИ ВСЯКА променлива външна зависимост (дневен лимит, проверка за
    // незаконно съдържание, класификация, редакция, промпт от базата, ключ на
    // доставчика, правно заземяване). Вече завършена и вече таксувана операция
    // не бива да бъде блокирана от нито една от тях.
    const requestDigest = await canonicalRequestDigest({
      purpose: "refine_contract",
      userId,
      feedback,
      answers,
      contract,
      batchId,
    });

    const {
      reserveQuota,
      commitQuota,
      cancelQuota,
      billingReconciliationResponse,
      recordReconciliation,
      lookupCommittedOperation,
      isOperationInProgress,
      operationInProgressResponse,
      responseExpiredResponse,
    } = await import("../_shared/quota-ledger.ts");
    type LedgerDb = Parameters<typeof reserveQuota>[0];
    const ledgerDb = admin as unknown as LedgerDb;
    const jsonHeaders = {
      ...corsHeaders,
      ...correlationHeaders(correlationId),
      "Content-Type": "application/json",
    };
    const ledgerBinding = {
      operationId,
      userId,
      kind: "analysis" as const,
      purpose: "refine_contract",
      batchId,
      requestDigest,
    };
    const conflictResponse = () =>
      new Response(
        JSON.stringify({
          error: "Този идентификатор вече е използван за друга заявка.",
          code: "idempotency_key_conflict",
          charge_state: "not_charged",
        }),
        { status: 409, headers: jsonHeaders },
      );
    const quotaUnavailableResponse = () =>
      new Response(
        JSON.stringify({
          error: "Проверката на квотата е временно недостъпна. Опитайте отново.",
          code: "quota_unavailable",
          charge_state: "not_charged",
        }),
        { status: 503, headers: jsonHeaders },
      );
    /** Точният записан отговор се връща такъв, какъвто е потвърден. */
    // Товарът НЕ се мутира с нови полета: точно същият текст, същите източници
    // и същият пропуск. Маркерът за повторение е САМО хедър.
    const exactReplayResponse = (payload: Record<string, unknown>) =>
      new Response(
        JSON.stringify(payload),
        { headers: { ...jsonHeaders, "X-Operation-Replay": "true" } },
      );

    // САМО-ЧЕТЯЩА проверка: без резервация, без освобождаване, без такса.
    const lookup = await lookupCommittedOperation(ledgerDb, ledgerBinding);
    if (lookup.status === "conflict") return conflictResponse();
    if (lookup.status === "unavailable") return quotaUnavailableResponse();
    if (lookup.status === "in_progress") {
      return operationInProgressResponse(
        { ...corsHeaders, ...correlationHeaders(correlationId) },
        lookup.retryAfterSeconds,
      );
    }
    if (lookup.status === "reconciliation") {
      await recordReconciliation(ledgerDb, operationId, `refine_contract_lookup:${lookup.reason}`, {
        user_id: userId,
        kind: "analysis",
      });
      return billingReconciliationResponse({ ...corsHeaders, ...correlationHeaders(correlationId) });
    }
    if (lookup.status === "response_expired") {
      // Операцията е платена, но товарът вече не се пази: изрична НОВА заявка.
      return responseExpiredResponse(
        { ...corsHeaders, ...correlationHeaders(correlationId) },
        lookup.charged,
      );
    }
    if (lookup.status === "committed") {
      const stored = lookup.resultRef;
      if (stored && stored.contract) {
        // Никакво заземяване, никакъв модел, никаква нова такса и НИКАКЪВ нов
        // пропуск за ревизия: правото е издадено веднъж при потвърждението.
        return exactReplayResponse(stored);
      }
      await recordReconciliation(ledgerDb, operationId, "refine_contract_committed_without_result", {
        user_id: userId,
        kind: "analysis",
      });
      return billingReconciliationResponse({ ...corsHeaders, ...correlationHeaders(correlationId) });
    }

    // Gate 8: НОВА AI обработка е затворена по подразбиране (само server-side env).
    // Стои СЛЕД само-четящото възпроизвеждане на завършен резултат и ПРЕДИ
    // лимита, guardIllegalContent (пише журнал), ключа, заземяването,
    // резервацията, модела и всеки бизнес запис.
    if (!isNewProcessingOpen("refine_contract")) {
      return newProcessingClosedResponse("refine_contract", { ...corsHeaders, ...correlationHeaders(correlationId) }, { charge_state: "not_charged" });
    }

    // Daily rate limit
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("function_name", "refine-contract")
      .eq("user_id", userId)
      .gte("created_at", since);
    if ((count ?? 0) >= DAILY_LIMIT) {
      return new Response(
        JSON.stringify({ error: `Достигнахте дневния лимит от ${DAILY_LIMIT} AI редакции.`, code: "rate_limited" }),
        { status: 429, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } },
      );
    }

    // ВСИЧКИ НЕТАКСУЕМИ ПРОВЕРКИ СЕ ИЗВЪРШВАТ ПРЕДИ ТАКСУВАНЕ.
    //
    // ЕДИН каноничен източник от ДОГОВОР + ОБРАТНА ВРЪЗКА + ОТГОВОРИ. И
    // проверката за незаконно съдържание, и класификацията виждат ВСИЧКИ три
    // полета — иначе лични данни в отговорите от интервюто минават непроверени.
    const { answersToText, redactRefinePayload, RefineRedactionError, buildRefineSource } =
      await import("./refine-redaction.ts");
    const contractJsonStr = JSON.stringify(contract);
    const answersText = answersToText(answers);
    const canonicalSource = buildRefineSource({
      contractJson: contractJsonStr,
      feedback,
      answersText,
    });

    const blocked = await guardIllegalContent({
      admin, text: canonicalSource.slice(0, 20000), functionName: "refine-contract",
      userId, userAgent: req.headers.get("user-agent"), corsHeaders,
    });
    if (blocked) return blocked;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY липсва");

    // GDPR/AI Act routing — върху същия каноничен източник.
    const classification = classifyDocumentBeforeAI(canonicalSource.slice(0, 40000));
    const route = routeModel("refine-contract", classification, { userConfirmed });

    if (!route.allowed) {
      await logAiAudit({
        user_id: userId, operation: "refine-contract", model: "",
        classification, redaction_applied: false, status: "blocked",
        error_code: route.blockedReason ?? "blocked",
      });
      return new Response(JSON.stringify({
        error: "Документът съдържа специални категории лични данни и не може да бъде обработен автоматично.",
        code: route.blockedReason ?? "special_category_blocked",
      }), { status: 422, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } });
    }
    if (route.requireConfirmation) {
      return new Response(JSON.stringify({
        error: "needs_confirmation",
        code: "sensitive_data_confirmation_required",
      }), { status: 200, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } });
    }

    // ЕДНА структурирана редакция за договор + обратна връзка + отговори.
    // Изпълнява се ВСЕКИ ПЪТ, независимо от маршрута: моделът, заземяването и
    // логовете НИКОГА не виждат суров потребителски текст. Ако трите граници не
    // могат да се запазят безопасно, отказваме ПРЕДИ резервацията.
    let redaction: { contractJson: string; feedback: string; answersText: string; mapping: Record<string, string> };
    try {
      redaction = redactRefinePayload(
        {
          contractJson: contractJsonStr,
          feedback,
          answersText,
        },
        (text: string) => redactForAI(text),
      );
    } catch (redErr) {
      if (redErr instanceof RefineRedactionError) {
        return new Response(
          JSON.stringify({
            error: "Съдържанието не може да бъде обработено безопасно.",
            code: "invalid_payload",
            charge_state: "not_charged",
          }),
          { status: 400, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } },
        );
      }
      throw redErr;
    }
    const feedbackRedacted = redaction.feedback;

    const redactionApplied = Object.keys(redaction.mapping).length > 0;
    const redactionNote = redactionApplied
      ? "Забележка: Лични данни са заменени с плейсхолдъри <NAME_1>, <EGN_1>. Запази ги дословно.\n"
      : "";

    const userPrompt = `${redactionNote}СЪЩЕСТВУВАЩ ДОГОВОР (JSON):
${redaction.contractJson}

ОБРАТНА ВРЪЗКА ОТ ПОТРЕБИТЕЛЯ:
"""
${feedbackRedacted}
"""

КОНТЕКСТ ОТ ИНТЕРВЮТО (за справка, не променяй ако не е нужно):
${redaction.answersText}

Върни коригирания договор (или непроменен, ако обратната връзка не е основателна) в указания JSON формат.`;

    const rawSystem = await loadActivePrompt(admin, "refine-contract", SYSTEM_PROMPT);


    // СТРОГО ЗАЗЕМЯВАНЕ за точно тази (редактирана) заявка — ПРЕДИ таксуване
    // и преди всяко повикване към модела.
    const { retrieveLegalContext } = await import("../_shared/legal-rag.ts");
    const legal = await retrieveLegalContext(
      admin,
      LOVABLE_API_KEY,
      `${feedbackRedacted}\n${redaction.contractJson.slice(0, 3000)}`,
      { matchCount: 6 },
    );
    if (!legal.hasMatches) {
      const { legalVerificationUnavailableResponse } = await import("../_shared/legal-gate.ts");
      return legalVerificationUnavailableResponse({
        headers: { ...corsHeaders, ...correlationHeaders(correlationId) },
      });
    }
    const baseSystem = `${rawSystem}\n\n${legal.promptBlock}`;

    // ТАКСУВАНЕ: след всички непарични проверки. ЕДИН леджър, идемпотентен по
    // ключа на операцията и обвързан със съдържанието на заявката.
    const reservation = await reserveQuota(ledgerDb, ledgerBinding);
    if (reservation.status === "conflict") return conflictResponse();
    if (reservation.status === "reconciliation") {
      await recordReconciliation(ledgerDb, operationId, `refine_contract_reserve:${reservation.reason}`, {
        user_id: userId,
        kind: "analysis",
      });
      return billingReconciliationResponse({ ...corsHeaders, ...correlationHeaders(correlationId) });
    }
    if (reservation.status === "unavailable") return quotaUnavailableResponse();
    if (reservation.status === "denied") {
      return new Response(
        JSON.stringify({ error: "quota_exceeded", reason: reservation.reason, charge_state: "not_charged" }),
        { status: 402, headers: jsonHeaders },
      );
    }

    /**
     * НОВ пропуск за ревизия на ПРОМЕНЕНИЯ текст. Старият пропуск е обвързан с
     * предишното съдържание и не бива да важи след прецизиране. Липсващ ключ не
     * е грешка тук — ревизията просто ще поиска запазен документ. Издава се
     * ТОЧНО ВЕДНЪЖ, преди потвърждението, и се запазва в отговора.
     */
    const reviewGrantForRefinedContract = async (
      ownerId: string | null,
      contract: unknown,
    ): Promise<Record<string, unknown>> => {
      try {
        const [{ issueGrantForGeneratedContent, reviewGrantSecret }, { renderCanonicalPlainText }] =
          await Promise.all([
            import("../_shared/review-grant.ts"),
            import("../_shared/generated-document-quality.ts"),
          ]);
        const text = renderCanonicalPlainText(contract);
        if (!text.trim()) return {};
        const grant = await issueGrantForGeneratedContent({
          secret: reviewGrantSecret(),
          ownerId,
          documentText: text,
        });
        return grant ? { review_grant: grant } : {};
      } catch {
        return {};
      }
    };

    // ТОЧНО ПОВТОРЕНИЕ, ако операцията е завършила между четенето и
    // резервацията: връща се точно записаният отговор, без ново генериране,
    // без второ таксуване и без нов пропуск.
    const priorRef = reservation.resultRef;
    if (priorRef && priorRef.contract) {
      return exactReplayResponse(priorRef);
    }

    // ЕДНОВРЕМЕННО ИЗПЪЛНЕНИЕ ПО СЪЩИЯ КЛЮЧ: повторение на още незавършена
    // резервация БЕЗ записан резултат НИКОГА не стартира второ повикване към
    // модела. Доказано отменена резервация (retry) е нормален нов опит.
    if (isOperationInProgress(reservation)) {
      return operationInProgressResponse(
        { ...corsHeaders, ...correlationHeaders(correlationId) },
        4,
      );
    }

    /**
     * ЕДИНСТВЕН КОМПЕНСИРАЩ ПАЗИТЕЛ през леджъра. „charged: false" се твърди
     * САМО при доказана отмяна; иначе типизиран billing_reconciliation_required
     * и траен запис за изравняване.
     */
    let compensated = false;
    const cancelOrReport = async (reason: string): Promise<Response | null> => {
      if (compensated) return null;
      const outcome = await cancelQuota(ledgerDb, operationId, reason);
      if (outcome.status !== "settled") {
        await recordReconciliation(
          ledgerDb,
          operationId,
          `refine_contract_cancel_failed:${outcome.reason}`,
          { user_id: userId, kind: "analysis" },
        );
        return billingReconciliationResponse({ ...corsHeaders, ...correlationHeaders(correlationId) });
      }
      compensated = true;
      return null;
    };

    try {
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: route.model,
        messages: [
          { role: "system", content: baseSystem },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      const unresolved = await cancelOrReport(`ai_gateway_${aiResp.status}`);
      await logAiAudit({
        user_id: userId, operation: "refine-contract", model: route.model,
        classification, redaction_applied: redactionApplied,
        status: "error", error_code: `http_${aiResp.status}`,
      });
      if (unresolved) return unresolved;
      // Тялото на шлюза НЕ се връща и НЕ се логва: може да носи части от
      // документа на потребителя.
      const { normalizeGatewayStatus, gatewayErrorResponse } = await import(
        "../_shared/gateway-error.ts"
      );
      console.error("AI gateway status:", aiResp.status);
      return gatewayErrorResponse(
        normalizeGatewayStatus(aiResp.status),
        { ...corsHeaders, ...correlationHeaders(correlationId) },
        { charged: false, charge_state: "cancelled" },
      );
    }

    const raw = await aiResp.json();
    const content: string = raw.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) throw new Error("Празен AI отговор");
    const { parseAiJsonWithRetry } = await import("../_shared/ai-json-retry.ts");
    const parsed = (await parseAiJsonWithRetry({
      content,
      messages: [
        { role: "system", content: baseSystem },
        { role: "user", content: userPrompt },
      ],
      model: route.model,
      apiKey: LOVABLE_API_KEY,
      fn: "refine-contract",
      correlationId,
      regenerateAttempts: 1,
      validate: (p: any) => !!p?.contract,
    })).parsed as {
      contract?: unknown;
      changed_clause_numbers?: string[];
      change_summary?: string;
      // Схемата на refine-contract НЕ включва risk — виж бележката по Q4a долу.
    };



    if (!parsed?.contract) throw new Error("AI не върна contract");

    // Unredact
    if (Object.keys(redaction.mapping).length > 0) {
      try {
        const walk = (v: unknown): unknown => {
          if (typeof v === "string") return unredact(v, redaction.mapping);
          if (Array.isArray(v)) return v.map(walk);
          if (v && typeof v === "object") {
            const out: Record<string, unknown> = {};
            for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = walk(val);
            return out;
          }
          return v;
        };
        parsed.contract = walk(parsed.contract);
        if (typeof parsed.change_summary === "string") {
          parsed.change_summary = unredact(parsed.change_summary, redaction.mapping);
        }
      } catch (e) {
        console.error("unredact failed:", e);
      }
    }

    // Q4a — ВАЖНО: промптът на refine-contract НЕ изисква и схемата НЕ връща
    // свеж risk анализ (връща се само коригиран договор + резюме на промените).
    // Затова тук НЯМА gate и НЯМА манифест за качество: рискът остава ОТСЪСТВАЩ
    // и се преоценява там, където реално се прави анализ. Манифест не се издава
    // за отговор без risk — иначе бихме удостоверили нещо непроверено.

    // ЕДИН ТОЧЕН ОТГОВОР: сглобява се ВЕДНЪЖ, включително НОВИЯ пропуск за
    // ревизия на променения текст, и се записва ЦЯЛОСТНО при потвърждението.
    // Така повторен опит връща същия отговор и същия пропуск, без ново право.
    const exactPayload: Record<string, unknown> = {
      contract: parsed.contract,
      changed_clause_numbers: parsed.changed_clause_numbers ?? [],
      change_summary: parsed.change_summary ?? "",
      citations: legal.citations,
      // Прецизирането ПРОМЕНЯ текста, затова старият пропуск за ревизия вече не
      // важи: издава се НОВ пропуск за точно този нов текст — точно веднъж.
      ...(await reviewGrantForRefinedContract(userId, parsed.contract)),
      charge_state: "charged",
    };

    // ПОТВЪРЖДЕНИЕ + ОБВЪРЗВАНЕ на резултата ПРЕДИ 200: повторен опит по същия
    // ключ връща точно този текст. Недоказано потвърждение НЕ дава 200.
    const settlement = await commitQuota(ledgerDb, operationId, exactPayload);
    if (settlement.status !== "settled") {
      await recordReconciliation(
        ledgerDb,
        operationId,
        `refine_contract_commit_unresolved:${settlement.reason}`,
        { user_id: userId, kind: "analysis" },
      );
      await logAiAudit({
        user_id: userId, operation: "refine-contract", model: route.model,
        classification, redaction_applied: redactionApplied,
        status: "error", error_code: "commit_unresolved",
      });
      return billingReconciliationResponse({ ...corsHeaders, ...correlationHeaders(correlationId) });
    }
    compensated = true;

    await logAiAudit({
      user_id: userId, operation: "refine-contract", model: route.model,
      classification, redaction_applied: redactionApplied,
      status: "ok",
      tokens_in: raw?.usage?.prompt_tokens,
      tokens_out: raw?.usage?.completion_tokens,
    });

    // ai_usage се записва САМО при успешен краен изход.
    await admin.from("ai_usage").insert({ user_id: userId, function_name: "refine-contract" });

    // Връща се ТОЧНО записаният отговор (ако леджърът го е върнал обратно).
    const committedPayload = settlement.resultRef ?? exactPayload;
    return new Response(JSON.stringify(committedPayload), {
      headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" },
    });

    } catch (afterCharge) {
      // Всеки неуспешен краен изход след таксуване отменя вълната точно веднъж.
      const unresolved = await cancelOrReport(
        `exception:${String((afterCharge as Error)?.message ?? afterCharge).slice(0, 200)}`,
      );
      if (unresolved) return unresolved;
      throw afterCharge;
    }
  } catch (e) {

    // Нормализиран запис и отговор: без вътрешни съобщения и тела от шлюза.
    console.error("refine-contract error", {
      cid: correlationId,
      name: e instanceof Error ? e.name : "unknown",
    });
    return new Response(JSON.stringify({
      error: "Възникна вътрешна грешка. Опитайте отново.",
      code: "internal_error",
      correlation_id: correlationId,
    }), {
      status: 500, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" },
    });
  }
});
