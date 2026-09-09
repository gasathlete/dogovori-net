// Edge function: AI generation of risk analysis & contract
// Uses Lovable AI Gateway (Gemini) — no API key needed by user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors, hashIp, clientIp } from "../_shared/cors.ts";
import { sha256Hex } from "../_shared/normalize.ts";
import { extractJson } from "../_shared/json.ts";
import { loadActivePrompt } from "../_shared/prompt-loader.ts";
import { guardIllegalContent } from "../_shared/illegal-content.ts";
import { getDocumentTypeSpec, inferDocumentType } from "../_shared/document-types.ts";
import { classifyDocumentBeforeAI } from "../_shared/classify.ts";
import { unredact } from "../_shared/redact.ts";
import {
  buildGeneratorCacheIdentity,
  buildGeneratorClassificationCorpus,
  buildGeneratorContext,
  buildQaLines,
  redactGeneratorContext,
} from "./generator-context.ts";
import { routeModel } from "../_shared/model-router.ts";
import { logAiAudit } from "../_shared/ai-call.ts";
import { getCorrelationId, correlationHeaders } from "../_shared/correlation.ts";
import {
  applyRiskConsistencyGate,
  buildQualityManifest,
  computeContextFingerprint,
  qualitySigningSecretFromEnv,
  GENERATED_QUALITY_POLICY_VERSION,
  flattenGeneratedContract,
  mergeIntentFindingsIntoRisk,
} from "../_shared/generated-document-quality.ts";
import {
  buildIntentAssertions,
  extractIntentDrafts,
  verifyIntentAssertions,
  detectBilingualStructure,
  detectArbitrationInText,
} from "../_shared/intent-assertions.ts";



