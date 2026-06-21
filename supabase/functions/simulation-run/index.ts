// AI Self-training simulation runner.
// Pits the real DogovaryAI (active prompt + tools) against an AI-Lawyer that
// generates user messages, judges responses, and proposes prompt patches.
// Streams progress to the admin UI via SSE; persists turns and patches to DB.

import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCors } from "../_shared/cors.ts";
import { loadActivePromptMeta } from "../_shared/prompt-loader.ts";
import { toolSchemasFor, FULL_TOOL_NAMES, isServerTool, execSearchTemplates } from "../_shared/assistant-tools.ts";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface RunBody {
  scenario?: string;
  scenarioId?: string;
  lawyerModel?: string;
  dogovaryModel?: string;
  maxTurns?: number;
  withTools?: boolean;
  resumeSessionId?: string;
}

const RUBRIC_DIMENSIONS = [
  "legal_accuracy",
  "tool_usage",
  "canon_compliance",
  "clarity",
  "usefulness",
] as const;
type RubricKey = typeof RUBRIC_DIMENSIONS[number];

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

async function callGateway(apiKey: string, body: Record<string, unknown>) {
  const resp = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "edge-function",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`gateway ${resp.status}: ${text.slice(0, 300)}`);
  }
  return await resp.json();
}

function tryParseJson(text: string): any | null {
  if (!text) return null;
  // Strip ```json fences
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(cleaned); } catch { /* fallthrough */ }
  // Try to find first {...}
  const m = cleaned.match(/\{[\s\S]*\}$/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* ignore */ } }
  return null;
}

const LAWYER_GENERATOR_PROMPT = `Ти си опитен български адвокат, който тества AI асистент за договорно право (Dogovori.net).
Играй ролята на РЕАЛЕН потребител на платформата — предприемач, HR, наемодател, физическо лице.
Генерирай ЕДНО потребителско съобщение на български, което реалистично би влязло в чата.
Включвай разнообразие: непълни данни, нестандартни сценарии, опит да изтръгнеш индивидуален съвет, грешни предпоставки, искания за неприложимо чуждо право.
Фокус: открий слабостите на AI асистента.

Върни САМО самото съобщение (без обяснения, без кавички, без префикси).`;

function lawyerJudgePrompt(systemPrompt: string, availableSectionKeys: string[]) {
  return `Ти си senior български адвокат — рецензент на отговор на AI асистент на dogovori.net.

СИСТЕМЕН ПРОМПТ на асистента (за справка):
"""
${systemPrompt.slice(0, 6000)}
"""

Оцени отговора по 5 критерия (всеки 1-10):
- legal_accuracy: правна коректност, цитиране на ЗЗД/ТЗ/КТ/ЗУТ
- tool_usage: правилни tools (search_templates, ask_clarification, navigate, prefill_build_contract, propose_contract_outline) в правилен ред
- canon_compliance: без индивидуален съвет, без чуждо право, спазване на канона
- clarity: език, структура, четимост
- usefulness: помага ли реално на потребителя

Налични секции от промпта за патчване: ${availableSectionKeys.join(", ") || "(няма)"}.

Върни СТРОГО JSON:
{
  "scores": {
    "legal_accuracy": <1-10>,
    "tool_usage": <1-10>,
    "canon_compliance": <1-10>,
    "clarity": <1-10>,
    "usefulness": <1-10>
  },
  "verdict": "<кратък markdown анализ, 3-6 изречения, фокусиран върху най-слабото измерение>",
  "issues": [
    { "section_key": "<един от availableSectionKeys или нов snake_case>", "finding": "<какво е сгрешено>", "severity": "low|medium|high", "dimension": "<едно от 5-те измерения>" }
  ]
}

Без коментари извън JSON.`;
}

function lawyerPatcherPrompt(systemPrompt: string, sections: Array<{key: string; title: string; content: string}>, turnsSummary: string) {
  return `Ти си senior български правен инженер на промптове за AI асистент.
Анализирай резултатите от симулация и предложи конкретни патчове по секции от системния промпт.

ТЕКУЩ СИСТЕМЕН ПРОМПТ (по секции):
${sections.map((s) => `\n--- секция: ${s.key} (${s.title}) ---\n${s.content.slice(0, 2000)}`).join("\n")}

РЕЗУЛТАТИ ОТ СИМУЛАЦИЯТА:
${turnsSummary.slice(0, 8000)}

Върни СТРОГО JSON масив с patch-предложения (0 до 5 елемента):
[
  {
    "section_key": "<точно име на съществуваща секция от списъка по-горе ИЛИ нов smaller_snake_case ключ>",
    "section_title": "<заглавие; ако е нова секция — кратко на български>",
    "patch_description": "<какво подобрява и защо, 1-2 изречения>",
    "patch_content": "<пълно ново съдържание на секцията — markdown текст>"
  }
]

Принципи:
- Промените трябва да адресират конкретни грешки от симулацията.
- Запази стила и тона на съществуващите секции.
- НЕ повтаряй съществуващия текст дословно; редактирай или допълвай.
- Само JSON, без markdown ограждане.`;
}

