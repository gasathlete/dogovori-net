// AI generation of a custom (free-form) document from minimal user inputs.
// Supports multiple document types (contract, appendix, annex, receipt,
// power_of_attorney, declaration, complaint, claim, notary_invitation,
// offer, invoice, protocol, agreement, smr, kss).
// Uses Lovable AI Gateway (Gemini).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { buildCors, hashIp, clientIp } from "../_shared/cors.ts";
import { sha256Hex, stableStringify } from "../_shared/normalize.ts";
import { extractJson } from "../_shared/json.ts";
import { loadActivePrompt } from "../_shared/prompt-loader.ts";
import { guardIllegalContent } from "../_shared/illegal-content.ts";
import { getDocumentTypeSpec, ALL_DOCUMENT_TYPE_IDS } from "../_shared/document-types.ts";
import { classifyDocumentBeforeAI } from "../_shared/classify.ts";
import { redactForAI, unredact } from "../_shared/redact.ts";
import { routeModel } from "../_shared/model-router.ts";
import { logAiAudit } from "../_shared/ai-call.ts";

const BASE_SYSTEM_PROMPT = `Ти си български правен архитект. Пишеш на професионален юридически български (ЗЗД, ТЗ, ЗУТ, ГПК, ЗАНН, ЗАПСП, ЗННД).

Потребителят е дал свободно описание на документа. Може да е оставил някои секции празни — за тях измисли пазарно-стандартни клаузи, подходящи за вида документ и категорията. Никога не питай — попълвай разумно и пълно.

ВАЖНО — ВИДЪТ НА ДОКУМЕНТА Е ВОДЕЩ: Винаги спазвай посочения ВИД ДОКУМЕНТ (напр. протокол, декларация, пълномощно, договор, споразумение, разписка, жалба, оферта, фактура и т.н.). КАТЕГОРИЯТА е само тематичен контекст (предметна област) и НИКОГА не променя вида на документа. Ако видът е „протокол" а категорията е „Трудови правоотношения", резултатът ТРЯБВА да е протокол по трудовоправна тема — НЕ трудов договор. Заглавието, структурата, страните и тонът следват ВИДА, не категорията.

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
    "preamble": "...",
    "clauses": [{"number":"I.","title":"...","body":"Чл. 1. ...\\nЧл. 2. ..."}],
    "closing": "..."
  }
}

Номерация: римска за раздели, "Чл. N." за членове, "(1),(2)" за алинеи. Парични суми само в евро (€). Липсващи данни → плейсхолдъри в [квадратни скоби]. При едностранни документи (декларация, разписка, жалба) полето "clauses" може да съдържа само 1–3 секции, а "preamble"/"closing" да са кратки.

ПРАВИЛА ЗА ЗАДАТЪК / КАПАРО (чл. 93 ЗЗД) — ЗАДЪЛЖИТЕЛНИ:
Когато документът е предварителен договор, договор за капаро/задатък, разписка за задатък или сходен документ, санкционните клаузи трябва СТРОГО да следват чл. 93, ал. 2 ЗЗД:
- Ако страната, ДАЛА задатъка (обикн. купувач/наемател), се откаже или е виновна за неизпълнението → тя ГУБИ задатъка, а другата страна го ЗАДЪРЖА в ЕДИНИЧЕН размер. НИКОГА не пиши „задържа в двоен размер" за тази хипотеза.
- Ако страната, ПОЛУЧИЛА задатъка (обикн. продавач/наемодател), се откаже или е виновна → тя ВРЪЩА задатъка в ДВОЕН размер. НЕ пиши „връща капарото + неустойка в двоен размер" (това е двойно санкциониране и е грешно). Двойният размер вече включва обезщетителната функция.
- Изправната страна може алтернативно да иска изпълнение на договора (напр. иск по чл. 19, ал. 3 ЗЗД за обявяване на предварителен договор за окончателен) и обезщетение за реални вреди — но НЕ кумулативно с двойния задатък за същата вреда.
- Разграничавай ЗАДАТЪК (санкционна функция, чл. 93 ЗЗД) от АВАНС (само част от цената, връща се без санкция при неизпълнение). Ако страните са уговорили „капаро/задатък", използвай режима по чл. 93 ЗЗД.

ПИСМО-АНГАЖИМЕНТ ЗА КРЕДИТ — при предварителен договор за покупка на имот, ако купувачът финансира сделката с банков кредит (или е разумно вероятно да ползва такъв), ЗАДЪЛЖИТЕЛНО включи клауза:
- Купувачът се задължава в срок (примерно 14 дни) да предостави на Продавача писмо-ангажимент (letter of intent) от кредитираща банка.
- При документиран банков отказ за отпускане на кредит → задатъкът се връща в пълен размер, без санкция за нито една от страните.
- При непредставяне на писмо-ангажимент в срока или недобросъвестно поведение → приложим е общият режим по чл. 93 ЗЗД (задържане на задатъка).`;


