// Edge function: Pro-only — apply selected risk recommendations to an existing contract
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";
import { loadActivePrompt } from "../_shared/prompt-loader.ts";
import { guardIllegalContent } from "../_shared/illegal-content.ts";
import { classifyDocumentBeforeAI } from "../_shared/classify.ts";
import { redactForAI, unredact } from "../_shared/redact.ts";
import { routeModel } from "../_shared/model-router.ts";
import { logAiAudit } from "../_shared/ai-call.ts";
import { getCorrelationId, correlationHeaders } from "../_shared/correlation.ts";
import {
  applyRiskConsistencyGate,
  buildQualityManifest,
  qualitySigningSecretFromEnv,
  flattenGeneratedContract,
  mergeIntentFindingsIntoRisk,
  verifyManifestSignatureOnly,
} from "../_shared/generated-document-quality.ts";
import {
  detectArbitrationInText,
  detectBilingualStructure,
  verifyIntentAssertions,
} from "../_shared/intent-assertions.ts";


const SYSTEM_PROMPT = `Ти си водещ български правен архитект. Получаваш съществуващ договор (в JSON) и списък от ИЗБРАНИ препоръки/слаби места, които трябва да коригираш в текста.
Запази всички останали клаузи, формат, номерация и стил. Промени САМО това, което е необходимо, за да адресираш избраните препоръки. Където е нужно — добави нови клаузи или алинеи в съответния раздел (или нов раздел "Допълнителни защитни клаузи").
След корекциите направи и нов кратък Risk Analysis на коригирания договор. В "issues" влизат САМО ПРОВЕРЕНИ дефекти с опора в конкретен текст на клауза (противоречие, нищожност, незаконност, прекомерна неустойка, липсващ задължителен по закон елемент). Опционалните подобрения и локалното попълване на лични данни влизат в "recommendations". Нула issues е валиден резултат.

ВАЖНО: Договори.нет НЕ събира лични данни (имена, ЕГН, адреси, IBAN, контакти) — потребителят ги попълва локално след сваляне. Липсата на такива данни НЕ Е issue/слабо място и НЕ понижава risk score. Ако липсват — не добавяй issue, а ЕДНА recommendation с точния текст: "Попълнете личните данни (имена, ЕГН/ЕИК, адреси, IBAN, контакти) от Вашето устройство след сваляне — Договори.нет работи съобразно изискванията за предпазване от разкриване на чувствителни лични данни." В текста на договора използвай плейсхолдъри в квадратни скоби ([име], [ЕГН/ЕИК], [адрес]).

Връщай СТРОГО валиден JSON със същата структура като входа:
{
  "risk": { "level": "low"|"medium"|"high", "score": 0-100, "summary": "...", "issues": [{"severity":"...","title":"...","detail":"..."}], "recommendations": ["..."] },
  "contract": { "title": "...", "preamble": "...", "clauses": [{"number":"I.","title":"...","body":"..."}], "closing": "..." },
  "applied": ["кратко описание какво е променено за всяка избрана препоръка"]
}
Никакви markdown ограждания. Всички парични суми са в евро (€).`;

const DAILY_CORRECTION_LIMIT = 50;

/**
 * ДЕТЕРМИНИРАН UUID на "такса-единица" от вълната поправки, извеждан от
 * клиентския operation_id. Единица 0 е ПЪРВИЧНАТА операция (самият
 * operation_id) — тя носи точния отговор. Единици 1..N-1 са ЧИСТИ
 * такса-единици (без съдържание), обвързани със СЪЩИЯ каноничен отпечатък и
 * batch_id, нужни за да се удържат РЕАЛНО ceil(corrections_count/5) операции
 * от леджъра, вместо само една. UUID-ите са СТАБИЛНИ за дадена (operationId,
 * index) двойка — повторен опит по същия operation_id извежда СЪЩИТЕ ключове
 * на под-операциите, което пази идемпотентността на цялата вълна.
 */
