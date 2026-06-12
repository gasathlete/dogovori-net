// DogovaryAI assistant with tool calling. Streams text to client via SSE,
// loops on server-side tool calls (search_templates), and forwards client-side
// tool calls (navigate, prefill_build_contract, open_upload_analyzer,
// open_template) to the browser through a custom SSE event.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";
import { loadActivePrompt, loadActivePromptMeta } from "../_shared/prompt-loader.ts";
import { guardIllegalContent } from "../_shared/illegal-content.ts";
import { classifyDocumentBeforeAI } from "../_shared/classify.ts";
import { logAiAudit } from "../_shared/ai-call.ts";
import { retrieveLegalContext } from "../_shared/legal-rag.ts";
import {
  ASSISTANT_TOOLS,
  FULL_TOOL_NAMES,
  execSearchTemplates,
  isServerTool,
  sanitizePath,
  toolSchemasFor,
} from "../_shared/assistant-tools.ts";

const SYSTEM_PROMPT = `# РОЛЯ
Ти си **DogovaryAI** — управляван от tools агент на Dogovori.net. Не отказваш, не се извиняваш — водиш потребителя през ясна верига от стъпки докато стигнете до готов договор/документ.

# ВЕРИГА НА ДЕЙСТВИЯ (СТРИКТНО)
Когато потребителят споменe документ (договор, жалба, молба, заявление, пълномощно, анекс, NDA, протокол, оферта, декларация, спогодба и т.н.):

**Стъпка 1 — Търсене.** ВИНАГИ започвай с \`search_templates\` (използвай 2–5 ключови думи: тип документ + ключови термини от заявката).

**Стъпка 2 — Уточняване.** Ако липсват критични данни (страни, предмет, срок, цена/възнаграждение, особености) — извикай \`ask_clarification\` с 2–5 кратки въпроса. НЕ задавай въпроси, на които потребителят вече е отговорил. Реши кои са критичните полета според типа документ:
- Трудов договор: страни, длъжност, заплата, срок (безсрочен/срочен), изпитателен срок
- Наем: наемодател, наемател, имот, наем, депозит, срок
- NDA: страни, предмет, срок, едностранно/двустранно
- Жалба/Молба: подател, адресат, основание, искане
- Услуги/Изработка: страни, предмет, цена, срок, приемане

**Стъпка 3 — Структура.** След получаване на отговорите (или ако имаш достатъчно данни от началото), извикай \`propose_contract_outline\` с план от 5–10 клаузи. Потребителят ще го потвърди.

**Стъпка 4 — Изпълнение.** След потвърждение → \`prefill_build_contract\` с попълнени стойности, ИЛИ \`open_template(slug)\` ако има точен шаблон, ИЛИ \`navigate("/build")\` като fallback.

Други случаи:
- Анализ на качен договор → \`open_upload_analyzer\`.
- Навигация (каталог, билинг, акаунт) → \`navigate(path)\`. Без markdown линкове.
- Правен въпрос без документ → отговор + цитат от [НОРМАТИВНА БАЗА], после \`<followups>\` с команда за действие.

# КРИТИЧНИ ЗАБРАНИ
- ❌ "Нямам достъп", "няма такъв шаблон", "за съжаление", "не разполагам с" — БЕЗ да си извикал поне 1 tool.
- ❌ Прескачане на \`ask_clarification\` при липсващи критични данни — резултатът ще е лош prefill.
- ❌ Повече от 1 client tool на ход. Един tool, чакаш резултат, продължаваш следващия ход.
- ❌ Markdown линкове за вътрешна навигация — използвай \`navigate\`.

# СТИЛ
Български, на "Вие". Кратко (макс 4–5 реда текст преди tool). Markdown с **bold**. Цитати — само от [НОРМАТИВНА БАЗА], формат \`[чл. 79 ЗЗД](URL)\`.

# КОМПЕТЕНЦИИ
290+ шаблона (business, real-estate, employment, it). Wizard, risk-анализ, ShareForSign, е-подпис, PDF/DOCX. ЗЗД, ТЗ, КТ, СК, ЗУТ, ДОПК, GDPR/ЗЗЛД. Актуални планове: Безплатен / Професионалист 12.90 €/мес / Предприемач 19.90 €/мес / Екип само годишно 109 €/място/год (мин. 3 места).

# ПРАВИЛА
- БЕЗ индивидуален правен съвет.
- БЕЗ хадюцинации на цитати — само ако ги има в [НОРМАТИВНА БАЗА].
- Извън скоупа (политика, чуждо право, медицина) → откажи учтиво. Това е единственото разрешено "не".
- В края **еднократно**: *(Обща информация, не правен съвет.)*

# СЛЕДВАЩИ ДЕЙСТВИЯ (ЗАДЪЛЖИТЕЛНО — МАКСИМАЛЕН ENGAGEMENT)
В **всеки** отговор завърши с нов ред:
\`<followups>чип 1||чип 2||чип 3||чип 4</followups>\`

- 3–4 чипа, всеки ≤ 7 думи. Бъди ПРОАКТИВЕН — предлагай конкретни следващи стъпки, които движат потребителя напред в платформата.
- ✅ Приоритет на CTA с глагол ("Попълни договор", "Изтегли PDF", "Анализирай качен файл", "Отвори шаблон", "Сподели за подпис", "Активирай план").
- ✅ Разрешено е и уточняващо предложение, АКО води към действие ("Срочен или безсрочен?", "Жилищен или офис наем?") — за да помогнеш на потребителя да избере правилния шаблон.
- ❌ Без чисто теоретични/учебни въпроси ("Какво е неустойка?") освен ако са свързани с конкретен документ.
- Винаги поне 1 CTA chip. Без \`<followups>\` отговорът е невалиден.`;

