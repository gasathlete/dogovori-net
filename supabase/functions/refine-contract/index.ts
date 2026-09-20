// Edge function: refine an already-generated contract based on a single free-text
// user feedback message. Applies the MINIMAL change necessary and returns the
// updated contract. Costs 1 op (via charge_corrections_wave with count=1),
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

    const body = await req.json();
    const contract = body?.contract;
    const feedback: string = String(body?.feedback ?? "").trim();
    const answers = body?.answers ?? {};
    const batchId: string | null = body?.batch_id ?? null;
    const userConfirmed: boolean = !!body?.userConfirmed;

    if (!contract || !feedback) {
      return new Response(JSON.stringify({ error: "Липсва договор или обратна връзка" }), {
        status: 400, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" },
      });
    }
    if (feedback.length > 1500) {
      return new Response(JSON.stringify({ error: "Обратната връзка е твърде дълга (макс. 1500 символа)." }), {
        status: 400, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" },
      });
    }

    // ВСИЧКИ НЕТАКСУЕМИ ПРОВЕРКИ СЕ ИЗВЪРШВАТ ПРЕДИ ТАКСУВАНЕ.
    // Illegal content guard

    const guardText = [JSON.stringify(contract).slice(0, 8000), feedback].join("\n");
    const blocked = await guardIllegalContent({
      admin, text: guardText, functionName: "refine-contract",
      userId, userAgent: req.headers.get("user-agent"), corsHeaders,
    });
    if (blocked) return blocked;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY липсва");

    // GDPR/AI Act routing
    const sourceText = [JSON.stringify(contract).slice(0, 20000), feedback].join("\n");
    const classification = classifyDocumentBeforeAI(sourceText);
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

    const contractJsonStr = JSON.stringify(contract);
    const redaction = route.redactionRequired
      ? redactForAI(contractJsonStr)
      : { redacted: contractJsonStr, mapping: {} as Record<string, string>, stats: {} };
    const feedbackRedacted = route.redactionRequired
      ? (() => {
          const r = redactForAI(feedback);
          Object.assign(redaction.mapping, r.mapping);
          return r.redacted;
        })()
      : feedback;
    const answersStr = Object.entries(answers ?? {}).map(([k, v]) => `- ${k}: ${v}`).join("\n");

    const redactionNote = route.redactionRequired
      ? "Забележка: Лични данни са заменени с плейсхолдъри <NAME_1>, <EGN_1>. Запази ги дословно.\n"
      : "";

    const userPrompt = `${redactionNote}СЪЩЕСТВУВАЩ ДОГОВОР (JSON):
${redaction.redacted}

ОБРАТНА ВРЪЗКА ОТ ПОТРЕБИТЕЛЯ:
"""
${feedbackRedacted}
"""

КОНТЕКСТ ОТ ИНТЕРВЮТО (за справка, не променяй ако не е нужно):
${answersStr}

Върни коригирания договор (или непроменен, ако обратната връзка не е основателна) в указания JSON формат.`;

    const rawSystem = await loadActivePrompt(admin, "refine-contract", SYSTEM_PROMPT);

    // СТРОГО ЗАЗЕМЯВАНЕ за точно тази (редактирана) заявка — ПРЕДИ таксуване
    // и преди всяко повикване към модела.
    const { retrieveLegalContext } = await import("../_shared/legal-rag.ts");
    const legal = await retrieveLegalContext(
      admin,
      LOVABLE_API_KEY,
      `${feedbackRedacted}\n${redaction.redacted.slice(0, 3000)}`,
      { matchCount: 6 },
    );
    if (!legal.hasMatches) {
      const { legalVerificationUnavailableResponse } = await import("../_shared/legal-gate.ts");
      return legalVerificationUnavailableResponse({
        headers: { ...corsHeaders, ...correlationHeaders(correlationId) },
      });
    }
    const baseSystem = `${rawSystem}\n\n${legal.promptBlock}`;

    // ТАКСУВАНЕ: след всички непарични проверки. Идемпотентно по batch_id.
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: batchCharge, error: batchErr } = await userClient.rpc(
      "charge_corrections_wave",
      { p_user_id: userId, p_batch_id: batchId, p_count: 1 },
    );
    if (batchErr) {
      console.error("charge_corrections_wave error:", batchErr);
      return new Response(JSON.stringify({ error: "Грешка при проверка на квотата" }), {
        status: 500, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" },
      });
    }
    const batchResult = batchCharge as { ok: boolean; reason?: string; cached?: boolean };
    if (!batchResult?.ok) {
      return new Response(
        JSON.stringify({ error: "quota_exceeded", reason: batchResult?.reason }),
        { status: 402, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } },
      );
    }
    const batchCharged = !batchResult.cached;

    // ЕДИНСТВЕН ВЪЗСТАНОВЯВАЩ ПАЗИТЕЛ: изпълнява се най-много веднъж при всеки
    // неуспешен краен изход след таксуване.
    let refunded = false;
    const refundOnce = async () => {
      if (!batchCharged || refunded) return;
      refunded = true;
      await admin.rpc("refund_quota", { _user_id: userId, _kind: "analysis", _used_bonus: false });
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
      await refundOnce();
      await logAiAudit({
        user_id: userId, operation: "refine-contract", model: route.model,
        classification, redaction_applied: route.redactionRequired,
        status: "error", error_code: `http_${aiResp.status}`,
      });
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Достигнат е лимитът. Опитайте по-късно." }), { status: 429, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } });
      if (aiResp.status === 402) return new Response(JSON.stringify({ error: "Изчерпани са кредитите за AI." }), { status: 402, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } });
      const t = await aiResp.text();
      console.error("AI gateway:", aiResp.status, t);
      throw new Error("AI грешка");
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

    await logAiAudit({
      user_id: userId, operation: "refine-contract", model: route.model,
      classification, redaction_applied: route.redactionRequired,
      status: "ok",
      tokens_in: raw?.usage?.prompt_tokens,
      tokens_out: raw?.usage?.completion_tokens,
    });

    return new Response(JSON.stringify({
      contract: parsed.contract,
      changed_clause_numbers: parsed.changed_clause_numbers ?? [],
      change_summary: parsed.change_summary ?? "",
    }), {
      headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" },
    });
  } catch (e) {

    console.error(`refine-contract error [cid=${correlationId}]:`, e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Неизвестна грешка", correlation_id: correlationId }), {
      status: 500, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" },
    });
  }
});