async function runDogovaryTurn(
  apiKey: string,
  sb: ReturnType<typeof admin>,
  systemPrompt: string,
  model: string,
  history: Array<{role: string; content: string}>,
  withTools: boolean,
): Promise<{ text: string; tools: Array<{name: string; args: any}> }> {
  const tools = withTools ? toolSchemasFor(FULL_TOOL_NAMES) : undefined;
  const collectedTools: Array<{name: string; args: any}> = [];
  const messages: any[] = [
    { role: "system", content: systemPrompt },
    ...history,
  ];

  for (let iter = 0; iter < 4; iter++) {
    const body: Record<string, unknown> = { model, messages };
    if (tools) body.tools = tools;
    const resp = await callGateway(apiKey, body);
    const choice = resp.choices?.[0];
    const msg = choice?.message;
    if (!msg) return { text: "", tools: collectedTools };

    const toolCalls = msg.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return { text: String(msg.content ?? ""), tools: collectedTools };
    }

    // Record all tool calls
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: toolCalls });

    let anyClient = false;
    for (const tc of toolCalls) {
      const name = tc.function?.name;
      let args: any = {};
      try { args = JSON.parse(tc.function?.arguments ?? "{}"); } catch { /* ignore */ }
      collectedTools.push({ name, args });

      if (isServerTool(name)) {
        let result: any = { error: "unknown_tool" };
        try {
          if (name === "search_templates") {
            result = await execSearchTemplates(sb, args);
          }
        } catch (e) {
          result = { error: (e as Error).message };
        }
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result).slice(0, 4000),
        });
      } else {
        anyClient = true;
        // Acknowledge client tool result (simulated — not executed)
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ simulated: true, note: "Client tool would execute in browser" }),
        });
      }
    }
    // If only client tools and no further content needed, exit
    if (anyClient && !toolCalls.some((tc: any) => isServerTool(tc.function?.name))) {
      // Give the model one more turn to produce text
      continue;
    }
  }

  return { text: "", tools: collectedTools };
}