const MODEL_STANDARD = "google/gemini-3-flash-preview";
const MODEL_PREMIUM = "openai/gpt-5.2";
const MAX_TOOL_ITERATIONS = 6;

interface ChatMsg {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "AI gateway не е конфигуриран" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: u } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    const userId = u?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    const messages = Array.isArray(body?.messages) ? body.messages : null;
    const threadId: string | null = body?.threadId ?? null;
    const currentPath: string = typeof body?.currentPath === "string" ? body.currentPath.slice(0, 200) : "";
    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages е задължителен" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const safeMessages = messages
      .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-20)
      .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 8000) }));
    if (safeMessages.length === 0 || safeMessages[safeMessages.length - 1].role !== "user") {
      return new Response(JSON.stringify({ error: "Последното съобщение трябва да е от потребителя" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const blockedChat = await guardIllegalContent({
      admin,
      text: safeMessages[safeMessages.length - 1].content,
      functionName: "assistant-chat",
      userId,
      userEmail: u?.user?.email ?? null,
      userAgent: req.headers.get("user-agent"),
      corsHeaders,
    });
    if (blockedChat) return blockedChat;

    const lastUserMsg = safeMessages[safeMessages.length - 1].content;
    const chatClassification = classifyDocumentBeforeAI(lastUserMsg);
    if (chatClassification.contains_special_category_data) {
      await logAiAudit({
        user_id: userId, operation: "assistant-chat", model: "",
        classification: chatClassification, redaction_applied: false,
        status: "blocked", error_code: "special_category_in_chat",
      });
      return new Response(JSON.stringify({
        error: "Молим не споделяйте чувствителни лични данни (здравни, биометрични, синдикални, политически, религиозни) в чата.",
        code: "special_category_blocked",
      }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Paid individual / team gate
    const { data: quota } = await admin
      .from("download_quota")
      .select("plan, pro_until, pro_monthly_used")
      .eq("user_id", userId)
      .maybeSingle();
    const isPro = quota?.plan === "pro" || (quota?.pro_until && new Date(quota.pro_until) > new Date());

    let isEntrepreneur = false;
    if (isPro) {
      const { data: subRow } = await admin
        .from("subscriptions")
        .select("price_id, status")
        .eq("user_id", userId)
        .in("status", ["active", "trialing", "past_due"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const pid = (subRow as any)?.price_id || "";
      isEntrepreneur = pid.startsWith("entrepreneur");
    }

    let teamId: string | null = null;
    if (!isPro) {
      const { data: tm } = await admin
        .from("team_members")
        .select("team_id, teams!inner(status)")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      const t: any = tm;
      if (t && t.teams?.status === "active") teamId = t.team_id;
    }

    if (!isPro && !teamId) {
      return new Response(JSON.stringify({
        error: "AI асистентът е достъпен само за Професионалист, Предприемач и Екип.",
        code: "subscription_required",
      }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Thread management
    let activeThreadId = threadId;
    if (activeThreadId) {
      const { data: th } = await admin
        .from("assistant_threads")
        .select("id, user_id")
        .eq("id", activeThreadId)
        .maybeSingle();
      if (!th || th.user_id !== userId) {
        return new Response(JSON.stringify({ error: "Разговорът не е намерен" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      const firstUser = safeMessages.find((m: any) => m.role === "user");
      const title = (firstUser?.content ?? "Нов разговор").slice(0, 80);
      const { data: created } = await admin
        .from("assistant_threads")
        .insert({ user_id: userId, title })
        .select("id")
        .single();
      activeThreadId = created?.id ?? null;
    }

    // Persist last user message
    const lastUser = safeMessages[safeMessages.length - 1];
    await admin.from("assistant_messages").insert({
      thread_id: activeThreadId,
      role: "user",
      content: lastUser.content,
    });

    // RAG
    const ctxLines = [
      `Потребителски статус: ${teamId ? "Екип" : isEntrepreneur ? "Предприемач" : "Професионалист"}.`,
      currentPath ? `Текуща страница: ${currentPath}.` : "",
    ].filter(Boolean).join(" ");
    const activePrompt = await loadActivePromptMeta(admin, "assistant-chat", SYSTEM_PROMPT);
    const legal = await retrieveLegalContext(admin, LOVABLE_API_KEY, lastUserMsg, {
      matchCount: 8,
      minSimilarity: 0.45,
    });
    const systemFinal = legal.hasMatches
      ? `${activePrompt.content}\n\n[КОНТЕКСТ] ${ctxLines}\n\n${legal.promptBlock}`
      : `${activePrompt.content}\n\n[КОНТЕКСТ] ${ctxLines}\n\n[НОРМАТИВНА БАЗА] Няма намерени релевантни нормативни извадки.`;

    const standardModel = activePrompt.model || MODEL_STANDARD;
    const premiumModel = activePrompt.premiumModel || MODEL_PREMIUM;
    const chatModel = isEntrepreneur ? premiumModel : standardModel;
    const tools = toolSchemasFor(FULL_TOOL_NAMES);

    // Build conversation
    const convo: ChatMsg[] = [
      { role: "system", content: systemFinal },
      ...safeMessages.map((m: any) => ({ role: m.role, content: m.content })),
    ];

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        const enqueue = (event: string | null, data: unknown) => {
          const ev = event ? `event: ${event}\n` : "";
          controller.enqueue(encoder.encode(`${ev}data: ${JSON.stringify(data)}\n\n`));
        };

        enqueue("meta", { threadId: activeThreadId, citations: legal.citations });

        let fullAssistantText = "";
        let iterations = 0;
        let lastModelStatus = 200;

        try {
          while (iterations < MAX_TOOL_ITERATIONS) {
            iterations++;
            const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: chatModel,
                stream: true,
                tools,
                messages: convo,
              }),
            });
            lastModelStatus = aiResp.status;

            if (!aiResp.ok || !aiResp.body) {
              const errText = await aiResp.text().catch(() => "");
              console.error("AI gateway error:", aiResp.status, errText.slice(0, 300));
              const errMsg = aiResp.status === 429
                ? "Лимитът е достигнат. Опитайте отново скоро."
                : aiResp.status === 402
                ? "Изчерпани AI кредити."
                : "AI грешка. Опитайте отново.";
              enqueue("error", { message: errMsg, status: aiResp.status });
              break;
            }

            // Parse stream — collect text + tool_calls assembly
            const reader = aiResp.body.getReader();
            let buffer = "";
            let textThisTurn = "";
            // tool_calls accumulator: index -> { id, name, args (string) }
            const toolAcc: Map<number, { id: string; name: string; args: string }> = new Map();

            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";
              for (const line of lines) {
                const t = line.trim();
                if (!t.startsWith("data:")) continue;
                const dat = t.slice(5).trim();
                if (dat === "[DONE]") continue;
                let parsed: any;
                try { parsed = JSON.parse(dat); } catch { continue; }
                const choice = parsed?.choices?.[0];
                const delta = choice?.delta;
                if (!delta) continue;
                if (typeof delta.content === "string" && delta.content.length > 0) {
                  textThisTurn += delta.content;
                  enqueue(null, { delta: delta.content });
                }
                if (Array.isArray(delta.tool_calls)) {
                  for (const tc of delta.tool_calls) {
                    const idx = typeof tc.index === "number" ? tc.index : 0;
                    const existing = toolAcc.get(idx) ?? { id: "", name: "", args: "" };
                    if (tc.id) existing.id = tc.id;
                    if (tc.function?.name) existing.name = tc.function.name;
                    if (typeof tc.function?.arguments === "string") existing.args += tc.function.arguments;
                    toolAcc.set(idx, existing);
                  }
                }
              }
            }

            fullAssistantText += textThisTurn;

            if (toolAcc.size === 0) {
              // Done — no tool calls
              enqueue(null, "[DONE]");
              break;
            }

            // We have tool calls. Append assistant message with tool_calls to convo.
            const toolCallsArr = Array.from(toolAcc.entries())
              .sort((a, b) => a[0] - b[0])
              .map(([, v]) => ({
                id: v.id || `tc_${Math.random().toString(36).slice(2)}`,
                type: "function" as const,
                function: { name: v.name, arguments: v.args || "{}" },
              }));

            convo.push({
              role: "assistant",
              content: textThisTurn || null,
              tool_calls: toolCallsArr,
            });

            // Split server vs client tool calls.
            const clientCalls = toolCallsArr.filter((tc) => !isServerTool(tc.function.name));
            const serverCalls = toolCallsArr.filter((tc) => isServerTool(tc.function.name));

            // Execute server tools and feed back.
            for (const sc of serverCalls) {
              let result: unknown;
              try {
                const args = JSON.parse(sc.function.arguments || "{}");
                if (sc.function.name === "search_templates") {
                  result = await execSearchTemplates(admin, args);
                } else {
                  result = { error: "unknown_tool" };
                }
              } catch (e) {
                result = { error: "tool_exec_failed", message: e instanceof Error ? e.message : String(e) };
              }
              convo.push({
                role: "tool",
                tool_call_id: sc.id,
                content: JSON.stringify(result),
              });
              // Forward to client for UI rendering as well.
              enqueue("tool_result", {
                id: sc.id,
                name: sc.function.name,
                args: safeParse(sc.function.arguments),
                result,
              });
            }

            // Forward client tools — but they don't feed back into convo this turn.
            // The client will execute them. The model has already produced its
            // user-facing explanation in textThisTurn (per our system prompt).
            for (const cc of clientCalls) {
              const rawArgs = safeParse(cc.function.arguments);
              const validated = validateClientToolArgs(cc.function.name, rawArgs);
              if (validated.ok) {
                enqueue("tool_call", {
                  id: cc.id,
                  name: cc.function.name,
                  args: validated.args,
                });
              } else {
                // Bad args — give the model a chance to fix on next iteration.
                convo.push({
                  role: "tool",
                  tool_call_id: cc.id,
                  content: JSON.stringify({ error: validated.reason }),
                });
              }
            }

            // If only client tools were emitted, we can stop here.
            if (serverCalls.length === 0 && clientCalls.length > 0) {
              enqueue(null, "[DONE]");
              break;
            }
            // Otherwise loop to give the model server tool results.
          }
        } catch (err) {
          console.error("Stream loop error:", err);
          enqueue("error", { message: "Грешка при стрийминг" });
        } finally {
          // Parse followups from final text; if missing, fall back contextually.
          const lastToolName = (() => {
            // best-effort: scan convo backwards for the last assistant tool_calls
            for (let i = convo.length - 1; i >= 0; i--) {
              const m: any = convo[i];
              if (m?.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
                return m.tool_calls[m.tool_calls.length - 1]?.function?.name ?? null;
              }
            }
            return null;
          })();
          const { cleaned, followups } = parseFollowups(fullAssistantText);
          const finalFollowups = followups.length >= 2 ? followups : fallbackFollowups(lastToolName);
          try {
            controller.enqueue(new TextEncoder().encode(`event: followups\ndata: ${JSON.stringify({ followups: finalFollowups })}\n\n`));
          } catch { /* ignore */ }

          // Persist cleaned assistant message (no inline tag).
          if (cleaned.trim() && activeThreadId) {
            await admin.from("assistant_messages").insert({
              thread_id: activeThreadId,
              role: "assistant",
              content: cleaned,
            });
            await admin.from("assistant_threads")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", activeThreadId);
          }

          await logAiAudit({
            user_id: userId, operation: "assistant-chat", model: chatModel,
            classification: chatClassification, redaction_applied: false,
            status: lastModelStatus === 200 ? "ok" : "error",
            error_code: lastModelStatus === 200 ? undefined : `http_${lastModelStatus}`,
          });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (err) {
    console.error("assistant-chat error:", err);
    return new Response(JSON.stringify({ error: "Сървърна грешка" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function safeParse(s: string): any {
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}

function validateClientToolArgs(name: string, args: any): { ok: true; args: any } | { ok: false; reason: string } {
  if (!args || typeof args !== "object") return { ok: false, reason: "args must be object" };
  if (name === "navigate") {
    const p = sanitizePath(args.path);
    if (!p) return { ok: false, reason: "invalid path" };
    return { ok: true, args: { path: p, reason: typeof args.reason === "string" ? args.reason.slice(0, 200) : undefined } };
  }
  if (name === "open_template") {
    if (typeof args.slug !== "string" || !/^[a-z0-9\-]{1,80}$/.test(args.slug)) {
      return { ok: false, reason: "invalid slug" };
    }
    return { ok: true, args: { slug: args.slug } };
  }
  if (name === "prefill_build_contract") {
    const clean: Record<string, unknown> = {};
    for (const k of ["documentType", "name", "partiesA", "partiesB", "subject"]) {
      if (typeof args[k] === "string") clean[k] = String(args[k]).slice(0, 500);
    }
    if (typeof args.bilingual === "boolean") clean.bilingual = args.bilingual;
    return { ok: true, args: clean };
  }
  if (name === "open_upload_analyzer") {
    return { ok: true, args: {} };
  }
  if (name === "ask_clarification") {
    const ctx = typeof args.contextSummary === "string" ? args.contextSummary.slice(0, 240) : "";
    const qs = Array.isArray(args.questions) ? args.questions : [];
    const cleaned = qs.slice(0, 5).map((q: any, i: number) => ({
      id: typeof q?.id === "string" ? q.id.slice(0, 40).replace(/[^a-z0-9_]/gi, "_") : `q_${i}`,
      label: typeof q?.label === "string" ? q.label.slice(0, 120) : "",
      type: ["text", "choice", "number", "date"].includes(q?.type) ? q.type : "text",
      placeholder: typeof q?.placeholder === "string" ? q.placeholder.slice(0, 80) : undefined,
      options: Array.isArray(q?.options) ? q.options.slice(0, 6).map((o: any) => String(o).slice(0, 60)) : undefined,
      required: q?.required === true,
    })).filter((q: any) => q.label);
    if (cleaned.length === 0) return { ok: false, reason: "no valid questions" };
    return { ok: true, args: { contextSummary: ctx, questions: cleaned } };
  }
  if (name === "propose_contract_outline") {
    const title = typeof args.title === "string" ? args.title.slice(0, 160) : "";
    if (!title) return { ok: false, reason: "missing title" };
    const clauses = Array.isArray(args.clauses) ? args.clauses : [];
    const cleanClauses = clauses.slice(0, 12).map((c: any) => ({
      heading: typeof c?.heading === "string" ? c.heading.slice(0, 100) : "",
      summary: typeof c?.summary === "string" ? c.summary.slice(0, 240) : "",
    })).filter((c: any) => c.heading);
    if (cleanClauses.length < 3) return { ok: false, reason: "need at least 3 clauses" };
    const prefill: Record<string, unknown> = {};
    if (args.prefill && typeof args.prefill === "object") {
      for (const k of ["name", "partiesA", "partiesB", "subject"]) {
        if (typeof args.prefill[k] === "string") prefill[k] = String(args.prefill[k]).slice(0, 500);
      }
      if (typeof args.prefill.bilingual === "boolean") prefill.bilingual = args.prefill.bilingual;
    }
    return {
      ok: true,
      args: {
        title,
        documentType: typeof args.documentType === "string" ? args.documentType.slice(0, 80) : undefined,
        basedOnTemplateSlug: typeof args.basedOnTemplateSlug === "string" && /^[a-z0-9\-]{1,80}$/.test(args.basedOnTemplateSlug) ? args.basedOnTemplateSlug : undefined,
        clauses: cleanClauses,
        prefill,
      },
    };
  }
  return { ok: false, reason: "unknown tool" };
}

// Generate fallback followups when the model forgets to emit <followups>.
function fallbackFollowups(lastToolName: string | null): string[] {
  switch (lastToolName) {
    case "search_templates":
      return ["Отвори първия", "Покажи още шаблони", "Попълни нов от нула"];
    case "ask_clarification":
      return ["Попълни автоматично", "Покажи шаблона", "Започни отначало"];
    case "propose_contract_outline":
      return ["Потвърди и попълни", "Промени клаузите", "Покажи правно основание"];
    case "prefill_build_contract":
      return ["Изтегли PDF", "Сподели за подпис", "Анализирай за рискове"];
    case "open_template":
      return ["Попълни данните", "Покажи още варианти", "Промени езика на BG/EN"];
    case "open_upload_analyzer":
      return ["Намери подходящ шаблон", "Обясни клауза", "Изчисли неустойка"];
    case "navigate":
      return ["Намери шаблон", "Попълни нов договор", "Анализирай качен файл"];
    default:
      return ["Намери шаблон", "Попълни нов договор", "Качи договор за анализ"];
  }
}

const FOLLOWUPS_TAG = /<followups>([\s\S]*?)<\/followups>/i;

// Keep all followups that look like real chips. Only filter out empties,
// overly long strings, and pure theory questions ending with a question mark
// AND starting with an interrogative — those don't drive action.
const PURE_THEORY_RE = /^(какво|защо|кой|къде)\b[^?]*\?\s*$/i;

function isActionable(chip: string): boolean {
  const c = chip.trim();
  if (c.length === 0 || c.length > 70) return false;
  if (PURE_THEORY_RE.test(c)) return false;
  return true;
}

function parseFollowups(raw: string): { cleaned: string; followups: string[] } {
  if (!raw) return { cleaned: raw, followups: [] };
  const m = raw.match(FOLLOWUPS_TAG);
  if (!m) return { cleaned: raw, followups: [] };
  const list = m[1]
    .split(/\|\||\n/)
    .map((s) => s.trim().replace(/^[-•\d.)\s]+/, ""))
    .filter(isActionable)
    .slice(0, 4);
  return { cleaned: raw.replace(FOLLOWUPS_TAG, "").trim(), followups: list };
}

