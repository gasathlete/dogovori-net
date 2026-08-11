// Mini-regression for a draft prompt against N scenarios from the bank.
// Runs DogovaryAI (with the DRAFT prompt) + Lawyer judge for each scenario,
// returns avg breakdown + pass/fail relative to baseline.

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCors } from "../_shared/cors.ts";
import { extractJson } from "../_shared/json.ts";
import { toolSchemasFor, FULL_TOOL_NAMES, isServerTool, execSearchTemplates } from "../_shared/assistant-tools.ts";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const RUBRIC_DIMENSIONS = ["legal_accuracy", "tool_usage", "canon_compliance", "clarity", "usefulness"] as const;

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}

async function gw(apiKey: string, body: Record<string, unknown>) {
  const r = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "edge-function" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`gateway ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return await r.json();
}

function tryJson(t: string): any | null {
  if (!t) return null;
  // Shared tolerant parser (fences, control chars, truncated-mid-string output).
  try { return extractJson(t); } catch { return null; }
}

async function runBot(apiKey: string, sb: any, systemPrompt: string, model: string, userMsg: string) {
  const tools = toolSchemasFor(FULL_TOOL_NAMES);
  const messages: any[] = [{ role: "system", content: systemPrompt }, { role: "user", content: userMsg }];
  const collectedTools: any[] = [];
  for (let it = 0; it < 3; it++) {
    const resp = await gw(apiKey, { model, messages, tools });
    const msg = resp.choices?.[0]?.message;
    if (!msg) return { text: "", tools: collectedTools };
    const tcs = msg.tool_calls ?? [];
    if (tcs.length === 0) return { text: String(msg.content ?? ""), tools: collectedTools };
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: tcs });
    for (const tc of tcs) {
      const name = tc.function?.name;
      let args: any = {};
      args = tryJson(tc.function?.arguments ?? "{}") ?? {};
      collectedTools.push({ name, args });
      let result: any = { simulated: true };
      if (isServerTool(name)) {
        try { if (name === "search_templates") result = await execSearchTemplates(sb, args); }
        catch (e) { result = { error: (e as Error).message }; }
      }
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 4000) });
    }
  }
  return { text: "", tools: collectedTools };
}

Deno.serve(async (req) => {
  const cors = buildCors(req, "POST, OPTIONS");
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return new Response(JSON.stringify({ error: "missing_api_key" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const sb = admin();
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    const { data: staffData } = await sb.rpc("is_staff", { _user_id: uid });
    if (!staffData) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });

    const body = await req.json() as {
      candidatePromptId: string;
      baselinePromptId?: string;
      scenarioIds?: string[];
      sampleSize?: number;
      lawyerModel?: string;
      dogovaryModel?: string;
      thresholdDelta?: number;
    };

    const lawyerModel = body.lawyerModel || "google/gemini-2.5-pro";
    const dogovaryModel = body.dogovaryModel || "google/gemini-3-flash-preview";
    const thresholdDelta = typeof body.thresholdDelta === "number" ? body.thresholdDelta : -0.5;

    // Assemble candidate prompt
    const { data: candSecs } = await sb
      .from("ai_prompt_sections")
      .select("title, content, order_idx, enabled")
      .eq("prompt_id", body.candidatePromptId)
      .eq("enabled", true)
      .order("order_idx", { ascending: true });
    const candidatePrompt = (candSecs ?? []).map((s: any) => s.title ? `# ${s.title}\n${s.content}` : s.content).join("\n\n");
    if (!candidatePrompt) return new Response(JSON.stringify({ error: "empty_candidate_prompt" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

    // Baseline prompt (active or supplied)
    let baselinePromptId = body.baselinePromptId;
    if (!baselinePromptId) {
      const { data: activeRow } = await sb
        .from("ai_prompts")
        .select("id")
        .eq("function_name", "assistant-chat")
        .eq("is_active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      baselinePromptId = activeRow?.id;
    }
    let baselinePrompt = "";
    if (baselinePromptId) {
      const { data: baseSecs } = await sb
        .from("ai_prompt_sections")
        .select("title, content, order_idx, enabled")
        .eq("prompt_id", baselinePromptId)
        .eq("enabled", true)
        .order("order_idx", { ascending: true });
      baselinePrompt = (baseSecs ?? []).map((s: any) => s.title ? `# ${s.title}\n${s.content}` : s.content).join("\n\n");
    }

    // Scenarios
    let scenarios: any[] = [];
    if (body.scenarioIds && body.scenarioIds.length > 0) {
      const { data } = await sb.from("ai_simulation_scenarios").select("id, title, scenario_text, expected_behavior").in("id", body.scenarioIds);
      scenarios = data ?? [];
    } else {
      const n = Math.max(1, Math.min(10, body.sampleSize || 3));
      const { data } = await sb.from("ai_simulation_scenarios").select("id, title, scenario_text, expected_behavior").eq("active", true).limit(n);
      scenarios = data ?? [];
    }
    if (scenarios.length === 0) return new Response(JSON.stringify({ error: "no_scenarios" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

    const judgeOne = async (systemPrompt: string, userMsg: string, botText: string, tools: any[]) => {
      const judgeMsgs = [
        { role: "system", content: `Ти си senior български адвокат — рецензент. Оцени отговора по 5 критерия (1-10): ${RUBRIC_DIMENSIONS.join(", ")}. Върни JSON: {"scores":{"legal_accuracy":N,"tool_usage":N,"canon_compliance":N,"clarity":N,"usefulness":N}}.\n\nСИСТЕМЕН ПРОМПТ: """${systemPrompt.slice(0, 4000)}"""` },
        { role: "user", content: `Потребител: ${userMsg}\n\nОтговор: ${botText}\n\nTools: ${JSON.stringify(tools)}` },
      ];
      const r = await gw(apiKey, { model: lawyerModel, messages: judgeMsgs, temperature: 0.2, response_format: { type: "json_object" } });
      const parsed = tryJson(String(r.choices?.[0]?.message?.content ?? "")) ?? {};
      const sc = parsed.scores ?? {};
      const out: Record<string, number> = {};
      for (const d of RUBRIC_DIMENSIONS) out[d] = Math.max(1, Math.min(10, parseInt(sc[d], 10) || 5));
      return out;
    };

    const runSide = async (systemPrompt: string) => {
      const breakdowns: Record<string, number>[] = [];
      const details: any[] = [];
      for (const sc of scenarios) {
        const userMsg = sc.scenario_text + (sc.expected_behavior ? `\n[ожидано: ${sc.expected_behavior}]` : "");
        const botResp = await runBot(apiKey, sb, systemPrompt, dogovaryModel, userMsg);
        const breakdown = await judgeOne(systemPrompt, userMsg, botResp.text || "(няма)", botResp.tools);
        breakdowns.push(breakdown);
        details.push({ scenarioId: sc.id, title: sc.title, breakdown, botText: (botResp.text || "").slice(0, 500) });
      }
      const avg: Record<string, number> = {};
      for (const d of RUBRIC_DIMENSIONS) {
        avg[d] = Math.round((breakdowns.reduce((a, b) => a + b[d], 0) / breakdowns.length) * 100) / 100;
      }
      const overall = Math.round((Object.values(avg).reduce((a, b) => a + b, 0) / RUBRIC_DIMENSIONS.length) * 100) / 100;
      return { avg, overall, details };
    };

    const candidate = await runSide(candidatePrompt);
    const baseline = baselinePrompt ? await runSide(baselinePrompt) : null;

    const delta = baseline ? Math.round((candidate.overall - baseline.overall) * 100) / 100 : null;
    const upliftPct = baseline && baseline.overall > 0
      ? Math.round(((candidate.overall - baseline.overall) / baseline.overall) * 1000) / 10
      : null;
    const passed = delta === null ? true : delta >= thresholdDelta;

    // Cost-justification: compare candidate vs baseline model cost using ai_simulation_settings.
    const { data: settings } = await sb
      .from("ai_simulation_settings")
      .select("rubric_min_uplift_pct, max_cost_multiplier, model_prices")
      .eq("id", true)
      .maybeSingle();
    const minUpliftPct = Number((settings as any)?.rubric_min_uplift_pct ?? 15);
    const maxCostMul = Number((settings as any)?.max_cost_multiplier ?? 2);
    const prices = ((settings as any)?.model_prices ?? {}) as Record<string, { in: number; out: number }>;
    const candidateModel = body.dogovaryModel || dogovaryModel;
    const baselineModel = candidateModel; // same model on both sides unless caller overrides
    const cPrice = prices[candidateModel];
    const bPrice = prices[baselineModel];
    const candidateCostPerCall = cPrice ? cPrice.in * 2 + cPrice.out * 1 : null; // proxy: 2k in + 1k out
    const baselineCostPerCall = bPrice ? bPrice.in * 2 + bPrice.out * 1 : null;
    const costMultiplier = candidateCostPerCall && baselineCostPerCall ? +(candidateCostPerCall / baselineCostPerCall).toFixed(2) : 1;
    const upgradeJustified = upliftPct === null
      ? null
      : (upliftPct >= minUpliftPct && costMultiplier <= maxCostMul);

    return new Response(JSON.stringify({
      passed,
      delta,
      uplift_pct: upliftPct,
      threshold: thresholdDelta,
      min_uplift_pct: minUpliftPct,
      max_cost_multiplier: maxCostMul,
      cost_multiplier: costMultiplier,
      candidate_cost_per_call_eur: candidateCostPerCall,
      baseline_cost_per_call_eur: baselineCostPerCall,
      upgrade_justified: upgradeJustified,
      candidate,
      baseline,
      scenariosCount: scenarios.length,
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