type BuildMode = "fast" | "working" | "strict";

interface CustomField { key: string; label: string; value: string }

interface BuildPayload {
  name: string;
  category: string;
  categorySectorId?: string | null;
  documentType?: string;        // defaults to "contract"
  buildMode?: BuildMode;        // NEW — fast | working | strict (defaults to "working")
  bilingual?: boolean;          // NEW — when true, generate parallel BG + EN text
  parentContext?: {              // when building a child document
    parentTitle?: string;
    refNumber?: number | null;
    refType?: string;
  };
  partiesA: string[];
  partiesB: string[];
  customFields?: CustomField[];  // NEW — per-type wizard fields
  subject?: string;
  term?: string;
  prices?: string;
  obligations?: string;
  other?: string;
}

const BILINGUAL_ADDENDUM = `\n\n=== ДВУЕЗИЧЕН РЕЖИМ (BG + EN, ДВЕ КОЛОНИ) ===
Документът ще бъде представен в ДВЕ ПАРАЛЕЛНИ КОЛОНИ — българският оригинал отляво и официалният английски превод отдясно. ЗА ТАЗИ ЦЕЛ ВЪРНИ САМО БЪЛГАРСКИЯ ТЕКСТ В ОРИГИНАЛНИТЕ ПОЛЕТА (title, preamble, clauses[].title, clauses[].body, closing) И ДОБАВИ ПАРАЛЕЛНИ АНГЛИЙСКИ ПОЛЕТА:

{
  "contract": {
    "bilingual": true,
    "title": "Български заглавие",
    "title_en": "English Title",
    "preamble": "Български преамбюл...",
    "preamble_en": "English preamble...",
    "clauses": [
      {
        "number": "I.",
        "title": "Български заглавие на раздел",
        "title_en": "English section title",
        "body": "Чл. 1. ...\\nЧл. 2. ...",
        "body_en": "Art. 1. ...\\nArt. 2. ..."
      }
    ],
    "closing": "Български заключителни клаузи и подписи...",
    "closing_en": "English closing clauses and signatures..."
  }
}

ПРАВИЛА:
- НЕ слагай английски текст в българските полета и обратно. Двата текста са СТРОГО разделени.
- Номерацията на членовете и алинеите трябва да съвпада в двете версии ("Чл. 1." ↔ "Art. 1.", "(1)" ↔ "(1)").
- Английският превод трябва да бъде юридически точен, не машинен — използвай стандартна международна терминология (Party, Term, Consideration, Governing Law, Jurisdiction, Confidentiality, Indemnification, Force Majeure и т.н.).
- В последна клауза задължително добави клауза за предимство:
  body: "В случай на разминаване между българския и английския текст, българската версия има предимство."
  body_en: "In case of discrepancy between the Bulgarian and English texts, the Bulgarian version shall prevail."
- В closing включи реквизити двуезично, всеки в своето поле (BG в closing, EN в closing_en) — напр. "ВЪЗЛОЖИТЕЛ: ..." / "CLIENT: ...".
- Парични суми остават в евро (€) в двата текста.
- Брой клаузи и техният ред трябва да бъдат еднакви — за всяка БГ клауза задължително има съответстваща EN клауза.`;