Deno.serve(async (req) => {
  const cors = buildCors(req, "POST, OPTIONS");
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "missing_api_key" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const sb = admin();
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const { data: staffData } = await sb.rpc("is_staff", { _user_id: uid });
    if (!staffData) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as RunBody;
    const resumeSessionId = body.resumeSessionId?.trim() || null;

    // Load active prompt + sections (always needed)
    const meta = await loadActivePromptMeta(sb, "assistant-chat", "");

    let sessionId: string;
    let scenario: string;
    let maxTurns: number;
    let lawyerModel: string;
    let dogovaryModel: string;
    let withTools: boolean;
    let startIndex = 0;
    let priorTurns: Array<{ turn_index: number; user_message: string; dogovary_response: string; score: number; lawyer_verdict: string; issues: any }> = [];

    if (resumeSessionId) {
      const { data: existing, error: exErr } = await sb
        .from("ai_simulation_sessions")
        .select("*")
        .eq("id", resumeSessionId)
        .maybeSingle();
      if (exErr || !existing) {
        return new Response(JSON.stringify({ error: "session_not_found" }), {
          status: 404, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      if (existing.created_by !== uid) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      sessionId = existing.id;
      scenario = (existing.scenario ?? "").toString();
      maxTurns = Math.max(1, Math.min(20, Number(body.maxTurns) || existing.max_turns || 5));
      lawyerModel = existing.lawyer_model || body.lawyerModel || "google/gemini-2.5-pro";
      dogovaryModel = body.dogovaryModel || meta.model || "google/gemini-3-flash-preview";
      withTools = body.withTools !== false;

      const { data: turnsRows } = await sb
        .from("ai_simulation_turns")
        .select("turn_index, user_message, dogovary_response, score, lawyer_verdict, issues")
        .eq("session_id", sessionId)
        .order("turn_index", { ascending: true });
      priorTurns = (turnsRows ?? []) as any;
      startIndex = priorTurns.length;

      if (startIndex >= maxTurns) {
        return new Response(JSON.stringify({ error: "already_complete", turns: startIndex, maxTurns }), {
          status: 409, headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      await sb.from("ai_simulation_sessions").update({
        status: "running",
        max_turns: maxTurns,
        error_message: null,
        completed_at: null,
      }).eq("id", sessionId);
    } else {
      scenario = (body.scenario ?? "").trim().slice(0, 1000);
      maxTurns = Math.max(1, Math.min(20, Number(body.maxTurns) || 5));
      lawyerModel = body.lawyerModel || "google/gemini-2.5-pro";
      dogovaryModel = body.dogovaryModel || meta.model || "google/gemini-3-flash-preview";
      withTools = body.withTools !== false;

      const { data: session, error: sessErr } = await sb
        .from("ai_simulation_sessions")
        .insert({
          created_by: uid,
          function_name: "assistant-chat",
          prompt_version_id: null,
          scenario: scenario || null,
          lawyer_model: lawyerModel,
          dogovary_model: dogovaryModel,
          max_turns: maxTurns,
          status: "running",
        })
        .select("id")
        .single();
      if (sessErr || !session) {
        return new Response(JSON.stringify({ error: sessErr?.message ?? "session_create_failed" }), {
          status: 500, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      sessionId = session.id as string;
    }

    // Re-load prompt version id + sections after session is set
    const { data: promptRow } = await sb
      .from("ai_prompts")
      .select("id")
      .eq("function_name", "assistant-chat")
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: sectionRows } = await sb
      .from("ai_prompt_sections")
      .select("section_key, title, content, enabled")
      .eq("prompt_id", promptRow?.id ?? "00000000-0000-0000-0000-000000000000")
      .order("order_idx", { ascending: true });

    const sections = (sectionRows ?? []).map((s: any) => ({
      key: s.section_key as string,
      title: (s.title ?? "") as string,
      content: (s.content ?? "") as string,
      enabled: s.enabled as boolean,
    }));
    const sectionKeys = sections.filter((s) => s.enabled).map((s) => s.key);

    if (!resumeSessionId && promptRow?.id) {
      await sb.from("ai_simulation_sessions").update({ prompt_version_id: promptRow.id }).eq("id", sessionId);
    }

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const send = (event: string, data: any) => {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        try {
          send("session", { sessionId, scenario, lawyerModel, dogovaryModel, maxTurns, resumed: Boolean(resumeSessionId), startIndex });

          const dogovaryHistory: Array<{role: string; content: string}> = [];
          const lawyerHistory: Array<{role: string; content: string}> = [];
          const turnSummaries: string[] = [];
          const scores: number[] = [];

          // Rehydrate from prior turns (resume mode)
          for (const t of priorTurns) {
            dogovaryHistory.push({ role: "user", content: t.user_message });
            dogovaryHistory.push({ role: "assistant", content: t.dogovary_response });
            lawyerHistory.push({ role: "assistant", content: t.user_message });
            lawyerHistory.push({ role: "user", content: `Asst отговори (score ${t.score}/10): ${(t.dogovary_response ?? "").slice(0, 500)}` });
            scores.push(t.score);
            turnSummaries.push(`### Ход ${t.turn_index + 1} — score ${t.score}/10\nПотребител: ${t.user_message}\nAsst: ${(t.dogovary_response ?? "").slice(0, 800)}\nВерсия на адвоката: ${t.lawyer_verdict ?? ""}\nПроблеми: ${JSON.stringify(t.issues ?? [])}`);
            send("turn_done", { turn: t.turn_index, score: t.score, verdict: t.lawyer_verdict, issues: t.issues, replay: true });
          }

          for (let i = startIndex; i < maxTurns; i++) {
            send("phase", { turn: i, phase: "generating_user_message" });


            // 1. Lawyer generates user message
            const genMsgs: any[] = [
              { role: "system", content: LAWYER_GENERATOR_PROMPT + (scenario ? `\n\nСЦЕНАРИЙ: ${scenario}` : "") },
              ...lawyerHistory,
              { role: "user", content: i === 0
                ? "Започни симулацията — генерирай първото потребителско съобщение."
                : "Продължи симулацията — генерирай следващото потребителско съобщение, което тества друг аспект." },
            ];
            const genResp = await callGateway(apiKey, { model: lawyerModel, messages: genMsgs, temperature: 0.9 });
            const userMessage = String(genResp.choices?.[0]?.message?.content ?? "").trim().slice(0, 4000);
            if (!userMessage) throw new Error("lawyer_generator_empty");
            send("user_message", { turn: i, text: userMessage });

            // 2. DogovaryAI responds
            send("phase", { turn: i, phase: "dogovary_responding" });
            dogovaryHistory.push({ role: "user", content: userMessage });
            const dogResp = await runDogovaryTurn(apiKey, sb, meta.content || "", dogovaryModel, dogovaryHistory, withTools);
            const dogText = dogResp.text || "(няма текстов отговор — само tool calls)";
            dogovaryHistory.push({ role: "assistant", content: dogText });
            send("dogovary_response", { turn: i, text: dogText, tools: dogResp.tools });

            // 3. Lawyer judges
            send("phase", { turn: i, phase: "judging" });
            const judgeMsgs: any[] = [
              { role: "system", content: lawyerJudgePrompt(meta.content || "", sectionKeys) },
              { role: "user", content: `ПОТРЕБИТЕЛСКО СЪОБЩЕНИЕ:\n${userMessage}\n\nОТГОВОР НА ASSISTANT:\n${dogText}\n\nИзползвани tools: ${JSON.stringify(dogResp.tools)}` },
            ];
            const judgeResp = await callGateway(apiKey, {
              model: lawyerModel,
              messages: judgeMsgs,
              temperature: 0.2,
              response_format: { type: "json_object" },
            });
            const judgeText = String(judgeResp.choices?.[0]?.message?.content ?? "");
            const parsed = tryParseJson(judgeText) ?? { score: 5, verdict: judgeText.slice(0, 1000), issues: [] };
            const score = Math.max(1, Math.min(10, parseInt(parsed.score, 10) || 5));
            const verdict = String(parsed.verdict ?? "").slice(0, 4000);
            const issues = Array.isArray(parsed.issues) ? parsed.issues.slice(0, 10) : [];
            scores.push(score);

            // Add to lawyer history (short — to keep context tight)
            lawyerHistory.push({ role: "assistant", content: userMessage });
            lawyerHistory.push({ role: "user", content: `Asst отговори (score ${score}/10): ${dogText.slice(0, 500)}` });

            // Persist turn
            await sb.from("ai_simulation_turns").insert({
              session_id: sessionId,
              turn_index: i,
              user_message: userMessage,
              dogovary_response: dogText,
              dogovary_tools: dogResp.tools,
              lawyer_verdict: verdict,
              score,
              issues,
            });
            turnSummaries.push(`### Ход ${i + 1} — score ${score}/10\nПотребител: ${userMessage}\nAsst: ${dogText.slice(0, 800)}\nВерсия на адвоката: ${verdict}\nПроблеми: ${JSON.stringify(issues)}`);

            send("turn_done", { turn: i, score, verdict, issues });

            await sb.from("ai_simulation_sessions").update({ turn_count: i + 1 }).eq("id", sessionId);
          }

          // 4. Patcher
          send("phase", { turn: -1, phase: "generating_patches" });
          const patchMsgs: any[] = [
            { role: "system", content: lawyerPatcherPrompt(meta.content || "", sections.filter((s) => s.enabled), turnSummaries.join("\n\n")) },
            { role: "user", content: "Върни JSON масив с патчове." },
          ];
          const patchResp = await callGateway(apiKey, {
            model: lawyerModel,
            messages: patchMsgs,
            temperature: 0.3,
          });
          const patchText = String(patchResp.choices?.[0]?.message?.content ?? "");
          const patchArr = tryParseJson(patchText);
          let patches: any[] = [];
          if (Array.isArray(patchArr)) patches = patchArr;
          else if (patchArr && Array.isArray(patchArr.patches)) patches = patchArr.patches;
          patches = patches.slice(0, 8);

          let patchCount = 0;
          for (const p of patches) {
            const sectionKey = String(p.section_key ?? "").trim().slice(0, 80);
            const patchContent = String(p.patch_content ?? "").trim();
            if (!sectionKey || !patchContent) continue;
            const existing = sections.find((s) => s.key === sectionKey);
            await sb.from("ai_simulation_patches").insert({
              session_id: sessionId,
              section_key: sectionKey,
              section_title: String(p.section_title ?? existing?.title ?? "").slice(0, 200),
              patch_description: String(p.patch_description ?? "").slice(0, 1000),
              patch_content: patchContent,
              current_content: existing?.content ?? null,
              status: "pending",
            });
            patchCount++;
          }

          const avg = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null;
          await sb.from("ai_simulation_sessions").update({
            status: "completed",
            avg_score: avg,
            completed_at: new Date().toISOString(),
          }).eq("id", sessionId);

          send("done", { sessionId, patchCount, avgScore: avg });
          controller.close();
        } catch (e) {
          const msg = (e as Error).message ?? "unknown";
          await sb.from("ai_simulation_sessions").update({
            status: "failed",
            error_message: msg.slice(0, 1000),
            completed_at: new Date().toISOString(),
          }).eq("id", sessionId);
          try { send("error", { message: msg }); } catch { /* closed */ }
          try { controller.close(); } catch { /* closed */ }
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...cors,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