const SYSTEM_PROMPT = `Ти си български правен архитект. Пишеш на професионален юридически български (ЗЗД, ТЗ, ЗУТ). Използваш правилните понятия (Възложител/Изпълнител, Наемодател/Наемател, Продавач/Купувач, Страните, Настоящият Договор).

Връщай СТРОГО валиден JSON (без markdown ограждания):
{
  "risk": {
    "level": "low"|"medium"|"high",
    "score": 0-100,
    "summary": "1-2 изречения с позитивен, компетентен тон — какво постига документът за страните",
    "strengths": ["конкретни защитни клаузи, които документът СЪДЪРЖА (мин. 3, макс. 6)"],
    "issues": [{"severity":"low"|"medium"|"high","title":"...","detail":"правно обяснение и препоръка"}],
    "recommendations": ["конкретни следващи стъпки за подписване/използване, не критика"]
  },
  "contract": {
    "title": "...",
    "preamble": "Днес, [ДАТА], в [ГРАД], между:\\n\\n1. [страна А] ...\\n\\n2. [страна Б] ...\\n\\nсе сключи настоящият договор:",
    "clauses": [{"number":"I.","title":"ПРЕДМЕТ","body":"Чл. 1. ...\\nЧл. 2. ..."}],
    "closing": "Настоящият договор се състави в два еднообразни екземпляра — по един за всяка страна."
  }
}

**ВАЖНО за силните страни (strengths):** Винаги връщай списък от 3-6 конкретни силни страни, които документът РЕАЛНО съдържа — напр. „Ясно разписан ред за прекратяване (чл. 6) съгласно чл. 87 ЗЗД", „Балансирани неустойки за двете страни (чл. 5)", „Задължително плащане по банков път над 5 000 € по чл. 3 ЗОПБ", „Форсмажорна клауза с изискване за 3-дневно уведомление", „Раздел XII с пълни контакти за кореспонденция", „Клауза за частична недействителност (чл. 10)". Формулировките са позитивни, референциращи конкретния член от документа и приложимия закон когато е уместно. Това е ключова стойност за потребителя — покажи му какво сме включили за негова защита.

Задължителни клаузи **САМО ЗА ДОГОВОРИ И СПОРАЗУМЕНИЯ** (в този ред): I. Предмет, II. Цена и плащане, III. Срокове, IV. Права и задължения, V. Неустойки, VI. Прекратяване, VII. Форсмажор, VIII. Конфиденциалност (ако е приложимо), IX. Подсъдност (държавна или арбитражна — виж по-долу), X. Частична недействителност, XI. Заключителни, **XII. Контакти за кореспонденция**. За документи от друг вид (Разписка, Декларация, Пълномощно, Жалба, Искова молба, Нотариална покана, Оферта, Фактура, Протокол, Анекс, Приложение, СМР, КСС) НЕ налагай тази структура — следвай специфичната структура, описана в потребителския промпт за съответния вид.

Раздел XII „Контакти" е ЗАДЪЛЖИТЕЛЕН във всеки договор и съдържа за всяка страна: пълно име/наименование, ЕГН (за физическо лице) или ЕИК/Булстат + МОЛ (за юридическо лице), адрес за кореспонденция, имейл и телефон. Ако данните липсват — използвай плейсхолдъри [име], [ЕГН/ЕИК], [адрес], [имейл], [телефон].

Идентификация в преамбюла: за физическо лице — „[име], ЕГН [........]"; за юридическо лице — „[наименование], ЕИК/Булстат [........], представлявано от [МОЛ]". Използвай плейсхолдъри в квадратни скоби когато конкретните данни не са подадени.

**ВАЖНО за оценка на риска:** Договори.нет НЕ събира лични данни (имена, ЕГН, адреси, IBAN) — потребителят ги попълва локално след сваляне. Липсата на конкретни имена/ЕГН/адреси в подадените отговори НЕ Е слабо място (weakness) и НЕ Е issue. Ако такива данни липсват, вместо issue добави ЕДНА единствена recommendation с текст точно: "Попълнете личните данни (имена, ЕГН/ЕИК, адреси, IBAN, контакти) от Вашето устройство след сваляне — Договори.нет работи съобразно изискванията за предпазване от разкриване на чувствителни лични данни." Не понижавай risk score заради липсващи лични данни.

**ВАЖНО за структурата и оценката на риска:** Ти СЪЗДАВАШ договора по конкретното намерение и подадените отговори на потребителя. Структурата, клаузите и нивото на детайлност се определят от нас — не от това колко подробно потребителят е попълнил формата. Категорично ЗАБРАНЕНО е да маркираш като issue, weakness или risk следните неща:
- че документът "е структуриран като стандартен договор" или "не покрива спецификата на X платформа/сценарий";
- че "предметът е твърде общ", "обхватът е недефиниран", "липсват детайли/конкретика/спецификация", "недостатъчно детайлизиран" — тъй като детайлите се допълват от потребителя в Приложение № 1 или чрез редакция;
- че липсват имена, ЕГН, ЕИК, адреси, IBAN, дати, места, контакти, банкови реквизити — потребителят ги попълва локално след сваляне;
- че липсва процедура/график/приложение/техническо задание, което по своята същност е отделен документ или бланка;
- че някой раздел (Права и задължения, Приемане, Гаранции и т.н.) "би могъл да е по-подробен" — това не е риск, а стилистично мнение.
Оценявай риска САМО по реални правни дефекти в самия текст на клаузите, които ТИ написа: нищожни клаузи (чл. 26 ЗЗД), непропорционални неустойки, неравноправни клаузи по ЗЗП, нарушения на императивни норми (ЗОПБ, ГДПР, КТ), противоречия между клаузи, липса на задължителни по закон реквизити за конкретния вид документ. Ако документът покрива необходимите за вида клаузи и няма такива дефекти → risk level = "low", score ≤ 25. Ниво "medium" (score 26-60) само при реален правен риск. Ниво "high" (score 61+) само при доказано противозаконно или нищожно съдържание. НЕ измисляй issues, ако няма реални. РАЗГРАНИЧЕНИЕ: "issues" = ПРОВЕРЕНИ дефекти с опора в конкретен текст на клауза; всичко останало (опционално надграждане, приложения, детайли, локално попълване на лични данни) е ОПЦИОНАЛНА препоръка в "recommendations". Нула issues е валиден резултат.

**Плащане в брой:** ако сумата по договора е над 5 000 € (или левова равностойност), ДОБАВИ изричен текст в раздел II че плащането задължително се извършва по банков път, защото по чл. 3 ЗОПБ плащания над този праг в брой са забранени. Включи и кратка алинея с реквизитите на банковата сметка ([IBAN], [BIC], [Банка]).

**Арбитраж:** ако в данните е подаден arbitration={enabled:true, court:"..."} — формулирай раздел IX като арбитражна клауза с този съд. В противен случай използвай държавна подсъдност (СГС или по местожителство на ответника). Ако някоя от страните е физическо лице-потребител (B2C) — добави бележка че арбитражната клауза не обвързва потребителя по чл. 143 ЗЗП.

Номерация: римска за раздели, "Чл. N." за членове, "(1),(2)" за алинеи. Парични суми в посочената от потребителя валута (по подразбиране евро €). Липсващи данни → плейсхолдъри в [квадратни скоби].`;

