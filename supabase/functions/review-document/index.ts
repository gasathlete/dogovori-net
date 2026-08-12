// Edge function: AI ревизия (втори проход) на вече генериран документ.
//
// Целта е техническо качество: независим модел преглежда готовия текст и
// връща СТРУКТУРИРАН одит — липсващи задължителни реквизити, вътрешни
// противоречия, непопълнени полета и приложими правни основания.
// Не пренаписва документа и не начислява операция — това е контролен слой
// върху generate-contract.
import { buildCors } from "../_shared/cors.ts";
import { extractJson } from "../_shared/json.ts";
import { classifyDocumentBeforeAI } from "../_shared/classify.ts";
import { redactForAI } from "../_shared/redact.ts";
import { routeModel } from "../_shared/model-router.ts";
import { logAiAudit } from "../_shared/ai-call.ts";

const SYSTEM_PROMPT = `Ти си независим български правен ревизор (втори проход). Получаваш ГОТОВ документ и правиш техническа ревизия. НЕ пренаписваш текста.

Проверяваш строго и конкретно:
1. Задължителни реквизити за вида документ (страни, предмет, цена/възнаграждение, срок, дата и място, подписи, приложения).
2. ФОРМА И ДЕЙСТВИТЕЛНОСТ — задължителна проверка при всеки документ: изисква ли законът писмена форма, нотариална заверка на подписите и/или на съдържанието, вписване в регистър (Търговски регистър, Имотен регистър), одобрение от орган. Ако документът твърди обратното на закона (например че прехвърляне на дружествени дялове не се вписва в Търговския регистър или не изисква нотариално удостоверяване по чл. 129, ал. 2 ТЗ), това е "fail" и задължително влиза в "contradictions".
3. Вътрешни противоречия и несъответствия между клаузите (различни срокове, суми, валути, наименования на страните, номерация).
4. Валута и стойности — смесване на лева и евро, номинал на дялове, дължими суми без основание.
5. Непопълнени полета — всякакви [ ... ], {{ ... }}, ______ или XXXX.
6. Приложими правни основания — конкретни членове (ЗЗД, ТЗ, КТ, ЗЗП, ЗУТ, ЗОПБ, ЗЗЛД/GDPR), които документът реално задейства.

Връщай СТРОГО валиден JSON (без markdown ограждания):
{
  "verdict": "ready"|"needs_fixes"|"blocked",
  "confidence": 0-100,
  "summary": "1-2 изречения, професионален тон",
  "checks": [
    {"id":"kratko_id","label":"Проверка на …","status":"pass"|"warn"|"fail","note":"конкретна констатация"}
  ],
  "missing_requisites": ["конкретен липсващ реквизит"],
  "contradictions": [{"detail":"в какво се противоречат","where":"Чл. X / Чл. Y"}],
  "unfilled_fields": ["текст на непопълненото поле, както се среща в документа"],
  "legal_basis": [{"act":"ЗЗД","article":"чл. 79","why":"защо е приложим"}]
}

Правила:
- минимум 6 и максимум 12 записа в "checks"; винаги включвай проверка с id "forma_i_deystvitelnost";
- цитирай САМО членове, за които си сигурен, че съществуват и са относими; при съмнение не цитирай нищо (по-добре празен масив, отколкото измислен член);
- без стилистични мнения за тона и езика; без правни съвети по конкретен казус — само технически констатации по документа;
- "confidence" под 70, ако има съществено съмнение по формата или действителността;
- ако нищо не липсва, върни празни масиви и verdict "ready";
- КРИТИЧНО: в текстовите стойности НЕ използвай двойни кавички. Наименования пиши без кавички или с единични (Алфа ООД / 'Алфа' ООД), за да е JSON-ът винаги валиден.`;


// Полета, които потребителят попълва локално след сваляне (лични/идентификационни данни).
const PERSONAL_HINTS = [
  "име", "имена", "егн", "лнч", "еик", "булстат", "адрес", "седалище", "иban", "iban",
  "сметка", "телефон", "имейл", "email", "лична карта", "паспорт", "дата", "град",
  "представител", "мол", "подпис", "ддс",
];

function isPersonalField(text: string): boolean {
  const t = text.toLowerCase();
  return PERSONAL_HINTS.some((h) => t.includes(h));
}


