// Edge function: AI generation of risk analysis & contract
// Uses Lovable AI Gateway (Gemini) — no API key needed by user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors, hashIp, clientIp } from "../_shared/cors.ts";
import { sha256Hex, stableStringify } from "../_shared/normalize.ts";
import { extractJson } from "../_shared/json.ts";
import { loadActivePrompt } from "../_shared/prompt-loader.ts";
import { guardIllegalContent } from "../_shared/illegal-content.ts";
import { getDocumentTypeSpec, inferDocumentType } from "../_shared/document-types.ts";
import { classifyDocumentBeforeAI } from "../_shared/classify.ts";
import { redactForAI, unredact } from "../_shared/redact.ts";
import { routeModel } from "../_shared/model-router.ts";
import { logAiAudit } from "../_shared/ai-call.ts";


const SYSTEM_PROMPT = `Ти си български правен архитект. Пишеш на професионален юридически български (ЗЗД, ТЗ, ЗУТ). Използваш правилните понятия (Възложител/Изпълнител, Наемодател/Наемател, Продавач/Купувач, Страните, Настоящият Договор).

Връщай СТРОГО валиден JSON (без markdown ограждания):
{
  "risk": {
    "level": "low"|"medium"|"high",
    "score": 0-100,
    "summary": "1-2 изречения",
    "issues": [{"severity":"low"|"medium"|"high","title":"...","detail":"правно обяснение и препоръка"}],
    "recommendations": ["..."]
  },
  "contract": {
    "title": "...",
    "preamble": "Днес, [ДАТА], в [ГРАД], между:\\n\\n1. [страна А] ...\\n\\n2. [страна Б] ...\\n\\nсе сключи настоящият договор:",
    "clauses": [{"number":"I.","title":"ПРЕДМЕТ","body":"Чл. 1. ...\\nЧл. 2. ..."}],
    "closing": "Настоящият договор се състави в два еднообразни екземпляра — по един за всяка страна."
  }
}

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
Оценявай риска САМО по реални правни дефекти в самия текст на клаузите, които ТИ написа: нищожни клаузи (чл. 26 ЗЗД), непропорционални неустойки, неравноправни клаузи по ЗЗП, нарушения на императивни норми (ЗОПБ, ГДПР, КТ), противоречия между клаузи, липса на задължителни по закон реквизити за конкретния вид документ. Ако документът покрива необходимите за вида клаузи и няма такива дефекти → risk level = "low", score ≤ 25. Ниво "medium" (score 26-60) само при реален правен риск. Ниво "high" (score 61+) само при доказано противозаконно или нищожно съдържание. НЕ измисляй issues, ако няма реални.

**Плащане в брой:** ако сумата по договора е над 5 000 € (или левова равностойност), ДОБАВИ изричен текст в раздел II че плащането задължително се извършва по банков път, защото по чл. 3 ЗОПБ плащания над този праг в брой са забранени. Включи и кратка алинея с реквизитите на банковата сметка ([IBAN], [BIC], [Банка]).

**Арбитраж:** ако в данните е подаден arbitration={enabled:true, court:"..."} — формулирай раздел IX като арбитражна клауза с този съд. В противен случай използвай държавна подсъдност (СГС или по местожителство на ответника). Ако някоя от страните е физическо лице-потребител (B2C) — добави бележка че арбитражната клауза не обвързва потребителя по чл. 143 ЗЗП.

Номерация: римска за раздели, "Чл. N." за членове, "(1),(2)" за алинеи. Парични суми в посочената от потребителя валута (по подразбиране евро €). Липсващи данни → плейсхолдъри в [квадратни скоби].`;

