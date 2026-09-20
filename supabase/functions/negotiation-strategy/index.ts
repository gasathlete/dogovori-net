// Entrepreneur-tier feature: AI-generated negotiation strategy for a risk
// analysis. Returns positions, BATNA, talking points and proposed counter
// clauses. Persists to risk_analyses.negotiation_strategy for reuse.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCors } from "../_shared/cors.ts";
import { extractJson } from "../_shared/json.ts";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface ReqBody {
  analysis_id?: string;
  force?: boolean;
}

Deno.serve(async (req) => {
  const cors = buildCors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ai_misconfigured" }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(supaUrl, anon, {
      global: { headers: { Authorization: auth } },
    });
    const admin = createClient(supaUrl, service, { auth: { persistSession: false } });

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "auth_required" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const analysisId = body.analysis_id;
    if (!analysisId) {
      return new Response(JSON.stringify({ error: "analysis_id_required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Gate: Entrepreneur plan required (price_id entrepreneur_monthly|yearly)
    const { data: sub } = await admin
      .from("subscriptions")
      .select("price_id, status")
      .eq("user_id", user.id)
      .in("status", ["active", "trialing", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const priceId = (sub as { price_id?: string } | null)?.price_id ?? "";
    const isEntrepreneur =
      priceId === "entrepreneur_monthly" || priceId === "entrepreneur_yearly";
    if (!isEntrepreneur) {
      return new Response(
        JSON.stringify({ error: "entrepreneur_required" }),
        { status: 402, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // Load analysis + contract text
    const { data: a, error: aErr } = await admin
      .from("risk_analyses")
      .select("id, user_id, contract_type, summary, issues, missing_clauses, uploaded_contract_id, negotiation_strategy")
      .eq("id", analysisId)
      .maybeSingle();
    if (aErr || !a) {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if ((a as any).user_id !== user.id) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    // СТАР КЕШ НЕ СЕ ПОДНАСЯ: съществуващите записи в negotiation_strategy са
    // създадени без сървърно доказуем правен манифест и не могат да бъдат
    // проверени отново спрямо текущите версии на източниците.

    let contractText = "";
    if ((a as any).uploaded_contract_id) {
      const { data: u } = await admin
        .from("uploaded_contracts")
        .select("text_content")
        .eq("id", (a as any).uploaded_contract_id)
        .maybeSingle();
      contractText = ((u as any)?.text_content ?? "").slice(0, 12000);
    }


    const sys = `Ти си опитен правен стратег за преговори по български договори. Връщаш САМО валиден JSON със следната структура:
{
 "summary": string,                       // 1-2 изречения с цялостната стратегия
 "leverage_points": [{"title": string, "rationale": string}],  // 3-5 силни позиции на клиента
 "concessions": [{"title": string, "rationale": string}],      // 2-4 неща, които може да отстъпи
 "batna": string,                         // най-добра алтернатива при неуспех
 "talking_points": [string],              // 5-8 готови фрази за писмо/среща
 "counter_clauses": [{"clause": string, "proposal": string, "why": string}], // 3-6 контрапредложения
 "next_steps": [string]                   // 3-5 действия с приоритет
}
Пиши на български, конкретно и приложимо. Без markdown, без обяснения извън JSON.`;

    const issuesStr = JSON.stringify((a as any).issues ?? []).slice(0, 4000);
    const missingStr = JSON.stringify((a as any).missing_clauses ?? []).slice(0, 2000);
    const rawCorpus = `Тип договор: ${(a as any).contract_type || "—"}
Резюме на анализа: ${(a as any).summary || "—"}
Открити проблеми: ${issuesStr}
Липсващи клаузи: ${missingStr}
${contractText ? `\n--- ТЕКСТ НА ДОГОВОРА (откъс) ---\n${contractText}` : ""}`;

    // КЛАСИФИКАЦИЯ + РЕДАКЦИЯ на ЦЯЛОТО изходящо съдържание преди всяка
    // външна заявка (включително извличането на правния контекст).
    const classification = classifyDocumentBeforeAI(rawCorpus);
    if (classification.risk_level === "blocked") {
      return new Response(
        JSON.stringify({ error: "content_blocked", code: "content_blocked", charged: false }),
        { status: 422, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }
    const redaction = redactForAI(rawCorpus);
    const userMsg = redaction.redacted;

    // СТРОГО ЗАЗЕМЯВАНЕ за точно тази (редактирана) заявка — преди модела.
    const { retrieveLegalContext } = await import("../_shared/legal-rag.ts");
    const legal = await retrieveLegalContext(admin, apiKey, userMsg.slice(0, 4000), {
      matchCount: 6,
    });
    if (!legal.hasMatches) {
      const { legalVerificationUnavailableResponse } = await import("../_shared/legal-gate.ts");
      return legalVerificationUnavailableResponse({ headers: cors });
    }


    const callModel = async (model: string) => {
      const r = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: sys },
            { role: "user", content: userMsg },
          ],
          max_tokens: 4000,
          response_format: { type: "json_object" },
        }),
      });
      return r;
    };

    let resp = await callModel("openai/gpt-5");
    let usedModel = "openai/gpt-5";
    if (!resp.ok && (resp.status === 429 || resp.status >= 500)) {
      resp = await callModel("google/gemini-2.5-pro");
      usedModel = "google/gemini-2.5-pro";
    }
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      return new Response(
        JSON.stringify({ error: "ai_failed", status: resp.status, detail: t.slice(0, 200) }),
        { status: 502, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }
    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content ?? "";
    const strategy = extractJson(raw, { fn: "negotiation-strategy" });
    if (!strategy || typeof strategy !== "object") {
      return new Response(JSON.stringify({ error: "parse_failed" }), {
        status: 502,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    await admin
      .from("risk_analyses")
      .update({
        negotiation_strategy: strategy,
        negotiation_generated_at: new Date().toISOString(),
      })
      .eq("id", analysisId);

    return new Response(
      JSON.stringify({ ok: true, cached: false, model: usedModel, strategy }),
      { headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("negotiation-strategy error:", e);
    return new Response(JSON.stringify({ error: "internal" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
