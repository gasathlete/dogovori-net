// AI generation of a custom (free-form) document from minimal user inputs.
// Supports multiple document types (contract, appendix, annex, receipt,
// power_of_attorney, declaration, complaint, claim, notary_invitation,
// offer, invoice, protocol, agreement, smr, kss).
// Uses Lovable AI Gateway (Gemini).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { buildCors, hashIp, clientIp } from "../_shared/cors.ts";
import { loadActivePrompt } from "../_shared/prompt-loader.ts";
import { guardIllegalContent } from "../_shared/illegal-content.ts";
import { getDocumentTypeSpec, ALL_DOCUMENT_TYPE_IDS } from "../_shared/document-types.ts";
import { classifyDocumentBeforeAI } from "../_shared/classify.ts";
import { redactForAI, unredact } from "../_shared/redact.ts";
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
- Без обширни приложения. В "issues" включвай САМО реално установени правни дефекти — нула issues е валиден резултат.
- Без напомняния и съвети извън документа.`,
  },
  working: {
    label: "РАБОТЕН РЕЖИМ",
    model: "google/gemini-2.5-flash",
    addendum: `Стил: БАЛАНСИРАН — пълен работен документ с пространство за надграждане.
- Стандартен набор клаузи според вида документ и категорията.
- Кратко, но прецизно правно формулиране; цитирай ЗЗД/ТЗ при ключови клаузи.
- Risk report: в "issues" влизат САМО ПРОВЕРЕНИ дефекти на документа (противоречие между клаузи, нищожна или незаконна клауза, прекомерна неустойка, липсващ задължителен по закон елемент, несъответствие с изричното желание на потребителя). Нула issues е валиден и очакван резултат при изряден документ.
- Възможностите за опционално надграждане и всичко, което потребителят ще попълни локално, влизат в "recommendations" — НИКОГА в "issues".`,
  },
  strict: {
    label: "СТРИКТЕН РЕЖИМ",
    model: "google/gemini-2.5-pro",
    addendum: `Стил: ВИСОКА ПРОФЕСИОНАЛНА ПРЕЦИЗНОСТ — документът трябва да издържи юридическа проверка.