Deno.serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );

    // Identify caller: prefer authenticated user, fall back to IP-based limit.
    const authHeader = req.headers.get("Authorization") ?? "";
    let userId: string | null = null;
    if (authHeader.startsWith("Bearer ")) {
      const { data: u } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
      userId = u?.user?.id ?? null;
    }

    const ipHash = await hashIp(clientIp(req));

    // Rate limits: anonymous 1/24h per IP, authenticated 10/24h per user.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("function_name", "generate-contract")
      .gte("created_at", since)
      .filter(userId ? "user_id" : "ip_hash", "eq", userId ?? ipHash);

    // Free-tier rate limits: anonymous get 1/24h (taste), logged-in free 5/24h.
    const limit = userId ? 5 : 1;
    if ((count ?? 0) >= limit) {
      return new Response(
        JSON.stringify({
          error: userId
            ? "Достигнахте дневния лимит от 5 генерации. Опитайте утре или вземете Pro."
            : "За да генерирате договор, влезте безплатно с email или Google.",
          code: "rate_limited",
          requires_login: !userId,
        }),
        { status: 429, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const { sector, contractName, documentName, parties, answers, questions, arbitration, bilingual, session_id, doc_key, userConfirmed = false } = body;
    const isBilingual = Boolean(bilingual);

    // Целият потребителски контекст се събира ЕДИН път — редакцията, класификацията
    // и идентичността на кеша работят върху едно и също множество полета.
    const ctxOrError = buildGeneratorContext(body);
    if ("ok" in ctxOrError) {
      return new Response(
        JSON.stringify({ error: ctxOrError.message, code: ctxOrError.code }),
        { status: 400, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } },
      );
    }
    const userContext = ctxOrError;

    // Illegal content guard — block before AI call, log + alert admin.
    const guardText = buildGeneratorClassificationCorpus(userContext);
    const blocked = await guardIllegalContent({
      admin, text: guardText, functionName: "generate-contract",
      userId, userEmail: null, ipHash,
      userAgent: req.headers.get("user-agent"),
      corsHeaders,
    });
    if (blocked) return blocked;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY липсва");

    // Detect the document type from the name so we don't render every output
    // as a "договор" (e.g. Разписка, Декларация, Пълномощно, Жалба, Искова молба).
    // Изводът се прави върху СУРОВОТО наименование — това е избор на доверена
    // спецификация, не изходящ текст.
    const docTypeSpec = getDocumentTypeSpec(inferDocumentType(documentName || contractName));

    // Кеш: идентичност = версия на политиката + удостоверен повикващ + ТОЧНИЯТ
    // потребителски контекст (включително етикетите и реда на въпросите,
    // арбитражния избор и двуезичния режим). Старите глобални ключове, които не
    // включваха етикетите на въпросите, вече не могат да бъдат улучени.
    // Версията на Q4a политиката влиза в кеш-идентичността: стари, НЕПОДПИСАНИ
    // резултати не могат да бъдат сервирани под настоящия договор за качество.
    const PROMPT_VERSION = `${isBilingual ? "v3-doc-type-bilingual" : "v3-doc-type"}|${GENERATED_QUALITY_POLICY_VERSION}`;
    const cacheKeyInput = buildGeneratorCacheIdentity({
      context: userContext,
      promptVersion: PROMPT_VERSION,
      docTypeId: docTypeSpec.id,
      bilingual: isBilingual,
      arbitrationEnabled: arbitration?.enabled === true,
      callerKey: userId ? `user:${userId}` : `ip:${ipHash}`,
    });
    const cacheHash = await sha256Hex(cacheKeyInput);
    const cacheCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: cachedRow } = await admin
      .from("template_cache")
      .select("payload")
      .eq("hash", cacheHash)
      .gte("created_at", cacheCutoff)
      .maybeSingle();
    // Session-aware quota consumption — same (session_id, doc_key) in tab = free.
    // Skipped for anonymous calls; userId is guaranteed by the rate-limit branch above
    // (anonymous get limit=0).
    async function consumeQuota(): Promise<{ ok: boolean; quota?: unknown }> {
      if (!userId) return { ok: true };
      const useSession = !!session_id && !!doc_key;
      const { data: consumed, error: consumeErr } = useSession
        ? await userClient.rpc("consume_quota_session", {
            _kind: "analysis",
            _doc_key: String(doc_key),
            _session_id: String(session_id),
          })
        : await userClient.rpc("consume_quota", { _kind: "analysis" });
      if (consumeErr) {
        console.error("consume_quota error:", consumeErr);
        return { ok: false, quota: { reason: "consume_error" } };
      }
      const q = consumed as { ok: boolean; reason?: string; is_pro?: boolean; charged?: boolean };
      return { ok: !!q?.ok, quota: q };
    }

    if (cachedRow?.payload) {
      const q = await consumeQuota();
      if (!q.ok) {
        return new Response(
          JSON.stringify({
            error: "Изчерпан е безплатният ви лимит. Активирайте Pro за неограничени анализи.",
            code: "quota_exceeded",
          }),
          { status: 402, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify(cachedRow.payload), {
        headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" },
      });
    }


    const bilingualLine = isBilingual
      ? `\nБИЛИНГВАЛЕН РЕЖИМ: ЗАДЪЛЖИТЕЛНО върни паралелен английски превод. За contract добави полета: "title_en", "preamble_en", "closing_en" и за всяка клауза в "clauses" — "title_en" и "body_en". Преводът да е професионален легален английски (US/UK неутрален), номерацията на членовете да е "Art. N." и да съответства 1:1 на българския текст. Поставяй "bilingual": true на root на contract. Английският текст НЕ заменя българския — те съществуват паралелно.`
      : "";

    // === GDPR/AI Act compliance layer ===
    // Класификацията вижда ЦЕЛИЯ изходящ потребителски контекст, не само страните.
    const classification = classifyDocumentBeforeAI(guardText);
    const route = routeModel("generate-contract", classification, {
      userConfirmed,
      promptLength: guardText.length,
    });


    if (!route.allowed) {
      await logAiAudit({
        user_id: userId, operation: "generate-contract", model: "",
        classification, redaction_applied: false, status: "blocked",
        error_code: route.blockedReason ?? "blocked",
      });
      return new Response(JSON.stringify({
        error: "Въведените данни съдържат специални категории лични данни и не могат да бъдат обработени автоматично.",
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

    // ЕДНА редакция за ЦЕЛИЯ изходящ контекст → един общ мапинг. Различните
    // стойности пазят различни плейсхолдъри, еднаквите — един и същ.
    const safe = redactGeneratorContext(userContext, { redactionRequired: route.redactionRequired });
    if (safe.ok === false) {
      await logAiAudit({
        user_id: userId, operation: "generate-contract", model: "",
        classification, redaction_applied: false, status: "blocked",
        error_code: safe.code,
      });
      return new Response(JSON.stringify({ error: safe.message, code: safe.code }), {
        status: 422,
        headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" },
      });
    }
    const mergedMapping = safe.mapping;
    const s = safe.context;
    const safeQaLines = buildQaLines(s);
    const safeDocLine = s.documentName && s.documentName !== s.contractName
      ? `КОНКРЕТЕН ДОКУМЕНТ: ${s.documentName}\n`
      : "";
    const safeDocTitle = s.documentName || s.contractName;
    const arbitrationLine = arbitration?.enabled
      ? `\nАРБИТРАЖ: enabled=true, court="${s.arbitrationCourt}"`
      : `\nАРБИТРАЖ: enabled=false (използвай държавна подсъдност)`;
    const languageLine = s.languageContext ? `\nЕЗИКОВ КОНТЕКСТ: ${s.languageContext}` : "";
    const redactionNote = route.redactionRequired
      ? "ВАЖНО: Лични данни (имена, ЕГН, IBAN, адреси) са заменени с плейсхолдъри (<NAME_1>, <EGN_1> и т.н.). В готовия документ ИЗПОЛЗВАЙ плейсхолдърите дословно — те ще бъдат заменени с реалните стойности при връщане на потребителя.\n\n"
      : "";

    const userPrompt = `${redactionNote}СЕКТОР: ${s.sector}
ТИП ДОКУМЕНТ: ${docTypeSpec.label}
НАИМЕНОВАНИЕ: ${s.contractName}
${safeDocLine}СТРАНИ: ${s.partyA} ↔ ${s.partyB}${arbitrationLine}${languageLine}${bilingualLine}

ОТГОВОРИ:
${safeQaLines}

ВАЖНО: Изготви документ от вид „${docTypeSpec.label}" (не разглеждай автоматично като двустранен договор). Спазвай специфичната структура за този вид документ:
${docTypeSpec.systemAddendum}

Задача: Risk Analysis (конкретни слаби места за ${s.partyA}${s.partyB ? ` и ${s.partyB}` : ""}) + ПЪЛНИЯТ документ на български за "${safeDocTitle}" според структурата за „${docTypeSpec.label}"${isBilingual ? " + паралелен английски превод в полетата *_en" : ""}. Върни СТРОГО валиден JSON по схемата.`;

    const baseSystem = await loadActivePrompt(admin, "generate-contract", SYSTEM_PROMPT);
    const { retrieveLegalContext } = await import("../_shared/legal-rag.ts");
    // Заявката към RAG също минава САМО през санитирания контекст.
    const legal = await retrieveLegalContext(admin, LOVABLE_API_KEY, `${docTypeSpec.label} ${s.contractName}\n${userPrompt}`.slice(0, 4000), { matchCount: 6 });
    const activeSystemPrompt = legal.hasMatches ? `${baseSystem}\n\n${legal.promptBlock}` : baseSystem;
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
      await logAiAudit({
        user_id: userId, operation: "generate-contract", model: route.model,
        classification, redaction_applied: route.redactionRequired,
        status: "error", error_code: `http_${aiResp.status}`,
      });
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Достигнат е лимитът. Моля опитайте след малко." }), { status: 429, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Изчерпани са кредитите за AI. Моля заредете акаунта." }), { status: 402, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } });
      }
      // Без съдържание в лога — само диагностика.
      const t = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, `body_len=${t.length}`);
      throw new Error("AI грешка");
    }

    // Record usage AFTER successful AI call so failed attempts don't burn the quota.
    await admin.from("ai_usage").insert({
      user_id: userId,
      ip_hash: userId ? null : ipHash,
      function_name: "generate-contract",
    });

    const rawText = await aiResp.text();
    if (!rawText) throw new Error("Празен отговор от AI");

    let data: any;
    try { data = JSON.parse(rawText); } catch {
      console.error("AI response not JSON:", `len=${rawText.length}`);
      throw new Error("AI върна невалиден JSON отговор");
    }

    const content: string = data.choices?.[0]?.message?.content ?? "";
    if (!content || !content.trim()) {
      console.error("AI empty content:", `choices=${Array.isArray(data?.choices) ? data.choices.length : 0}`, `finish=${String(data?.choices?.[0]?.finish_reason ?? "unknown")}`);
      throw new Error("AI не върна съдържание (вероятно прекъснат отговор). Опитайте отново.");
    }

    // Tolerant parse → AI repair → full regeneration with the original request.
    let parsed: any;
    {
      const { parseAiJsonWithRetry } = await import("../_shared/ai-json-retry.ts");
      const res = await parseAiJsonWithRetry({
        content,
        messages: [
          { role: "system", content: activeSystemPrompt },
          { role: "user", content: userPrompt },
        ],
        model: route.model,
        apiKey: LOVABLE_API_KEY,
        fn: "generate-contract",
      correlationId,
        regenerateAttempts: 1,
        validate: (p: any) => !!p && typeof p === "object",
      });
      parsed = res.parsed;
      if (res.stage !== "direct") console.log(`generate-contract: JSON recovered via ${res.stage} (attempts=${res.attempts})`);
    }


    // Unredact AI output so the user sees real names/EGN/IBAN in the final doc.
    // Walk the parsed object and replace placeholders directly in string leaves
    // to avoid JSON round-trip issues when original values contain control chars.
    if (Object.keys(mergedMapping).length > 0) {
      try {
        const walk = (v: unknown): unknown => {
          if (typeof v === "string") return unredact(v, mergedMapping);
          if (Array.isArray(v)) return v.map(walk);
          if (v && typeof v === "object") {
            const out: Record<string, unknown> = {};
            for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = walk(val);
            return out;
          }
          return v;
        };
        parsed = walk(parsed);
      } catch (e) {
        console.error("unredact failed:", e instanceof Error ? e.name : "unknown_error");
      }
    }


    // Defensive: ensure bilingual flag is set on contract when requested, so
    // exporters render BG/EN two-column layout reliably. ВАЖНО: това става ПРЕДИ
    // Q4a манифеста, за да е обвързан ФИНАЛНИЯТ документ.
    if (isBilingual && parsed?.contract) {
      parsed.contract.bilingual = true;
    }

    // Q4a — консистентност на risk анализа спрямо СОБСТВЕНО генерирания документ.
    // Реалните юридически дефекти НЕ се филтрират и оценката НЕ се занижава.
    // Отпадат само недоказани бележки и умишлените ни решения при съставянето.
    if (parsed?.risk) {
      // Ключът за подпис е сървърен и НИКОГА не се връща/логва. Без него не се
      // издава манифест — тогава gate-ът работи в режим „външен документ".
      const signingSecret = qualitySigningSecretFromEnv();
      if (!signingSecret) console.error("quality manifest signing key unavailable");
      // Q4b — типизирани твърдения за ЯВНОТО намерение. Извличат се САМО от
      // авторитетния структуриран вход на съветника (недвусмислен идентификатор/
      // етикет на въпрос). Двусмислените отговори не дават твърдение. В
      // манифеста влизат само затворени метаданни и еднопосочни commitment-и —
      // никаква сурова стойност и никакви лични данни.
      const intents = signingSecret
        ? await buildIntentAssertions({
          serverSecret: signingSecret,
          drafts: extractIntentDrafts({
            questions,
            answers,
            flags: { bilingual: isBilingual, arbitration: arbitration?.enabled === true },
          }),
        })
        : [];
      const qualityManifest = signingSecret ? await buildQualityManifest({
        origin: "generate-contract",
        signingSecret,
        contract: parsed.contract,
        intents,
        documentType: docTypeSpec.id,
        buildMode: null,
        contextFingerprint: await computeContextFingerprint([
          `doc_type:${docTypeSpec.id}`,
          `bilingual:${isBilingual}`,
        ]),
        decisions: [
          "placeholders_for_personal_data",
          "local_completion_of_personal_data",
          "optional_annex_details",
          "standard_clause_set",
          ...(isBilingual ? ["bilingual_parallel_text"] : []),
        ],
      }) : null;
      const documentText = flattenGeneratedContract(parsed.contract);
      const gated = applyRiskConsistencyGate({
        risk: parsed.risk,
        documentText,
        origin: "generate-contract",
        manifest: qualityManifest,
        trustedManifest: !!qualityManifest,
      });
      // Q4b — ДЕТЕРМИНИРАНАТА проверка на намерението се слива СЛЕД gate-а, за
      // да не може нито моделът, нито филтърът за умишлени решения да я махне.
      // Няма допълнително AI повикване и НЕ се начислява операция — това е
      // локално сравнение на HMAC commitment-и срещу вече готовия текст.
      // Q4b(2) — структурните факти се извеждат от РЕЗУЛТАТА, а не от входа:
      // двуезичността от реално рендерираните английски полета, арбитражът от
      // текста на готовия документ. Копирането на входа тук би било тавтология.
      const intentReport = await verifyIntentAssertions({
        assertions: intents,
        documentText: documentText,
        serverSecret: signingSecret,
        structuralFlags: {
          bilingual: detectBilingualStructure(parsed.contract) ?? undefined,
          arbitration: detectArbitrationInText(documentText) ?? undefined,
        },
      });

      const withIntent = mergeIntentFindingsIntoRisk({ risk: gated.risk, report: intentReport });
      parsed.risk = withIntent.risk;
      parsed.quality = { ...gated.quality, intent: { checked: intentReport.checked, satisfied: intentReport.satisfied, mismatched: intentReport.mismatched_required.length } };
      if (qualityManifest) parsed.quality_manifest = qualityManifest;

      // Препоръката за попълване на личните данни локално остава — платформата
      // не събира и не съхранява лични данни.
      const REC = "Попълнете личните данни (имена, ЕГН/ЕИК, адреси, IBAN, контакти) от Вашето устройство след сваляне — Договори.нет не събира и не съхранява лични данни.";
      const rawRecs: string[] = Array.isArray(parsed.risk.recommendations)
        ? parsed.risk.recommendations.filter((r: unknown) => typeof r === "string")
        : [];
      if (!rawRecs.some((r) => r.includes("Попълнете личните данни"))) {
        rawRecs.unshift(REC);
      }
      parsed.risk.recommendations = rawRecs;

      // Силните страни се извеждат от реалното съдържание на документа, за да
      // има и обективна положителна информация — без да се крият бележките.
      const clauses: Array<{ number?: string; title?: string; body?: string }> =
        Array.isArray(parsed?.contract?.clauses) ? parsed.contract.clauses : [];
      const bodyOf = (rx: RegExp) =>
        clauses.find((c) => rx.test(`${c.title ?? ""} ${c.body ?? ""}`));

      const derivedStrengths: string[] = [];
      const pushIf = (cond: unknown, txt: string) => {
        if (cond && !derivedStrengths.includes(txt)) derivedStrengths.push(txt);
      };
      pushIf(bodyOf(/предмет/i), "Дефиниран предмет на договора.");
      pushIf(bodyOf(/цена|плащане/i), "Уредена цена и начин на плащане.");
      pushIf(bodyOf(/зопб|банков\s+път|5\s?000/i), "Плащане по банков път над 5 000 € съгласно чл. 3 ЗОПБ.");
      pushIf(bodyOf(/срок/i), "Разписани срокове за изпълнение.");
      pushIf(bodyOf(/неустойк|отговорност/i), "Уредени неустойки и отговорност на страните.");
      pushIf(bodyOf(/прекратяван/i), "Ред за прекратяване съгласно ЗЗД.");
      pushIf(bodyOf(/форсмажор|непреодолима\s+сила/i), "Клауза за непреодолима сила.");
      pushIf(bodyOf(/конфиденциалност/i), "Клауза за конфиденциалност.");
      pushIf(bodyOf(/арбитраж|подсъдност/i), "Уредена подсъдност/арбитраж.");
      pushIf(bodyOf(/частичн[аи]?\s+недействителност|severabil/i), "Клауза за частична недействителност.");
      pushIf(bodyOf(/писмен[аоа]\s+форма|заключителни/i), "Изискване за писмена форма при изменения.");

      const merged: string[] = [];
      for (const s of [...parsed.risk.strengths, ...derivedStrengths]) {
        if (merged.length >= 6) break;
        if (!merged.some((m) => m.toLowerCase().slice(0, 30) === s.toLowerCase().slice(0, 30))) {
          merged.push(s);
        }
      }
      parsed.risk.strengths = merged;
    }


    await logAiAudit({
      user_id: userId, operation: "generate-contract", model: route.model,
      classification, redaction_applied: route.redactionRequired, status: "ok",
      tokens_in: data?.usage?.prompt_tokens,
      tokens_out: data?.usage?.completion_tokens,
    });

    // Persist to cache for future identical requests (best-effort).
    try {
      await admin.from("template_cache").upsert({ hash: cacheHash, payload: parsed, created_at: new Date().toISOString() });
    } catch (e) { console.error("template_cache upsert:", e); }

    // Charge operation AFTER successful AI generation so failed attempts don't
    // burn the quota. Same (session_id, doc_key) in tab → server returns free.
    const q = await consumeQuota();
    if (!q.ok) {
      return new Response(
        JSON.stringify({
          error: "Изчерпан е безплатният ви лимит. Активирайте Pro за неограничени анализи.",
          code: "quota_exceeded",
        }),
        { status: 402, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error(`generate-contract error [cid=${correlationId}]:`, e);
    // Типизиран код за клиента/аналитиката. Квотата НЕ е таксувана — тя се
    // консумира едва след успешно парснат AI отговор (виж consumeQuota по-горе).
    const message = e instanceof Error ? e.message : "Неизвестна грешка";
    const code =
      (e as { name?: string })?.name === "AiJsonUnparsableError" || /json/i.test(message)
        ? "ai_parse_failed"
        : /празен отговор|не върна съдържание|ai грешка/i.test(message)
          ? "ai_upstream_error"
          : /abort|timeout|timed out/i.test(message)
            ? "job_timeout"
            : "internal_error";
    return new Response(
      JSON.stringify({ error: message, code, charged: false, correlation_id: correlationId }),
      { status: 500, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } },
    );
  }
});