const BUILD_MODE_ADDENDUM: Record<BuildMode, { label: string; addendum: string; model: string }> = {
  fast: {
    label: "БЪРЗ РЕЖИМ",
    model: "google/gemini-2.5-flash-lite",
    addendum: `Стил: КРАТКО И ЯСНО. Подходящ за прости документи без висока правна сложност.
- Минимален задължителен набор клаузи (предмет, страни, срок, цена, подпис).
- Кратки изречения, без излишни препратки към закони.
- Без обширни приложения и без подробен risk report (1–2 issues максимум).
- Без напомняния и съвети извън документа.`,
  },
  working: {
    label: "РАБОТЕН РЕЖИМ",
    model: "google/gemini-2.5-flash",
    addendum: `Стил: БАЛАНСИРАН — пълен работен документ с пространство за надграждане.
- Стандартен набор клаузи според вида документ и категорията.
- Кратко, но прецизно правно формулиране; цитирай ЗЗД/ТЗ при ключови клаузи.
- Risk report: 3–5 issues с конкретни препоръки за надграждане.
- Маркирай в issues кои клаузи могат опционално да бъдат разширени до стриктна версия.`,
  },
  strict: {
    label: "СТРИКТЕН РЕЖИМ",
    model: "google/gemini-2.5-pro",
    addendum: `Стил: ВИСОКА ПРОФЕСИОНАЛНА ПРЕЦИЗНОСТ — документът трябва да издържи юридическа проверка.
- Изчерпателен набор клаузи: дефиниции, представителство, поверителност, IP, неустойки, форсмажор, приложимо право и подсъдност, нотификации, цялост на договора.
- Цитирай конкретни членове от ЗЗД/ТЗ/ЗЗП/ЗАПСП/ЗЗЛД където е уместно.
- Дълги, точно формулирани клаузи; никакви двусмислици.
- Risk report: ПОДРОБЕН (поне 5–8 issues), със severity и detail-обяснение защо клаузата е важна и как се подобрява. Включи recommendations с конкретни съвети за висок професионализъм (e-signature, нотариална заверка, регистрация, данъчни импликации, и т.н.).`,
  },
};

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    let userId: string | null = null;
    let authDiag: { kid?: string; alg?: string; method?: string; reason?: string } = {};

    if (!authHeader.startsWith("Bearer ")) {
      authDiag.reason = "missing_bearer";
      console.warn("[build-custom-contract] auth fail:", authDiag);
    } else {
      const token = authHeader.replace("Bearer ", "").trim();

      // Decode JWT header for diagnostics (kid/alg) — no verification here.
      try {
        const headerB64 = token.split(".")[0];
        const padded = headerB64 + "=".repeat((4 - (headerB64.length % 4)) % 4);
        const headerJson = JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
        authDiag.kid = headerJson.kid;
        authDiag.alg = headerJson.alg;
      } catch (e) {
        authDiag.reason = "header_decode_failed";
        console.warn("[build-custom-contract] could not decode JWT header:", e);
      }

      // Prefer getClaims() — works with the signing-keys (ES256) auth system.
      try {
        const { data: claimsData, error: claimsErr } = await admin.auth.getClaims(token);
        if (claimsErr) {
          authDiag.reason = `getClaims:${claimsErr.message}`;
        } else if (claimsData?.claims?.sub) {
          userId = claimsData.claims.sub as string;
          authDiag.method = "getClaims";
        }
      } catch (e) {
        authDiag.reason = `getClaims_threw:${e instanceof Error ? e.message : String(e)}`;
      }

      // Fallback for legacy HS256 tokens.
      if (!userId) {
        try {
          const { data: u, error: uErr } = await admin.auth.getUser(token);
          if (uErr) {
            authDiag.reason = (authDiag.reason ?? "") + `|getUser:${uErr.message}`;
          } else if (u?.user?.id) {
            userId = u.user.id;
            authDiag.method = "getUser";
          }
        } catch (e) {
          authDiag.reason = (authDiag.reason ?? "") + `|getUser_threw:${e instanceof Error ? e.message : String(e)}`;
        }
      }
    }

    if (!userId) {
      console.warn("[build-custom-contract] 401 auth_required:", authDiag);
      return new Response(
        JSON.stringify({
          error: "За да изградите договор, влезте безплатно с email или Google.",
          code: "auth_required",
          requires_login: true,
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    console.log("[build-custom-contract] auth ok:", { userId, ...authDiag });

    // Parse + validate body first so we can fire rate-limit, content
    // guard, and cache lookup queries in parallel.
    const body = (await req.json()) as BuildPayload;
    const {
      name = "",
      category = "",
      categorySectorId = null,
      documentType = "contract",
      buildMode = "working",
      bilingual = false,
      parentContext = undefined,
      partiesA = [],
      partiesB = [],
      customFields = [],
      subject = "",
      term = "",
      prices = "",
      obligations = "",
      other = "",
      userConfirmed = false,
    } = body as BuildPayload & { userConfirmed?: boolean };
    const safeBuildMode: BuildMode = (["fast", "working", "strict"] as BuildMode[]).includes(buildMode as BuildMode)
      ? (buildMode as BuildMode)
      : "working";
    const modeSpec = BUILD_MODE_ADDENDUM[safeBuildMode];
    const safeBilingual = Boolean(bilingual);

    if (!name.trim() || !category.trim()) {
      return new Response(
        JSON.stringify({ error: "Името и категорията са задължителни." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const safeDocumentType = ALL_DOCUMENT_TYPE_IDS.includes(documentType as any)
      ? documentType
      : "contract";
    const docSpec = getDocumentTypeSpec(safeDocumentType);

    const safeCustomFields: CustomField[] = Array.isArray(customFields)
      ? customFields.filter((f) => f && typeof f.key === "string" && typeof f.label === "string")
        .map((f) => ({ key: String(f.key), label: String(f.label), value: String(f.value ?? "") }))
      : [];

    const PROMPT_VERSION = "v6-bilingual-cols";
    const cacheKeyInput = stableStringify({
      v: PROMPT_VERSION, kind: "custom",
      documentType: safeDocumentType,
      buildMode: safeBuildMode,
      bilingual: safeBilingual,
      parentContext: parentContext ?? null,
      name, category,
      partiesA, partiesB,
      customFields: safeCustomFields,
      subject, term, prices, obligations, other,
    });
    const guardText = [
      name, category,
      ...(partiesA ?? []), ...(partiesB ?? []),
      subject, term, prices, obligations, other,
      ...safeCustomFields.map((f) => f.value),
    ].join("\n");

    const ipHash = await hashIp(clientIp(req));
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const cacheCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Run rate-limit count, illegal-content guard, and cache lookup in
    // parallel. They are independent of each other, so we save ~2 RTTs
    // versus the previous sequential pipeline.
    const [countRes, blocked, cacheHash] = await Promise.all([
      admin
        .from("ai_usage")
        .select("id", { count: "exact", head: true })
        .eq("function_name", "build-custom-contract")
        .gte("created_at", since)
        .eq("user_id", userId),
      guardIllegalContent({
        admin, text: guardText, functionName: "build-custom-contract",
        userId, ipHash: null,
        userAgent: req.headers.get("user-agent"),
        corsHeaders,
      }),
      sha256Hex(cacheKeyInput),
    ]);

    if ((countRes.count ?? 0) >= 5) {
      return new Response(
        JSON.stringify({
          error: "Достигнахте дневния лимит от 5 генерации. Опитайте утре или вземете Pro.",
          code: "rate_limited",
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (blocked) return blocked;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY липсва");

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



    const partyALabel = docSpec.partyAName || "Страна А";
    const partyBLabel = docSpec.partyBName || "Страна Б";
    const partiesAList = (partiesA.length ? partiesA : [`[${partyALabel}]`]).map((p, i) => `  ${i + 1}. ${p}`).join("\n");
    const partiesBList = docSpec.partyBName
      ? (partiesB.length ? partiesB : [`[${partyBLabel}]`]).map((p, i) => `  ${i + 1}. ${p}`).join("\n")
      : "(едностранен документ — без втора страна)";

    const parentHeader = parentContext?.parentTitle
      ? `КОНТЕКСТ: Това е дъщерен документ към основен договор „${parentContext.parentTitle}"${parentContext.refNumber ? `, под номер ${parentContext.refNumber}` : ""}.\n`
      : "";

    // Prefer per-type customFields when provided; fall back to legacy flat fields.
    let fieldsSection: string;
    if (safeCustomFields.length > 0) {
      fieldsSection = safeCustomFields.map((f) => {
        const label = f.label.toUpperCase();
        const val = (f.value ?? "").trim();
        return val
          ? `${label}:\n${val}\n`
          : `${label}: (не е посочено — измисли подходящо за вида документ)\n`;
      }).join("");
    } else {
      fieldsSection =
        (subject ? `ПРЕДМЕТ:\n${subject}\n` : "ПРЕДМЕТ: (не е посочен — измисли подходящ за вида документ)\n") +
        (term ? `СРОК:\n${term}\n` : "") +
        (prices ? `ЦЕНИ И ПЛАЩАНЕ:\n${prices}\n` : "") +
        (obligations ? `ЗАДЪЛЖЕНИЯ:\n${obligations}\n` : "") +
        (other ? `ДРУГИ КЛАУЗИ / СПЕЦИФИКИ:\n${other}\n` : "");
    }

    const userPrompt = `${parentHeader}ВИД ДОКУМЕНТ (ВОДЕЩ — не променяй): ${docSpec.label}
КАТЕГОРИЯ (само тематичен контекст): ${category}
ЗАГЛАВИЕ: ${name}

${partyALabel.toUpperCase()}/И:
${partiesAList}

${docSpec.partyBName ? `${partyBLabel.toUpperCase()}/И:\n${partiesBList}\n` : ""}
${fieldsSection}
Задача: Risk Analysis (конкретни слаби места) + ПЪЛНИЯТ документ${safeBilingual ? " на български И английски (двуезично, паралелно)" : " на български"}. Върни СТРОГО валиден JSON по схемата.`;

    // === GDPR/AI Act compliance layer ===
    const classification = classifyDocumentBeforeAI(userPrompt);
    const route = routeModel("build-custom-contract", classification, {
      userConfirmed, promptLength: userPrompt.length,
    });
    if (!route.allowed) {
      await logAiAudit({
        user_id: userId, operation: "build-custom-contract", model: "",
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

    const redacted = route.redactionRequired ? redactForAI(userPrompt) : { redacted: userPrompt, mapping: {}, stats: {} };
    const redactionNote = route.redactionRequired
      ? "ВАЖНО: Лични данни са заменени с плейсхолдъри (<NAME_1>, <EGN_1>, <IBAN_1> и т.н.). Използвай ги дословно в готовия документ — те ще бъдат възстановени при връщане.\n\n"
      : "";

    const composedSystem = `${BASE_SYSTEM_PROMPT}\n\n=== СПЕЦИФИКА ЗА ВИД „${docSpec.label.toUpperCase()}" ===\n${docSpec.systemAddendum}\n\n=== ${modeSpec.label} ===\n${modeSpec.addendum}${safeBilingual ? BILINGUAL_ADDENDUM : ""}`;
    const baseSystem = await loadActivePrompt(admin, "build-custom-contract", composedSystem);
    const { retrieveLegalContext } = await import("../_shared/legal-rag.ts");
    const legal = await retrieveLegalContext(admin, LOVABLE_API_KEY, `${docSpec.label}\n${redacted.redacted}`.slice(0, 4000), { matchCount: 6 });
    const activeSystemPrompt = legal.hasMatches ? `${baseSystem}\n\n${legal.promptBlock}` : baseSystem;
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: route.model,
        messages: [
          { role: "system", content: activeSystemPrompt },
          { role: "user", content: redactionNote + redacted.redacted },
        ],
        response_format: { type: "json_object" },
        // Generation + risk analysis JSON can easily exceed default token caps
        // and the response gets truncated mid-string, breaking JSON.parse.
        max_tokens: 16000,
      }),
    });

    if (!aiResp.ok) {
      await logAiAudit({
        user_id: userId, operation: "build-custom-contract", model: route.model,
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

    await admin.from("ai_usage").insert({
      user_id: userId,
      ip_hash: null,
      function_name: "build-custom-contract",
    });

    const rawText = await aiResp.text();
    if (!rawText) throw new Error("Празен отговор от AI");

    let data: any;
    try { data = JSON.parse(rawText); } catch {
      console.error("AI raw (not JSON):", rawText.slice(0, 500));
      throw new Error("AI върна невалиден JSON отговор");
    }

    const content: string = data.choices?.[0]?.message?.content ?? "";
    const finishReason: string = data.choices?.[0]?.finish_reason ?? "";
    if (!content || !content.trim()) {
      throw new Error("AI не върна съдържание. Опитайте отново.");
    }

    let parsed: { risk: any; contract: any };
    try {
      const { parseAiJsonWithRetry } = await import("../_shared/ai-json-retry.ts");
      const res = await parseAiJsonWithRetry({
        content,
        messages: [
          { role: "system", content: activeSystemPrompt },
          { role: "user", content: redactionNote + redacted.redacted },
        ],
        model: route.model,
        apiKey: LOVABLE_API_KEY,
        fn: "build-custom-contract",
        maxTokens: 16000,
        regenerateAttempts: 1,
        validate: (p: any) => !!p?.contract,
      });
      parsed = res.parsed;
      if (res.stage !== "direct") console.log(`build-custom-contract: JSON recovered via ${res.stage}`);
    } catch {
      console.error("JSON parse failed. finish_reason:", finishReason, "Content head:", content.slice(0, 800));
      const friendly = finishReason === "length"
        ? "Документът е твърде дълъг и отговорът беше отрязан. Моля опитайте с по-кратко описание или го разделете на части."
        : "AI отговорът не може да бъде анализиран. Моля опитайте отново.";
      throw new Error(friendly);
    }


    // Unredact AI output so the user sees real names/EGN/IBAN in the final doc.
    if (Object.keys(redacted.mapping).length > 0) {
      try {
        parsed = JSON.parse(unredact(JSON.stringify(parsed), redacted.mapping));
      } catch (e) { console.error("unredact failed:", e); }
    }

    // Ensure bilingual flag is set when requested, so the renderer/exporters
    // know to use the two-column layout even if the AI forgets to include it.
    if (safeBilingual && parsed?.contract) {
      parsed.contract.bilingual = true;
    }

    await logAiAudit({
      user_id: userId, operation: "build-custom-contract", model: route.model,
      classification, redaction_applied: route.redactionRequired, status: "ok",
      tokens_in: data?.usage?.prompt_tokens,
      tokens_out: data?.usage?.completion_tokens,
    });

    // Cache successful result.
    try {
      await admin.from("template_cache").upsert({ hash: cacheHash, payload: parsed, created_at: new Date().toISOString() });
    } catch (e) { console.error("template_cache upsert:", e); }

    // Fire-and-forget: anonymise + persist as a candidate blank for admin review.
    // We do NOT await this so the user's response is fast.
    EdgeRuntime?.waitUntil?.(
      anonymiseAndStoreBlank(admin, {
        name, category, categorySectorId,
        contract: parsed.contract,
        userId,
        LOVABLE_API_KEY,
      }).catch((e) => console.error("anonymiseAndStoreBlank failed:", e))
    );

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("build-custom-contract error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Неизвестна грешка" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

const ANON_SYSTEM = `Ти си редактор на правни шаблони. Получаваш JSON на договор и връщаш СЪЩИЯ JSON, но със заменени конкретни данни (имена на лица/фирми, ЕГН/ЕИК, точни суми, точни дати, конкретни адреси, телефони, email, IBAN, специфични продукти/услуги) с плейсхолдъри в квадратни скоби: [Възложител], [Изпълнител], [сума в €], [срок], [дата], [адрес], [предмет на договора] и т.н. Запази структурата, номерацията, всички клаузи и общите формулировки. Върни СТРОГО валиден JSON със същата схема: {"title":"...","preamble":"...","clauses":[{"number":"...","title":"...","body":"..."}],"closing":"..."}.`;

async function anonymiseAndStoreBlank(
  admin: ReturnType<typeof createClient>,
  args: {
    name: string;
    category: string;
    categorySectorId: string | null;
    contract: { title: string; preamble: string; clauses: any[]; closing: string };
    userId: string;
    LOVABLE_API_KEY: string;
  },
) {
  const { name, category, categorySectorId, contract, userId, LOVABLE_API_KEY } = args;

  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: ANON_SYSTEM },
        { role: "user", content: JSON.stringify(contract) },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!aiResp.ok) { console.error("anon ai status:", aiResp.status); return; }
  const data = await aiResp.json();
  const content: string = data.choices?.[0]?.message?.content ?? "";
  if (!content.trim()) return;

  let blank: any;
  try { blank = extractJson(content, { fn: "build-custom-contract" }); } catch (e) { console.error("anon parse:", e); return; }

  // Hash on the anonymised text to dedupe similar blanks.
  const text = [blank.title, blank.preamble, ...(blank.clauses ?? []).map((c: any) => `${c.number} ${c.title} ${c.body}`), blank.closing].join("\n");
  const text_hash = await sha256Hex(text.replace(/\s+/g, " ").trim().toLowerCase());

  // Try insert; on conflict (duplicate text_hash) increment occurrences.
  const { error: insErr } = await admin.from("custom_contract_blanks").insert({
    source_user_id: userId,
    category,
    category_sector_id: categorySectorId,
    name,
    text_hash,
    blank_payload: blank,
  });
  if (insErr && (insErr as any).code === "23505") {
    // Duplicate — bump occurrences.
    await admin.rpc("noop_no_such_fn").catch(() => {});
    const { data: existing } = await admin
      .from("custom_contract_blanks")
      .select("id, occurrences")
      .eq("text_hash", text_hash)
      .maybeSingle();
    if (existing) {
      await admin
        .from("custom_contract_blanks")
        .update({ occurrences: (existing.occurrences ?? 1) + 1 })
        .eq("id", existing.id);
    }
  } else if (insErr) {
    console.error("blank insert error:", insErr);
  }
}