Deno.serve(async (req: Request) => {
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
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { sector, contractName, documentName, parties, answers, questions, arbitration, bilingual, session_id, doc_key, userConfirmed = false } = await req.json();
    const isBilingual = Boolean(bilingual);


    // Illegal content guard — block before AI call, log + alert admin.
    const guardText = [
      sector, contractName, documentName,
      parties?.a, parties?.b,
      ...Object.values(answers ?? {}).map((v) => String(v ?? "")),
    ].join("\n");
    const blocked = await guardIllegalContent({
      admin, text: guardText, functionName: "generate-contract",
      userId, userEmail: null, ipHash,
      userAgent: req.headers.get("user-agent"),
      corsHeaders,
    });
    if (blocked) return blocked;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY липсва");

    // Skip empty answers in the prompt to save input tokens.
    const qaLines = (questions as Array<{ id: string; label: string }>)
      .filter((q) => {
        const v = answers[q.id];
        return v !== undefined && v !== null && String(v).trim() !== "";
      })
      .map((q) => `- ${q.label}: ${answers[q.id]}`)
      .join("\n");

    const docLine = documentName && documentName !== contractName
      ? `КОНКРЕТЕН ДОКУМЕНТ: ${documentName}\n`
      : "";

    // Detect the document type from the name so we don't render every output
    // as a "договор" (e.g. Разписка, Декларация, Пълномощно, Жалба, Искова молба).
    const docTypeSpec = getDocumentTypeSpec(inferDocumentType(documentName || contractName));

    // Cache: identical (sector, contractName, documentName, sorted answers) → reuse output for 30 days.
    // PROMPT_VERSION included so prompt/system changes invalidate stale cache entries.
    const PROMPT_VERSION = isBilingual ? "v3-doc-type-bilingual" : "v3-doc-type";
    const cacheKeyInput = stableStringify({
      v: PROMPT_VERSION,
      sector, contractName, documentName: documentName || null,
      docType: docTypeSpec.id,
      parties: { a: parties?.a ?? "", b: parties?.b ?? "" },
      answers: answers ?? {},
      arbitration: arbitration ?? null,
      bilingual: isBilingual,
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
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify(cachedRow.payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    const arbitrationLine = arbitration?.enabled
      ? `\nАРБИТРАЖ: enabled=true, court="${arbitration.courtName || arbitration.courtId || ""}"${arbitration.courtLink ? `, link=${arbitration.courtLink}` : ""}`
      : `\nАРБИТРАЖ: enabled=false (използвай държавна подсъдност)`;

    const bilingualLine = isBilingual
      ? `\nБИЛИНГВАЛЕН РЕЖИМ: ЗАДЪЛЖИТЕЛНО върни паралелен английски превод. За contract добави полета: "title_en", "preamble_en", "closing_en" и за всяка клауза в "clauses" — "title_en" и "body_en". Преводът да е професионален легален английски (US/UK неутрален), номерацията на членовете да е "Art. N." и да съответства 1:1 на българския текст. Поставяй "bilingual": true на root на contract. Английският текст НЕ заменя българския — те съществуват паралелно.`
      : "";

    // === GDPR/AI Act compliance layer ===
    const sourceText = [
      String(parties?.a ?? ""), String(parties?.b ?? ""),
      qaLines,
    ].join("\n");
    const classification = classifyDocumentBeforeAI(sourceText);
    const route = routeModel("generate-contract", classification, {
      userConfirmed,
      promptLength: sourceText.length,
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
      }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const redactedParties = route.redactionRequired
      ? { a: redactForAI(String(parties?.a ?? "")), b: redactForAI(String(parties?.b ?? "")) }
      : null;
    const redactedQaLines = route.redactionRequired ? redactForAI(qaLines) : null;
    const mergedMapping: Record<string, string> = {};
    if (redactedParties) Object.assign(mergedMapping, redactedParties.a.mapping, redactedParties.b.mapping);
    if (redactedQaLines) Object.assign(mergedMapping, redactedQaLines.mapping);

    const safePartyA = redactedParties ? redactedParties.a.redacted : String(parties?.a ?? "");
    const safePartyB = redactedParties ? redactedParties.b.redacted : String(parties?.b ?? "");
    const safeQaLines = redactedQaLines ? redactedQaLines.redacted : qaLines;
    const redactionNote = route.redactionRequired
      ? "ВАЖНО: Лични данни (имена, ЕГН, IBAN, адреси) са заменени с плейсхолдъри (<NAME_1>, <EGN_1> и т.н.). В готовия документ ИЗПОЛЗВАЙ плейсхолдърите дословно — те ще бъдат заменени с реалните стойности при връщане на потребителя.\n\n"
      : "";

    const userPrompt = `${redactionNote}СЕКТОР: ${sector}
ТИП ДОКУМЕНТ: ${docTypeSpec.label}
НАИМЕНОВАНИЕ: ${contractName}
${docLine}СТРАНИ: ${safePartyA} ↔ ${safePartyB}${arbitrationLine}${bilingualLine}

ОТГОВОРИ:
${safeQaLines}

ВАЖНО: Изготви документ от вид „${docTypeSpec.label}" (не разглеждай автоматично като двустранен договор). Спазвай специфичната структура за този вид документ:
${docTypeSpec.systemAddendum}

Задача: Risk Analysis (конкретни слаби места за ${safePartyA}${safePartyB ? ` и ${safePartyB}` : ""}) + ПЪЛНИЯТ документ на български за "${documentName || contractName}" според структурата за „${docTypeSpec.label}"${isBilingual ? " + паралелен английски превод в полетата *_en" : ""}. Върни СТРОГО валиден JSON по схемата.`;

    const baseSystem = await loadActivePrompt(admin, "generate-contract", SYSTEM_PROMPT);
    const { retrieveLegalContext } = await import("../_shared/legal-rag.ts");
    const legal = await retrieveLegalContext(admin, LOVABLE_API_KEY, `${docTypeSpec.label} ${contractName}\n${userPrompt}`.slice(0, 4000), { matchCount: 6 });
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
        return new Response(JSON.stringify({ error: "Достигнат е лимитът. Моля опитайте след малко." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Изчерпани са кредитите за AI. Моля заредете акаунта." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const t = await aiResp.text();
      console.error("AI gateway:", aiResp.status, t);
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
      console.error("AI raw (not JSON):", rawText.slice(0, 500));
      throw new Error("AI върна невалиден JSON отговор");
    }

    const content: string = data.choices?.[0]?.message?.content ?? "";
    if (!content || !content.trim()) {
      console.error("AI empty content. Full data:", JSON.stringify(data).slice(0, 500));
      throw new Error("AI не върна съдържание (вероятно прекъснат отговор). Опитайте отново.");
    }

    let parsed;
    try { parsed = extractJson(content); }
    catch (err) {
      console.error("JSON parse failed. Content head:", content.slice(0, 800));
      throw new Error("AI отговорът не може да бъде анализиран като JSON");
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
        console.error("unredact failed:", e);
      }
    }


    // Post-process risk analysis: strip issues that penalize us for the
    // document's own intended structure or for missing personal data (which
    // the user fills locally after download — Договори.нет never collects it).
    // This is a deterministic guardrail; the model prompt already instructs
    // the same but occasionally ignores it.
    if (parsed?.risk) {
      const FORBIDDEN_PATTERNS = [
        /структуриран\s+като\s+стандартен/i,
        /стандартен\s+договор/i,
        /не\s+покрива\s+спецификата/i,
        /специфик[аи]т[аеи].*(платформ|airbnb|booking|uber|glovo|upwork|fiverr)/i,
        /(платформ|airbnb|booking|uber|glovo|upwork|fiverr).*(специфик|особен)/i,
        /липсват?\s+(ключови\s+)?данни\s+за\s+(страни|имен|адрес|егн|еик|iban|контакт)/i,
        /(липсва|липсват|непопълнен[иа]?)\s+(имен[аеи]|егн|еик|адрес|iban|контакт|описани[ея]|дата)/i,
        /(имена|егн|еик|адрес|iban|контакти|описание)\s+на\s+(страни|имота|обекта|услугата)?\s*(липсва|липсват|не\s+са\s+посочени|не\s+са\s+попълнени)/i,
        /плейсхолдър/i,
        /квадратни\s+скоби/i,
      ];
      const isForbidden = (txt: string) =>
        FORBIDDEN_PATTERNS.some((rx) => rx.test(txt));

      const originalIssues: Array<{ severity?: string; title?: string; detail?: string }> =
        Array.isArray(parsed.risk.issues) ? parsed.risk.issues : [];
      const kept = originalIssues.filter(
        (i) => !isForbidden(`${i?.title ?? ""} ${i?.detail ?? ""}`),
      );
      parsed.risk.issues = kept;

      // Same filter on summary — replace with neutral text if it mentioned
      // forbidden reasons.
      if (typeof parsed.risk.summary === "string" && isForbidden(parsed.risk.summary)) {
        parsed.risk.summary =
          "Документът покрива необходимите за вида клаузи. Попълнете личните данни от Вашето устройство след сваляне.";
      }

      // Recompute severity based only on remaining real issues.
      const sevWeight = (s?: string) =>
        s === "high" ? 30 : s === "medium" ? 15 : s === "low" ? 5 : 0;
      const computed = kept.reduce((sum, i) => sum + sevWeight(i.severity), 0);

      // If model reported high risk but issues we kept are minor, downgrade.
      const hasHigh = kept.some((i) => i.severity === "high");
      const hasMedium = kept.some((i) => i.severity === "medium");
      const newLevel: "low" | "medium" | "high" =
        hasHigh ? "high" : hasMedium ? "medium" : "low";

      // Cap score: no real issues → ≤25; only low → ≤40; medium → ≤60; high → keep.
      let capped = typeof parsed.risk.score === "number" ? parsed.risk.score : computed;
      if (!hasHigh && !hasMedium) capped = Math.min(capped, 25);
      else if (!hasHigh) capped = Math.min(capped, 60);
      parsed.risk.score = Math.max(0, Math.min(100, Math.round(capped)));
      parsed.risk.level = newLevel;

      // Ensure the "fill in personal data locally" recommendation is present
      // exactly once, without being an issue.
      const REC = "Попълнете личните данни (имена, ЕГН/ЕИК, адреси, IBAN, контакти) от Вашето устройство след сваляне — Договори.нет работи съобразно изискванията за предпазване от разкриване на чувствителни лични данни.";
      const recs: string[] = Array.isArray(parsed.risk.recommendations)
        ? parsed.risk.recommendations.filter((r: unknown) => typeof r === "string")
        : [];
      if (!recs.some((r) => r.includes("Попълнете личните данни"))) {
        recs.unshift(REC);
      }
      parsed.risk.recommendations = recs;
    }

    // Defensive: ensure bilingual flag is set on contract when requested,
    // so exporters render BG/EN two-column layout reliably.
    if (isBilingual && parsed?.contract) {
      parsed.contract.bilingual = true;
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
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("generate-contract error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Неизвестна грешка" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
