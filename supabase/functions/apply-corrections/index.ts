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
} from "../_shared/generated-document-quality.ts";


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

    const {
      contract,
      risk,
      selectedIssues = [],
      selectedRecommendations = [],
      answers = {},
      session_id: sessionId,
      batch_id: batchId,
      userConfirmed = false,
    } = await req.json();

    if (!contract || (selectedIssues.length === 0 && selectedRecommendations.length === 0)) {
      return new Response(JSON.stringify({ error: "Нищо за коригиране" }), {
        status: 400, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" },
      });
    }

    // Stepped wave charging: 1-5 corrections = 1 op, 6-10 = 2, ... ceil(n/5).
    // Repeated apply with same batch_id returns the cached charge (idempotent).
    // Falls back to a single op when no batch_id is supplied.
    const correctionsCount =
      (Array.isArray(selectedIssues) ? selectedIssues.length : 0) +
      (Array.isArray(selectedRecommendations) ? selectedRecommendations.length : 0);
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: batchCharge, error: batchErr } = await userClient.rpc(
      "charge_corrections_wave",
      { p_user_id: userId, p_batch_id: batchId ?? null, p_count: Math.max(1, correctionsCount) },
    );
    if (batchErr) {
      console.error("charge_corrections_wave error:", batchErr);
      return new Response(JSON.stringify({ error: "Грешка при проверка на квотата" }), {
        status: 500, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" },
      });
    }
    const batchResult = batchCharge as {
      ok: boolean;
      reason?: string;
      ops_charged?: number;
      cached?: boolean;
    };
    if (!batchResult?.ok) {
      return new Response(
        JSON.stringify({ error: "quota_exceeded", reason: batchResult?.reason }),
        { status: 402, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } },
      );
    }
    const batchCharged = !batchResult.cached;


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
      if (batchCharged) {
        await admin.rpc("refund_quota", { _user_id: userId, _kind: "analysis", _used_bonus: false });
      }
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
      if (batchCharged) {
        await admin.rpc("refund_quota", { _user_id: userId, _kind: "analysis", _used_bonus: false });
      }
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
      if (batchCharged) {
        await admin.rpc("refund_quota", { _user_id: userId, _kind: "analysis", _used_bonus: false });
      }
      await logAiAudit({
        user_id: userId, operation: "apply-corrections", model: route.model,
        classification, redaction_applied: route.redactionRequired,
        status: "error", error_code: `http_${aiResp.status}`,
      });
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Достигнат е лимитът. Опитайте по-късно." }), { status: 429, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } });
      if (aiResp.status === 402) return new Response(JSON.stringify({ error: "Изчерпани са кредитите за AI." }), { status: 402, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" } });
      const t = await aiResp.text();
      console.error("AI gateway:", aiResp.status, t);
      throw new Error("AI грешка");
    }

    await admin.from("ai_usage").insert({
      user_id: userId,
      function_name: "apply-corrections",
    });

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
    })).parsed;

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

    // Q4a — коригираният документ носи СВЕЖ risk анализ: минава през същия
    // детерминиран gate, за да не се появят отново недоказани самокритики.
    if ((parsed as Record<string, unknown>)?.risk) {
      const p = parsed as Record<string, unknown>;
      const signingSecret = qualitySigningSecretFromEnv();
      if (!signingSecret) console.error("quality manifest signing key unavailable");
      const qualityManifest = signingSecret ? await buildQualityManifest({
        origin: "apply-corrections",
        signingSecret,
        contract: p.contract,
        decisions: [
          "placeholders_for_personal_data",
          "local_completion_of_personal_data",
          "optional_annex_details",
          "standard_clause_set",
        ],
      }) : null;
      const gated = applyRiskConsistencyGate({
        risk: p.risk,
        documentText: flattenGeneratedContract(p.contract),
        origin: "apply-corrections",
        manifest: qualityManifest,
        trustedManifest: !!qualityManifest,
      });
      p.risk = gated.risk;
      p.quality = gated.quality;
      if (qualityManifest) p.quality_manifest = qualityManifest;
    }

    await logAiAudit({
      user_id: userId, operation: "apply-corrections", model: route.model,
      classification, redaction_applied: route.redactionRequired,
      status: "ok",
      tokens_in: raw?.usage?.prompt_tokens,
      tokens_out: raw?.usage?.completion_tokens,
    });

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(`apply-corrections error [cid=${correlationId}]:`, e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Неизвестна грешка", correlation_id: correlationId }), {
      status: 500, headers: { ...corsHeaders, ...correlationHeaders(correlationId), "Content-Type": "application/json" },
    });
  }
});