- Изчерпателен набор клаузи: дефиниции, представителство, поверителност, IP, неустойки, форсмажор, приложимо право и подсъдност, нотификации, цялост на договора.
- Цитирай конкретни членове от ЗЗД/ТЗ/ЗЗП/ЗАПСП/ЗЗЛД където е уместно.
- Дълги, точно формулирани клаузи; никакви двусмислици.
- Risk report: в "issues" влизат САМО ПРОВЕРЕНИ дефекти с дословна опора в текста, със severity и detail. Без задължителен брой — нула issues е валиден резултат при изряден документ. Съветите за професионализъм (e-signature, нотариална заверка, регистрация, данъчни импликации) влизат в "recommendations".`,
  },
};

Deno.serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
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
          authDiag.reason = "getClaims:" + String(claimsErr.message);
        } else if (claimsData?.claims?.sub) {
          userId = claimsData.claims.sub as string;
          authDiag.method = "getClaims";
        }
      } catch (e) {
        authDiag.reason = "getClaims_threw:" + (e instanceof Error ? e.message : String(e));
      }

      // Fallback for legacy HS256 tokens.
      if (!userId) {
        try {
          const { data: u, error: uErr } = await admin.auth.getUser(token);
          if (uErr) {
            authDiag.reason = (authDiag.reason ?? "") + "|getUser:" + String(uErr.message);
          } else if (u?.user?.id) {
            userId = u.user.id;
            authDiag.method = "getUser";
          }
        } catch (e) {
          authDiag.reason = (authDiag.reason ?? "") + "|getUser_threw:" + (e instanceof Error ? e.message : String(e));
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
        { status: 401, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } },
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
        { status: 400, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } },
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

    // Клиентският ключ на операцията е ЗАДЪЛЖИТЕЛЕН: без него повторният опит
    // не е идемпотентен и би генерирал и таксувал наново.
    const { asUuidOrNull, canonicalRequestDigest } = await import("../_shared/canonical-digest.ts");
    // Заобикаляне на тясната типизация на BuildPayload: полето идва от суровия
    // JSON на заявката, не от декларираната форма.
    const rawClientOpId = (body as unknown as Record<string, unknown>)?.operation_id ??
      (body as unknown as Record<string, unknown>)?.client_operation_id;
    const operationId = asUuidOrNull(rawClientOpId);
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

    // КАНОНИЧЕН ОТПЕЧАТЪК на ЦЯЛОТО семантично съдържание на заявката — СЛЕД
    // проверката на правата и схемата, но ПРЕДИ ВСЯКА променлива външна
    // зависимост (дневен лимит, проверка за незаконно съдържание, класификация,
    // редакция, промпт от базата, ключ на доставчика, правно заземяване).
    const requestDigest = await canonicalRequestDigest({
      purpose: "build_custom_contract",
      userId,
      name,
      category,
      categorySectorId,
      documentType: safeDocumentType,
      buildMode: safeBuildMode,
      bilingual: safeBilingual,
      parentContext: parentContext ?? null,
      partiesA,
      partiesB,
      customFields: safeCustomFields,
      subject,
      term,
      prices,
      obligations,
      other,
    });

    const {
      reserveQuotaNoCharge,
      commitQuota,
      cancelQuota,
      billingReconciliationResponse,
      recordReconciliation,
      lookupCommittedOperation,
      isOperationInProgress,
      operationInProgressResponse,
      responseExpiredResponse,
    } = await import("../_shared/quota-ledger.ts");
    type LedgerDb = Parameters<typeof reserveQuotaNoCharge>[0];
    const ledgerDb = admin as unknown as LedgerDb;
    const jsonHeaders = {
      ...corsHeaders,
      ...correlationHeaders(correlationId),
      "Content-Type": "application/json",
    };
    // build-custom-contract ОСТАВА БЕЗПЛАТНО генериране (само дневният лимит
    // от 5 през ai_usage важи тук) — квотата „contract" се плаща отделно, при
    // самото сваляне (download-document). За да получи операцията траен
    // точно-веднъж леджър (задължителен за идемпотентност/повторение) БЕЗ да
    // въвежда ново, скрито таксуване, резервацията минава през
    // quota_reserve_no_charge: записва се пълното обвързване с
    // charged = false, source = 'no_charge', но НЕ се докосва download_quota
    // и НЕ се консумира абонамент/топъп/бонус/сесийно право.
    const ledgerBinding = {
      operationId,
      userId,
      kind: "contract" as const,
      purpose: "build_custom_contract",
      batchId: null,
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
    const exactReplayResponse = (payload: Record<string, unknown>) =>
      new Response(
        JSON.stringify(payload),
        { headers: { ...jsonHeaders, "X-Operation-Replay": "true" } },
      );

    // САМО-ЧЕТЯЩА проверка: без резервация, без освобождаване, без такса.
    // ПРЕДИ всяка чуплива/платена зависимост (дневен лимит, незаконно
    // съдържание, класификация, редакция, промпт от базата, ключ на
    // доставчика, правно заземяване).
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
      await recordReconciliation(ledgerDb, operationId, `build_custom_contract_lookup:${lookup.reason}`, {
        user_id: userId,
        kind: "contract",
      });
      return billingReconciliationResponse({ ...corsHeaders, ...correlationHeaders(correlationId) });
    }
    if (lookup.status === "response_expired") {
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
      await recordReconciliation(ledgerDb, operationId, "build_custom_contract_committed_without_result", {
        user_id: userId,
        kind: "contract",
      });
      return billingReconciliationResponse({ ...corsHeaders, ...correlationHeaders(correlationId) });
    }

    const PROMPT_VERSION = "v6-bilingual-cols";
    const guardText = [
      name, category,
      ...(partiesA ?? []), ...(partiesB ?? []),
      subject, term, prices, obligations, other,
      ...safeCustomFields.map((f) => f.value),
    ].join("\n");

    const ipHash = await hashIp(clientIp(req));
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    // Rate-limit count и проверката за забранено съдържание са независими и
    // вървят паралелно. Кеш вече не се търси (виж бележката по-долу).
    const [countRes, blocked] = await Promise.all([
      admin
        .from("ai_usage")
        .select("id", { count: "exact", head: true })
        .eq("function_name", "build-custom-contract")
        .gte("created_at", since)
        .eq("user_id", userId),
      guardIllegalContent({
        // Пред-съществуващо несъответствие между версии на generated types;
        // поведението на клиента не се променя.
        admin: admin as any, text: guardText, functionName: "build-custom-contract",
        userId, ipHash: null,
        userAgent: req.headers.get("user-agent"),
        corsHeaders,
      }),
    ]);

    if ((countRes.count ?? 0) >= 5) {
      return new Response(
        JSON.stringify({
          error: "Достигнахте дневния лимит от 5 генерации. Опитайте утре или вземете Pro.",
          code: "rate_limited",
        }),
        { status: 429, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } },
      );
    }
    if (blocked) return blocked;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY липсва");

    // КЕШЪТ СЕ ЗАОБИКАЛЯ: записите в template_cache не носят сървърни
    // доказателства кои проверени норми стоят зад тях, затова не се сервират.
    // Документ се връща само след успешно извличане за ТОЧНО тази заявка.

    const partyALabel = docSpec.partyAName || "Страна А";
    const partyBLabel = docSpec.partyBName || "Страна Б";
    const partyAPlaceholder = "[" + partyALabel + "]";
    const partyBPlaceholder = "[" + partyBLabel + "]";
    const partiesASource = partiesA.length ? partiesA : [partyAPlaceholder];
    const partiesBSource = partiesB.length ? partiesB : [partyBPlaceholder];
    const partiesAList = partiesASource.map((p, i) => `  ${i + 1}. ${p}`).join("\n");
    const partiesBList = docSpec.partyBName
      ? partiesBSource.map((p, i) => `  ${i + 1}. ${p}`).join("\n")
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

    const redacted = route.redactionRequired ? redactForAI(userPrompt) : { redacted: userPrompt, mapping: {}, stats: {} };
    const redactionNote = route.redactionRequired
      ? "ВАЖНО: Лични данни са заменени с плейсхолдъри (<NAME_1>, <EGN_1>, <IBAN_1> и т.н.). Използвай ги дословно в готовия документ — те ще бъдат възстановени при връщане.\n\n"
      : "";

    const composedSystem = `${BASE_SYSTEM_PROMPT}\n\n=== СПЕЦИФИКА ЗА ВИД „${docSpec.label.toUpperCase()}" ===\n${docSpec.systemAddendum}\n\n=== ${modeSpec.label} ===\n${modeSpec.addendum}${safeBilingual ? BILINGUAL_ADDENDUM : ""}`;
        // Пред-съществуващо несъответствие между версии на generated types.
    const baseSystem = await loadActivePrompt(admin as any, "build-custom-contract", composedSystem);
    const { retrieveLegalContext } = await import("../_shared/legal-rag.ts");
        const legal = await retrieveLegalContext(admin as any, LOVABLE_API_KEY, `${docSpec.label}\n${redacted.redacted}`.slice(0, 4000), { matchCount: 6 });
    // FAIL-CLOSED: без проверена норма за тази заявка няма повикване към модел.
    if (!legal.hasMatches) {
      const { legalVerificationUnavailableResponse } = await import("../_shared/legal-gate.ts");
      return legalVerificationUnavailableResponse({ headers: { ...corsHeaders, ...correlationHeaders(correlationId) } });
    }
    const activeSystemPrompt = `${baseSystem}\n\n${legal.promptBlock}`;

    // РЕЗЕРВАЦИЯ БЕЗ ТАКСА: след всички непарични проверки. ЕДИН леджър,
    // идемпотентен по ключа на операцията и обвързан със съдържанието на
    // заявката — но БЕЗ никакво ново начисляване (виж бележката по-горе).
    const reservation = await reserveQuotaNoCharge(ledgerDb, ledgerBinding);
    if (reservation.status === "conflict") return conflictResponse();
    if (reservation.status === "reconciliation") {
      await recordReconciliation(ledgerDb, operationId, `build_custom_contract_reserve:${reservation.reason}`, {
        user_id: userId,
        kind: "contract",
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
          `build_custom_contract_cancel_failed:${outcome.reason}`,
          { user_id: userId, kind: "contract" },
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
      const unresolved = await cancelOrReport(`ai_gateway_${aiResp.status}`);
      await logAiAudit({
        user_id: userId, operation: "build-custom-contract", model: route.model,
        classification, redaction_applied: route.redactionRequired,
        status: "error", error_code: `http_${aiResp.status}`,
      });
      if (unresolved) return unresolved;
      // Тялото на шлюза НЕ се връща и НЕ се логва: може да носи части от
      // въведените от потребителя данни.
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

    const rawText = await aiResp.text();
    if (!rawText) throw new Error("Празен отговор от AI");

    let data: any;
    try { data = JSON.parse(rawText); } catch {
      console.error("AI raw response was not valid JSON (length:", rawText.length, ")");
      throw new Error("AI върна невалиден JSON отговор");
    }

    const content: string = data.choices?.[0]?.message?.content ?? "";
    const finishReason: string = data.choices?.[0]?.finish_reason ?? "";
    if (!content || !content.trim()) {
      throw new Error("AI не върна съдържание. Опитайте отново.");
    }

    let parsed: { risk: any; contract: any; [key: string]: unknown };
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
      correlationId,
        maxTokens: 16000,
        regenerateAttempts: 1,
        validate: (p: any) => !!p?.contract,
      });
      parsed = res.parsed;
      if (res.stage !== "direct") console.log(`build-custom-contract: JSON recovered via ${res.stage}`);
    } catch {
      console.error("JSON parse failed. finish_reason:", finishReason, "content_length:", content.length);
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

    // Q4a — същият детерминиран gate като при generate-contract: реалните
    // дефекти се пазят, умишлените ни решения и недоказаните бележки отпадат.
    if (parsed?.risk) {
      const signingSecret = qualitySigningSecretFromEnv();
      if (!signingSecret) console.error("quality manifest signing key unavailable");
      // Q4b — намерението се извлича САМО от структурираните полета на съветника
      // (`customFields`) и от АВТОРИТЕТНИТЕ наименовани полета `term`/`prices`,
      // където слотът е известен от името на полето. От тях се приема твърдение
      // само при ТОЧНО ЕДИН недвусмислен кандидат; при нула или няколко —
      // нищо. От `subject`/`obligations`/`other` НИКОГА не се домисля намерение.
      const intents = signingSecret
        ? await buildIntentAssertions({
          serverSecret: signingSecret,
          drafts: extractIntentDrafts({
            questions: safeCustomFields.map((f) => ({ id: f.key, label: f.label })),
            answers: Object.fromEntries(safeCustomFields.map((f) => [f.key, f.value])),
            structured: { term, prices },
            flags: { bilingual: safeBilingual },
          }),
        })
        : [];

      const qualityManifest = signingSecret ? await buildQualityManifest({
        origin: "build-custom-contract",
        signingSecret,
        contract: parsed.contract,
        intents,
        documentType: safeDocumentType,
        buildMode: safeBuildMode,
        contextFingerprint: await computeContextFingerprint([
          `doc_type:${safeDocumentType}`,
          `build_mode:${safeBuildMode}`,
          `bilingual:${safeBilingual}`,
        ]),
        decisions: [
          "placeholders_for_personal_data",
          "local_completion_of_personal_data",
          "optional_annex_details",
          safeBuildMode === "fast"
            ? "brief_clause_set"
            : safeBuildMode === "strict"
              ? "exhaustive_clause_set"
              : "standard_clause_set",
          ...(safeBilingual ? ["bilingual_parallel_text"] : []),
        ],
      }) : null;
      const documentText = flattenGeneratedContract(parsed.contract);
      const gated = applyRiskConsistencyGate({
        risk: parsed.risk,
        documentText,
        origin: "build-custom-contract",
        manifest: qualityManifest,
        trustedManifest: !!qualityManifest,
      });
      // Детерминираната проверка се слива СЛЕД gate-а — без ново AI повикване и
      // без начисляване на операция. Структурните факти са НАБЛЮДАВАНИ от
      // резултата, не копирани от входа.
      const intentReport = await verifyIntentAssertions({
        assertions: intents,
        documentText,
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
      // СЪРВЪРНО издаден ЕДНОКРАТЕН пропуск за ревизия на ТОЧНО този текст —
      // мината ТОЧНО ВЕДНЪЖ, преди потвърждението, и никога при повторение.
      {
        const { issueGrantForGeneratedContent, reviewGrantSecret } = await import(
          "../_shared/review-grant.ts"
        );
        const reviewGrant = await issueGrantForGeneratedContent({
          secret: reviewGrantSecret(),
          ownerId: userId,
          documentText,
        });
        if (reviewGrant) (parsed as Record<string, unknown>).review_grant = reviewGrant;
      }
    }

    // ЕДИН ТОЧЕН ОТГОВОР: сглобява се ВЕДНЪЖ и се записва ЦЯЛОСТНО при
    // потвърждението. Повторен опит по същия ключ връща същия отговор.
    const exactPayload = { ...parsed, charge_state: "charged" } as Record<string, unknown>;

    // ПОТВЪРЖДЕНИЕ + ОБВЪРЗВАНЕ на резултата ПРЕДИ 200: повторен опит по същия
    // ключ връща точно този текст. Недоказано потвърждение НЕ дава 200.
    const settlement = await commitQuota(ledgerDb, operationId, exactPayload);
    if (settlement.status !== "settled") {
      await recordReconciliation(
        ledgerDb,
        operationId,
        `build_custom_contract_commit_unresolved:${settlement.reason}`,
        { user_id: userId, kind: "contract" },
      );
      await logAiAudit({
        user_id: userId, operation: "build-custom-contract", model: route.model,
        classification, redaction_applied: route.redactionRequired,
        status: "error", error_code: "commit_unresolved",
      });
      return billingReconciliationResponse({ ...corsHeaders, ...correlationHeaders(correlationId) });
    }
    compensated = true;

    await logAiAudit({
      user_id: userId, operation: "build-custom-contract", model: route.model,
      classification, redaction_applied: route.redactionRequired, status: "ok",
      tokens_in: data?.usage?.prompt_tokens,
      tokens_out: data?.usage?.completion_tokens,
    });

    // ai_usage се записва САМО при успешен краен изход.
    await admin.from("ai_usage").insert({
      user_id: userId,
      ip_hash: null,
      function_name: "build-custom-contract",
    });

    // Няма скрито второ повикване към модел или автоматичен запис в
    // споделената библиотека след потвърждението. Бъдещ принос към
    // споделената библиотека изисква ОТДЕЛНО, изрично, версионирано съгласие
    // с ПОДРАЗБИРАЩА СЕ СТОЙНОСТ „не" и детерминиран работен процес за преглед
    // — бъдеща задача, все още НЕреализирана.

    // Връща се ТОЧНО записаният отговор (ако леджърът го е върнал обратно).
    const committedPayload = settlement.resultRef ?? exactPayload;
    return new Response(JSON.stringify(committedPayload), {
      headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" },
    });

    } catch (afterCharge) {
      // Всеки неуспешен краен изход след резервацията отменя я точно веднъж.
      const unresolved = await cancelOrReport(
        `exception:${String((afterCharge as Error)?.message ?? afterCharge).slice(0, 200)}`,
      );
      if (unresolved) return unresolved;
      throw afterCharge;
    }
  } catch (e) {
    // Нормализиран запис и отговор: без вътрешни съобщения и тела от шлюза.
    console.error("build-custom-contract error", {
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