async function deriveCorrectionsUnitOperationId(operationId: string, index: number): Promise<string> {
  const data = new TextEncoder().encode(`${operationId}:corrections-unit:${index}`);
  const digestBuf = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digestBuf).slice(0, 16);
  // Версия 4 / вариант RFC4122 бита — само за валиден UUID формат, стойността
  // остава ДЕТЕРМИНИРАНА (не е случайна).
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}



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
    const {
      contract,
      risk,
      selectedIssues = [],
      selectedRecommendations = [],
      answers = {},
      session_id: sessionId,
      batch_id: batchIdRaw,
      userConfirmed = false,
      // Непрозрачен ПОДПИСАН манифест от предходния етап. Браузърът не може да
      // го създаде или редактира — само да го пренесе непроменен.
      quality_manifest: incomingManifest = null,
    } = body ?? {};

    const { asUuidOrNull, canonicalRequestDigest } = await import("../_shared/canonical-digest.ts");
    // Клиентският ключ на операцията е ЗАДЪЛЖИТЕЛЕН: без него повторният опит
    // не е идемпотентен и би генерирал и таксувал наново цялата вълна поправки.
    const rawClientOpId = body?.operation_id ?? body?.client_operation_id;
    const operationId = asUuidOrNull(rawClientOpId);
    // batch_id е част от обвързването на ключа (вълна поправки), ако е подаден.
    const batchId = asUuidOrNull(batchIdRaw);

    if (!contract || (selectedIssues.length === 0 && selectedRecommendations.length === 0)) {
      return new Response(JSON.stringify({ error: "Нищо за коригиране" }), {
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

    // Stepped wave charging: 1-5 corrections = 1 op, 6-10 = 2, ... ceil(n/5),
    // минимум 1. Тази ЦЕНА не се променя от прехода към единния леджър — виж
    // коментара при резервацията по-долу за точно какво плаща леджърът.
    const correctionsCount =
      (Array.isArray(selectedIssues) ? selectedIssues.length : 0) +
      (Array.isArray(selectedRecommendations) ? selectedRecommendations.length : 0);
    const opsForWave = Math.max(1, Math.ceil(correctionsCount / 5));

    // КАНОНИЧЕН ОТПЕЧАТЪК на заявката — СЛЕД проверката на правата и схемата,
    // но ПРЕДИ ВСЯКА променлива външна зависимост (дневен лимит, проверка за
    // незаконно съдържание, класификация, редакция, промпт от базата, ключ на
    // доставчика, правно заземяване). Обхваща ЦЕЛИЯ семантичен товар: договор
    // + точния списък поправки (issues + recommendations) + отговори.
    const requestDigest = await canonicalRequestDigest({
      purpose: "apply_corrections",
      userId,
      batchId,
      contract,
      selectedIssues,
      selectedRecommendations,
      answers,
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
      purpose: "apply_corrections",
      sessionId: asUuidOrNull(sessionId),
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
    // и същата вълна. Маркерът за повторение е САМО хедър.
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
      await recordReconciliation(ledgerDb, operationId, `apply_corrections_lookup:${lookup.reason}`, {
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
      await recordReconciliation(ledgerDb, operationId, "apply_corrections_committed_without_result", {
        user_id: userId,
        kind: "analysis",
      });
      return billingReconciliationResponse({ ...corsHeaders, ...correlationHeaders(correlationId) });
    }

    // Pro check. Free users get up to 2 free correction waves (per user, lifetime),
    // tracked via download_quota.corrections_free_used_count.
    const { data: q } = await admin.from("download_quota")
      .select("plan, pro_until, corrections_free_used_count")
      .eq("user_id", userId).maybeSingle();
    const isPro = !!q && (q.plan === "pro" || (!!q.pro_until && new Date(q.pro_until) > new Date()));
    const freeWavesUsed = Number((q as any)?.corrections_free_used_count ?? 0);
    const FREE_WAVES_ALLOWED = 2;
    if (!isPro && freeWavesUsed >= FREE_WAVES_ALLOWED) {
      return new Response(JSON.stringify({ error: "pro_required", code: "free_corrections_exhausted" }), {
        status: 402, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" },
      });
    }

    // Daily rate limit per Pro user (50 corrections / 24h)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("function_name", "apply-corrections")
      .eq("user_id", userId)
      .gte("created_at", since);
    if ((count ?? 0) >= DAILY_CORRECTION_LIMIT) {
      return new Response(
        JSON.stringify({
          error: `Достигнахте дневния лимит от ${DAILY_CORRECTION_LIMIT} AI корекции. Опитайте отново след 24 часа.`,
          code: "rate_limited",
        }),
        { status: 429, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } },
      );
    }

    // Illegal content guard
    const guardText = [
      JSON.stringify(contract).slice(0, 8000),
      ...selectedIssues.map((i: any) => `${i.title} ${i.detail}`),
      ...selectedRecommendations.map((r: string) => r),
      ...Object.values(answers ?? {}).map((v) => String(v ?? "")),
    ].join("\n");
    const blocked = await guardIllegalContent({
      admin, text: guardText, functionName: "apply-corrections",
      userId,
      userAgent: req.headers.get("user-agent"),
      corsHeaders,
    });
    if (blocked) return blocked;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY липсва");

    const issuesBlock = selectedIssues.length
      ? "ИЗБРАНИ СЛАБИ МЕСТА:\n" + selectedIssues.map((i: any, n: number) => `${n + 1}. [${i.severity}] ${i.title} — ${i.detail}`).join("\n")
      : "";
    const recsBlock = selectedRecommendations.length
      ? "ИЗБРАНИ ПРЕПОРЪКИ:\n" + selectedRecommendations.map((r: string, n: number) => `${n + 1}. ${r}`).join("\n")
      : "";

    // === GDPR/AI Act compliance layer ===
    const sourceText = [
      JSON.stringify(contract).slice(0, 20000),
      ...Object.values(answers ?? {}).map((v) => String(v ?? "")),
    ].join("\n");
    const classification = classifyDocumentBeforeAI(sourceText);
    const route = routeModel("apply-corrections", classification, { userConfirmed });

    if (!route.allowed) {
      // Няма таксуване преди правната проверка — няма и какво да се възстановява.
      await logAiAudit({
        user_id: userId, operation: "apply-corrections", model: "",
        classification, redaction_applied: false, status: "blocked",
        error_code: route.blockedReason ?? "blocked",
      });
      return new Response(JSON.stringify({
        error: "Документът съдържа специални категории лични данни и не може да бъде обработен автоматично.",
        code: route.blockedReason ?? "special_category_blocked",
        classification: {
          risk_level: classification.risk_level,
          contains_special_category_data: classification.contains_special_category_data,
          reasons: classification.reasons,
        },
      }), { status: 422, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } });
    }

    if (route.requireConfirmation) {
      return new Response(JSON.stringify({
        error: "needs_confirmation",
        code: "sensitive_data_confirmation_required",
        classification: {
          risk_level: classification.risk_level,
          contains_personal_data: classification.contains_personal_data,
          contains_special_category_data: classification.contains_special_category_data,
          pii_counts: classification.pii_counts,
          reasons: classification.reasons,
        },
      }), { status: 200, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } });
    }

    const contractJsonStr = JSON.stringify(contract);
    const redaction = route.redactionRequired
      ? redactForAI(contractJsonStr)
      : { redacted: contractJsonStr, mapping: {}, stats: {} };
    const answersStr = Object.entries(answers).map(([k, v]) => `- ${k}: ${v}`).join("\n");
    const answersRedacted = route.redactionRequired
      ? (() => {
          const r = redactForAI(answersStr);
          // Merge mappings so unredact restores both contract and answers content.
          Object.assign(redaction.mapping, r.mapping);
          return r.redacted;
        })()
      : answersStr;

    const redactionNote = route.redactionRequired
      ? "Забележка: Лични данни (имена, ЕГН, IBAN, адреси, телефони, ел.поща) са заменени с плейсхолдъри от вида <NAME_1>, <EGN_1>. Запази ги дословно в изхода — НЕ ги променяй.\n"
      : "";

    const userPrompt = `${redactionNote}СЪЩЕСТВУВАЩ ДОГОВОР (JSON):
${redaction.redacted}

ТЕКУЩ RISK:
${risk ? JSON.stringify(risk) : "(не е предоставен)"}

${issuesBlock}

${recsBlock}

КОНТЕКСТ ОТ ИНТЕРВЮТО:
${answersRedacted}

Задача: Коригирай договора така, че да адресира САМО избраните препоръки/слаби места. Не променяй несвързани клаузи. Накрая върни нов risk анализ на коригирания договор и списък "applied" с кратко описание на промените.`;

    const baseSystem = await loadActivePrompt(admin, "apply-corrections", SYSTEM_PROMPT);
    const { retrieveLegalContext } = await import("../_shared/legal-rag.ts");
    const legal = await retrieveLegalContext(admin, LOVABLE_API_KEY, `${issuesBlock}\n${recsBlock}`.slice(0, 4000), { matchCount: 6 });
    // FAIL-CLOSED: без проверена, релевантна на ТАЗИ заявка норма няма нито
    // повикване към модел, нито таксуване на вълна от поправки.
    if (!legal.hasMatches) {
      const { legalVerificationUnavailableResponse } = await import("../_shared/legal-gate.ts");
      return legalVerificationUnavailableResponse({ headers: { ...corsHeaders, ...correlationHeaders(correlationId) } });
    }
    const activeSystemPrompt = `${baseSystem}\n\n${legal.promptBlock}`;

    // ТАКСУВАНЕ: след всички непарични проверки. ЕДИН леджър, идемпотентен по
    // ключа на операцията, но ЦЯЛАТА вълна поправки трябва да удържи РЕАЛНАТА
    // стъпаловидна цена ceil(corrections_count/5) (минимум 1) — НЕ винаги 1.
    //
    // Постигаме това с `opsForWave` ДЕТЕРМИНИРАНИ единици в леджъра:
    //  - Единица 0 е САМИЯТ operation_id (ПЪРВИЧНАТА операция). Тя пази
    //    ТОЧНИЯ отговор (result_ref) — именно нея чете lookupCommittedOperation
    //    по-горе за целите на точния replay.
    //  - Единици 1..opsForWave-1 са ЧИСТИ такса-единици, изведени детерминирано
    //    от operation_id (виж deriveCorrectionsUnitOperationId) и обвързани със
    //    СЪЩИЯ каноничен отпечатък (requestDigest) и batch_id — те НЕ носят
    //    съдържание на договора, само {wave_unit, primary_operation_id}.
    // Резултатът: за вълна от 12 поправки (opsForWave=3) леджърът РЕАЛНО удържа
    // 3 операции, а не 1 — цената вече НЕ е мълчаливо занижена.
    const opsUnitIds: string[] = [operationId];
    for (let i = 1; i < opsForWave; i++) {
      opsUnitIds.push(await deriveCorrectionsUnitOperationId(operationId, i));
    }
    const unitLedgerBinding = (unitOperationId: string) => ({
      operationId: unitOperationId,
      userId,
      kind: "analysis" as const,
      purpose: "apply_corrections",
      sessionId: asUuidOrNull(sessionId),
      batchId,
      requestDigest,
    });

    const reservation = await reserveQuota(ledgerDb, ledgerBinding);
    if (reservation.status === "conflict") return conflictResponse();
    if (reservation.status === "reconciliation") {
      await recordReconciliation(ledgerDb, operationId, `apply_corrections_reserve:${reservation.reason}`, {
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

    // ТОЧНО ПОВТОРЕНИЕ, ако операцията е завършила между четенето и
    // резервацията: връща се точно записаният отговор, без ново генериране,
    // без второ таксуване.
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

    const batchCharged = reservation.charged === true;

    // Единиците, РЕЗЕРВИРАНИ (не потвърдени) в ТОЗИ опит — точно тях отменяме
    // при провал. Първичната единица вече е резервирана по-горе.
    const reservedUnitIds: string[] = [operationId];
    // Единици, вече ПОТВЪРДЕНИ от предходен (частично успешен) опит — не се
    // таксуват повторно и НЕ подлежат на отмяна (потвърдено е окончателно).
    const alreadyCommittedUnitIds: string[] = [];

    /**
     * ЕДИНСТВЕН КОМПЕНСИРАЩ ПАЗИТЕЛ през леджъра — отменя ВСИЧКИ единици,
     * резервирани в ТОЗИ опит (първичната + всички допълнителни такса-единици).
     * „charged: false" се твърди САМО когато ВСИЧКИ отмени са доказани; иначе
     * типизиран billing_reconciliation_required и траен запис за изравняване.
     * Никога не оставяме частично таксувана вълна, която е произвела документ.
     */
    let compensated = false;
    const cancelOrReport = async (reason: string): Promise<Response | null> => {
      if (compensated) return null;
      let allProven = true;
      for (const unitId of reservedUnitIds) {
        const outcome = await cancelQuota(ledgerDb, unitId, reason);
        if (outcome.status !== "settled") {
          allProven = false;
          await recordReconciliation(
            ledgerDb,
            operationId,
            `apply_corrections_cancel_failed:${outcome.reason}`,
            { user_id: userId, kind: "analysis", unit_operation_id: unitId },
          );
        }
      }
      if (!allProven) {
        return billingReconciliationResponse({ ...corsHeaders, ...correlationHeaders(correlationId) });
      }
      compensated = true;
      return null;
    };

    // Резервираме ОСТАНАЛИТЕ такса-единици на вълната (i = 1..opsForWave-1)
    // ПРЕДИ повикването към модела — ЕДНО-ЕДИНСТВЕНО извикване на модела за
    // ЦЯЛАТА вълна, но пълната ѝ РЕАЛНА цена трябва да е удържана преди него.
    // Ако която и да е допълнителна единица не може да се резервира (изчерпана
    // квота), ОТМЕНЯМЕ всичко резервирано дотук в този опит и връщаме типизиран
    // отговор „изчерпана квота" — никога частично таксувана вълна.
    for (let i = 1; i < opsForWave; i++) {
      const unitId = opsUnitIds[i];
      const unitReservation = await reserveQuota(ledgerDb, unitLedgerBinding(unitId));
      if (unitReservation.status === "conflict") {
        const unresolved = await cancelOrReport("apply_corrections_extra_unit_conflict");
        return unresolved ?? conflictResponse();
      }
      if (unitReservation.status === "reconciliation") {
        await recordReconciliation(ledgerDb, operationId, `apply_corrections_extra_reserve:${unitReservation.reason}`, {
          user_id: userId,
          kind: "analysis",
          unit_operation_id: unitId,
        });
        await cancelOrReport(`apply_corrections_extra_unit_reconciliation:${unitReservation.reason}`);
        return billingReconciliationResponse({ ...corsHeaders, ...correlationHeaders(correlationId) });
      }
      if (unitReservation.status === "unavailable") {
        const unresolved = await cancelOrReport("apply_corrections_extra_unit_unavailable");
        return unresolved ?? quotaUnavailableResponse();
      }
      if (unitReservation.status === "denied") {
        // Изчерпана квота за допълнителна единица: отменяме ЦЕЛИЯ опит (вкл.
        // първичната единица) — не съществува „частична" вълна поправки.
        const unresolved = await cancelOrReport(`apply_corrections_extra_unit_denied:${unitReservation.reason}`);
        if (unresolved) return unresolved;
        return new Response(
          JSON.stringify({ error: "quota_exceeded", reason: unitReservation.reason, charge_state: "not_charged" }),
          { status: 402, headers: jsonHeaders },
        );
      }
      if (isOperationInProgress(unitReservation)) {
        // Едновременно изпълнение по ключа на ТАЗИ такса-единица: отменяме
        // всичко резервирано в ТОЗИ опит и връщаме типизиран „в ход".
        const unresolved = await cancelOrReport("apply_corrections_extra_unit_in_progress_abort");
        if (unresolved) return unresolved;
        return operationInProgressResponse(
          { ...corsHeaders, ...correlationHeaders(correlationId) },
          4,
        );
      }
      if (unitReservation.ledgerState === "committed") {
        // Идемпотентно повторение: тази такса-единица вече е потвърдена от
        // предходен (частично успешен) опит по СЪЩИЯ operation_id — не се
        // таксува повторно и НЕ се добавя към списъка за отмяна.
        alreadyCommittedUnitIds.push(unitId);
      } else {
        reservedUnitIds.push(unitId);
      }
    }

    try {
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: route.model,
        messages: [
          { role: "system", content: activeSystemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      const unresolved = await cancelOrReport(`ai_gateway_${aiResp.status}`);
      await logAiAudit({
        user_id: userId, operation: "apply-corrections", model: route.model,
        classification, redaction_applied: route.redactionRequired,
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

    // Increment free-wave counter for free users (only on fresh, non-cached charge).
    if (!isPro && batchCharged) {
      await admin
        .from("download_quota")
        .update({ corrections_free_used_count: freeWavesUsed + 1 })
        .eq("user_id", userId);
    }

    const raw = await aiResp.json();
    const content: string = raw.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) throw new Error("Празен AI отговор");
    const { parseAiJsonWithRetry } = await import("../_shared/ai-json-retry.ts");
    const parsed = (await parseAiJsonWithRetry({
      content,
      messages: [
        { role: "system", content: activeSystemPrompt },
        { role: "user", content: userPrompt },
      ],
      model: route.model,
      apiKey: LOVABLE_API_KEY,
      fn: "apply-corrections",
      correlationId,
      regenerateAttempts: 1,
    })).parsed as Record<string, unknown>;

    // Unredact AI output so the user sees real names/EGN/IBAN in the final doc.
    // Walk the parsed object and replace placeholders directly in string leaves
    // to avoid JSON round-trip issues when original values contain control chars.
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
        const restored = walk(parsed);
        if (restored && typeof restored === "object" && !Array.isArray(restored)) {
          Object.assign(parsed, restored as Record<string, unknown>);
        }
      } catch (e) {
        console.error("unredact failed:", e);
      }
    }

    if (!parsed?.contract) throw new Error("AI не върна contract");

    // Q4a — коригираният документ носи СВЕЖ risk анализ: минава през същия
    // детерминиран gate, за да не се появят отново недоказани самокритики.
    if (parsed?.risk) {
      const p = parsed as Record<string, unknown>;
      const signingSecret = qualitySigningSecretFromEnv();
      if (!signingSecret) console.error("quality manifest signing key unavailable");
      const documentText = flattenGeneratedContract(p.contract);
      // Q4b(3) — пренасяне на намерението през корекцията. Приемат се САМО
      // твърдения от манифест с ВАЛИДЕН НАШ подпис. „Подписано ОЧАКВАНО
      // намерение" и „текущо изпълнение" са РАЗЛИЧНИ неща: целият валиден
      // затворен набор се пренася в новия обвързан манифест — включително
      // твърденията, които коригираният текст в момента НАРУШАВА. Иначе по-късна
      // ревизия/анализ би „забравила" изричния избор на потребителя и би минала.
      // Наборът пада ИЗЦЯЛО само при невалидна/подправена схема или подпис.
      const carried = await verifyManifestSignatureOnly({
        manifest: incomingManifest,
        signingSecret,
      });
      const carriedIntents = carried?.intents ?? [];
      const carryReport = await verifyIntentAssertions({
        assertions: carriedIntents,
        documentText,
        serverSecret: signingSecret,
        structuralFlags: {
          bilingual: detectBilingualStructure(p.contract) ?? undefined,
          arbitration: detectArbitrationInText(documentText) ?? undefined,
        },
      });
      const qualityManifest = signingSecret ? await buildQualityManifest({
        origin: "apply-corrections",
        signingSecret,
        contract: p.contract,
        intents: carriedIntents,

        decisions: [
          "placeholders_for_personal_data",
          "local_completion_of_personal_data",
          "optional_annex_details",
          "standard_clause_set",
        ],
      }) : null;
      const gated = applyRiskConsistencyGate({
        risk: p.risk,
        documentText,
        origin: "apply-corrections",
        manifest: qualityManifest,
        trustedManifest: !!qualityManifest,
      });
      const withIntent = mergeIntentFindingsIntoRisk({ risk: gated.risk, report: carryReport });
      p.risk = withIntent.risk;
      p.quality = { ...gated.quality, intent: { checked: carryReport.checked, satisfied: carryReport.satisfied, mismatched: carryReport.mismatched_required.length } };
      if (qualityManifest) p.quality_manifest = qualityManifest;
      // СЪРВЪРНО издаден ЕДНОКРАТЕН пропуск за ревизия на ТОЧНО този текст.
      {
        const { issueGrantForGeneratedContent, reviewGrantSecret } = await import(
          "../_shared/review-grant.ts"
        );
        const reviewGrant = await issueGrantForGeneratedContent({
          secret: reviewGrantSecret(),
          ownerId: userId,
          documentText,
        });
        if (reviewGrant) p.review_grant = reviewGrant;
      }
    }

    // ЕДИН ТОЧЕН ОТГОВОР: сглобява се ВЕДНЪЖ и се записва ЦЯЛОСТНО при
    // потвърждението. Полето ops_charged документира ИЗЧИСЛЕНАТА стъпаловидна
    // цена на вълната (виж коментара при резервацията) — то е ИНФОРМАТИВНО и
    // НЕ означава, че леджърът е удържал повече от 1 операция.
    const exactPayload: Record<string, unknown> = {
      ...parsed,
      ops_charged: opsForWave,
      corrections_count: correctionsCount,
      batch_id: batchId,
      charge_state: "charged",
    };

    // ПОТВЪРЖДЕНИЕ + ОБВЪРЗВАНЕ на резултата ПРЕДИ 200: повторен опит по същия
    // ключ връща точно този текст. Недоказано потвърждение НЕ дава 200.
    const settlement = await commitQuota(ledgerDb, operationId, exactPayload);
    if (settlement.status !== "settled") {
      await recordReconciliation(
        ledgerDb,
        operationId,
        `apply_corrections_commit_unresolved:${settlement.reason}`,
        { user_id: userId, kind: "analysis" },
      );
      await logAiAudit({
        user_id: userId, operation: "apply-corrections", model: route.model,
        classification, redaction_applied: route.redactionRequired,
        status: "error", error_code: "commit_unresolved",
      });
      return billingReconciliationResponse({ ...corsHeaders, ...correlationHeaders(correlationId) });
    }
    compensated = true;

    await logAiAudit({
      user_id: userId, operation: "apply-corrections", model: route.model,
      classification, redaction_applied: route.redactionRequired,
      status: "ok",
      tokens_in: raw?.usage?.prompt_tokens,
      tokens_out: raw?.usage?.completion_tokens,
    });

    // ai_usage се записва САМО при успешен краен изход.
    await admin.from("ai_usage").insert({ user_id: userId, function_name: "apply-corrections" });

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
    // Нормализиран запис и отговор: без вътрешни съобщения, тела от шлюза
    // или сурово потребителско съдържание на договора.
    console.error("apply-corrections error", {
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