Deno.serve(async (req: Request) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("Липсва конфигурация за AI");

    const body = await req.json().catch(() => ({}));
    const documentTitle: string = String(body.documentTitle ?? "Документ").slice(0, 300);
    const documentType: string = String(body.documentType ?? "").slice(0, 200);
    const documentText: string = String(body.documentText ?? "");
    const ignorePersonalData: boolean = body.ignorePersonalData === true;

    if (documentText.trim().length < 80) {
      return new Response(
        JSON.stringify({ error: "Документът е твърде кратък за ревизия" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Класификация + редакция преди изпращане към модела (без лични данни).
    const classification = classifyDocumentBeforeAI(documentText);
    // Ревизията е контролен слой — държим я на по-силен модел от генерирането,
    // но не на "pro" (латентността разваля UX-а в уизарда).
    const route = routeModel("analyze-contract", classification, {
      promptLength: Math.max(documentText.length, 6001),
    });


    if (!route.allowed) {
      return new Response(
        JSON.stringify({ error: "Ревизията е блокирана от политиката за данни", code: route.blockedReason }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const safeText = route.redactionRequired
      ? redactForAI(documentText).redacted
      : documentText;

    const scopeNote = ignorePersonalData
      ? [
          "ОБХВАТ: Потребителят ще попълни личните и идентификационните данни локално след сваляне.",
          "Затова НЕ отчитай като пропуск или липсващ реквизит непопълнени полета за имена, ЕГН/ЛНЧ, ЕИК/Булстат, адреси, седалище, IBAN/банкова сметка, телефон, имейл, лична карта, дата, град, представител и подпис.",
          "Върни празен масив \"unfilled_fields\" за такива полета и анализирай САМО генерираното съдържание — структура, клаузи, вътрешна логика и правни основания.",
        ].join("\n")
      : "";

    const userPrompt = [
      scopeNote,
      `Вид документ: ${documentType || "неуточнен"}`,
      `Заглавие: ${documentTitle}`,
      "",
      "ТЕКСТ НА ДОКУМЕНТА:",
      safeText.slice(0, 60000),
    ].filter(Boolean).join("\n");

    const callModel = async (messages: Array<{ role: string; content: string }>) => {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: route.model,
          messages,
          response_format: { type: "json_object" },
        }),
      });
      return r;
    };

    const aiResp = await callModel([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ]);

    if (!aiResp.ok) {
      await logAiAudit({
        user_id: null, operation: "analyze-contract", model: route.model, classification,
        redaction_applied: route.redactionRequired,
        status: "error", error_code: `http_${aiResp.status}`,
      });
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Достигнат е лимитът. Опитайте след малко." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Изчерпани са кредитите за AI." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error("AI грешка при ревизия");
    }

    const data = await aiResp.json();
    const content: string = data.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) throw new Error("AI не върна съдържание");

    // Моделът понякога връща невалиден JSON (неескейпнати кавички в note/detail).
    // Един поправящ проход, вместо 500 към потребителя.
    let parsed: Record<string, unknown>;
    try {
      parsed = extractJson(content, { fn: "review-document" }) as Record<string, unknown>;
    } catch (_parseErr) {
      const repair = await callModel([
        {
          role: "system",
          content:
            'Ти си JSON поправящ инструмент. Върни САМО валиден JSON обект със същото съдържание. Ескейпни всички кавички в стойностите или ги замени с единични. Без markdown, без коментари, без текст извън JSON.',
        },
        { role: "user", content: content.slice(0, 60000) },
      ]);
      if (!repair.ok) throw new Error("AI върна невалиден JSON при ревизия");
      const repairData = await repair.json();
      const repaired: string = repairData.choices?.[0]?.message?.content ?? "";
      parsed = extractJson(repaired, { fn: "review-document", stage: "repair" }) as Record<string, unknown>;
    }


    // Нормализация — UI-ът разчита на стабилна форма.
    const arr = (v: unknown) => (Array.isArray(v) ? v : []);
    const review = {
      verdict: ["ready", "needs_fixes", "blocked"].includes(String(parsed.verdict))
        ? String(parsed.verdict)
        : "needs_fixes",
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)),
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      checks: arr(parsed.checks).slice(0, 12).filter((c) => {
        // При отложено попълване на лични данни скриваме "fail" само заради тях.
        if (!ignorePersonalData) return true;
        const rec = c as Record<string, unknown>;
        if (String(rec.status) !== "fail") return true;
        return !isPersonalField(`${rec.label ?? ""} ${rec.note ?? ""}`);
      }),
      missing_requisites: arr(parsed.missing_requisites)
        .filter((x) => typeof x === "string")
        .filter((x) => !ignorePersonalData || !isPersonalField(x as string)),
      contradictions: arr(parsed.contradictions).slice(0, 10),
      unfilled_fields: arr(parsed.unfilled_fields)
        .filter((x) => typeof x === "string")
        .filter((x) => !ignorePersonalData || !isPersonalField(x as string))
        .slice(0, 20),

      legal_basis: arr(parsed.legal_basis).slice(0, 12),
      model: route.model,
      reviewed_at: new Date().toISOString(),
    };

    await logAiAudit({
      user_id: null, operation: "analyze-contract", model: route.model, classification,
      redaction_applied: route.redactionRequired, status: "ok",
      tokens_in: data?.usage?.prompt_tokens,
      tokens_out: data?.usage?.completion_tokens,
    });

    return new Response(JSON.stringify(review), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("review-document error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Неизвестна грешка" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
