// Edge function: AI generation of risk analysis & contract
// Uses Lovable AI Gateway (Gemini) — no API key needed by user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors, hashIp, clientIp } from "../_shared/cors.ts";
import { sha256Hex, stableStringify } from "../_shared/normalize.ts";
import { extractJson } from "../_shared/json.ts";
import { loadActivePrompt } from "../_shared/prompt-loader.ts";
import { guardIllegalContent } from "../_shared/illegal-content.ts";
import { getDocumentTypeSpec, inferDocumentType } from "../_shared/document-types.ts";


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

Раздел XII „Контакти" е ЗАДЪЛЖИТЕЛЕН във всеки договор и съдържа за всяка страна: пълно име/наименование, ЕГН (за физическо лице) или ЕИК/Булстат + МОЛ (за юридическо лице), адрес за кореспонденция, имейл и телефон. Ако данните липсват — използвай плейсхолдъри [имейл], [адрес], [телефон].

Идентификация в преамбюла: за физическо лице — „ЕГН [........]"; за юридическо лице — „ЕИК/Булстат [........], представлявано от [МОЛ]". Никога не изписвай само „— Физическо лице" или „— Юридическо лице" без идентификатор.

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

    // Tighter free-tier rate limits: anonymous must sign in; free users get 5/24h.
    const limit = userId ? 5 : 0;
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

    const { sector, contractName, documentName, parties, answers, questions, arbitration, bilingual, session_id, doc_key } = await req.json();
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
    if (cachedRow?.payload) {
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

    const userPrompt = `СЕКТОР: ${sector}
ТИП ДОКУМЕНТ: ${docTypeSpec.label}
НАИМЕНОВАНИЕ: ${contractName}
${docLine}СТРАНИ: ${parties.a} ↔ ${parties.b}${arbitrationLine}${bilingualLine}

ОТГОВОРИ:
${qaLines}

ВАЖНО: Изготви документ от вид „${docTypeSpec.label}" (не разглеждай автоматично като двустранен договор). Спазвай специфичната структура за този вид документ:
${docTypeSpec.systemAddendum}

Задача: Risk Analysis (конкретни слаби места за ${parties.a}${parties.b ? ` и ${parties.b}` : ""}) + ПЪЛНИЯТ документ на български за "${documentName || contractName}" според структурата за „${docTypeSpec.label}"${isBilingual ? " + паралелен английски превод в полетата *_en" : ""}. Върни СТРОГО валиден JSON по схемата.`;

    const activeSystemPrompt = await loadActivePrompt(admin, "generate-contract", SYSTEM_PROMPT);
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: activeSystemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });


    if (!aiResp.ok) {
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

    // Defensive: ensure bilingual flag is set on contract when requested,
    // so exporters render BG/EN two-column layout reliably.
    if (isBilingual && parsed?.contract) {
      parsed.contract.bilingual = true;
    }

    // Persist to cache for future identical requests (best-effort).
    try {
      await admin.from("template_cache").upsert({ hash: cacheHash, payload: parsed, created_at: new Date().toISOString() });
    } catch (e) { console.error("template_cache upsert:", e); }

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
