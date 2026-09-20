// Edge function: generate a linked document (appendix, annex, handover
// protocol, declaration, power of attorney, notice) using the parent
// contract as context. Returns { contract: GeneratedContract }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors, hashIp, clientIp } from "../_shared/cors.ts";
import { getCorrelationId, correlationHeaders } from "../_shared/correlation.ts";

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

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    let userId: string | null = null;
    if (authHeader.startsWith("Bearer ")) {
      const { data: u } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
      userId = u?.user?.id ?? null;
    }

    const ipHash = await hashIp(clientIp(req));

    // Rate limits: anonymous 1/24h per IP, authenticated 5/24h per user.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("function_name", "generate-linked-document")
      .gte("created_at", since)
      .filter(userId ? "user_id" : "ip_hash", "eq", userId ?? ipHash);
    const limit = userId ? 5 : 1;
    if ((count ?? 0) >= limit) {
      return new Response(
        JSON.stringify({
          error: userId
            ? "Достигнахте дневния лимит от 5 генерации. Опитайте утре или вземете Pro."
            : "За да генерирате свързан документ, влезте безплатно с email или Google.",
          code: "rate_limited",
          requires_login: !userId,
        }),
        { status: 429, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } },
      );
    }

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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY липсва");

    const parentText = [
      `ЗАГЛАВИЕ: ${parentContract.title}`,
      `ПРЕАМБЮЛ:\n${parentContract.preamble ?? ""}`,
      ...(parentContract.clauses ?? []).map(
        (c) => `${c.number ?? ""} ${c.title ?? ""}\n${c.body ?? ""}`,
      ),
      `ЗАКЛЮЧЕНИЕ:\n${parentContract.closing ?? ""}`,
    ].join("\n\n").slice(0, 12000);

    // КЛАСИФИКАЦИЯ + РЕДАКЦИЯ на ЦЯЛОТО изходящо съдържание (основен договор
    // и указанията на потребителя) преди всяка външна заявка.
    const outboundCorpus = `${notes}\n\n${parentText}`;
    const classification = classifyDocumentBeforeAI(outboundCorpus);
    if (classification.risk_level === "blocked") {
      return new Response(
        JSON.stringify({ error: "Съдържанието не може да бъде обработено.", code: "content_blocked", charged: false }),
        { status: 422, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } },
      );
    }
    const redaction = redactForAI(outboundCorpus);
    const [safeNotes, safeParentText] = (() => {
      const parts = redaction.redacted.split("\n\n");
      return [parts[0] ?? "", parts.slice(1).join("\n\n")];
    })();

    const userPrompt = `ВИД НА СВЪРЗАНИЯ ДОКУМЕНТ: ${spec.label}${number ? ` №${number}` : ""}
${safeNotes.trim() ? `ДОПЪЛНИТЕЛНИ УКАЗАНИЯ ОТ ПОТРЕБИТЕЛЯ:\n${safeNotes.trim()}\n` : ""}
СПЕЦИФИКА ЗА ТОЗИ ВИД:
${spec.addendum}

ОСНОВЕН ДОГОВОР (контекст — не преповтаряй, само реферирай):
${safeParentText}

Задача: Изготви ПЪЛНИЯТ свързан документ на български според описаната по-горе структура. Върни СТРОГО валиден JSON по схемата.`;

    // СТРОГО ЗАЗЕМЯВАНЕ преди модела и преди запис на ai_usage.
    const { retrieveLegalContext } = await import("../_shared/legal-rag.ts");
    const legal = await retrieveLegalContext(
      admin,
      LOVABLE_API_KEY,
      `${spec.label} ${parentContract.title}\n${safeNotes}`.slice(0, 4000),
      { matchCount: 6 },
    );
    if (!legal.hasMatches) {
      const { legalVerificationUnavailableResponse } = await import("../_shared/legal-gate.ts");
      return legalVerificationUnavailableResponse({
        headers: { ...corsHeaders, ...correlationHeaders(correlationId) },
      });
    }
    const groundedSystem = `${SYSTEM_PROMPT}\n\n${legal.promptBlock}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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


    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Достигнат е лимитът. Моля опитайте след малко." }),
          { status: 429, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } },
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "Изчерпани са кредитите за AI. Моля заредете акаунта." }),
          { status: 402, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } },
        );
      }
      const t = await aiResp.text();
      console.error("AI gateway:", aiResp.status, t);
      throw new Error("AI грешка");
    }

    await admin.from("ai_usage").insert({
      user_id: userId,
      ip_hash: userId ? null : ipHash,
      function_name: "generate-linked-document",
    });

    const rawJson = await aiResp.json();
    const content: string = rawJson?.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) throw new Error("AI не върна съдържание");

    const { parseAiJsonWithRetry } = await import("../_shared/ai-json-retry.ts");
    const parsed = (await parseAiJsonWithRetry({
      content,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      model: "google/gemini-2.5-flash",
      apiKey: LOVABLE_API_KEY,
      fn: "generate-linked-document",
      correlationId,
      regenerateAttempts: 1,
    })).parsed;

    return new Response(
      JSON.stringify({
        ...parsed,
        meta: { kind, parent_slug: parentSlug, number },
      }),
      { headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(`generate-linked-document error [cid=${correlationId}]:`, e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Неизвестна грешка", correlation_id: correlationId }),
      { status: 500, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } },
    );
  }
});
