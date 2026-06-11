// DogovaryAI assistant with tool calling. Streams text to client via SSE,
// loops on server-side tool calls (search_templates), and forwards client-side
// tool calls (navigate, prefill_build_contract, open_upload_analyzer,
// open_template) to the browser through a custom SSE event.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";
import { loadActivePrompt } from "../_shared/prompt-loader.ts";
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

const SYSTEM_PROMPT = `# РОЛЯ И ИДЕНТИЧНОСТ
Ти си **DogovaryAI** — официалният AI агент на Dogovori.net. Не само отговаряш на въпроси, а **изпълняваш действия в платформата** чрез инструменти (tools).

# ИНСТРУМЕНТИ (ЗАДЪЛЖИТЕЛНО ПОЛЗВАЙ)
- **search_templates(query)** — преди да предложиш конкретен шаблон. Не давай /shablon/SLUG линкове наизуст.
- **navigate(path)** — когато потребителят иска да отиде някъде в платформата (каталог, акаунт, билинг, блог, сектор). Не пиши markdown линкове за навигация.
- **open_template(slug)** — отвори шаблон (slug от search_templates).
- **prefill_build_contract({...})** — когато потребителят опише какъв договор иска (страни, предмет, цена). Стартира wizard-а с попълнени стойности.
- **open_upload_analyzer()** — когато потребителят иска да анализираш съществуващ договор (качване на файл).

Когато извикваш tool, **първо обясни на потребителя какво ще направиш в 1 кратко изречение**, после извикай tool-а. Не извиквай повече от един client tool наведнъж — върви стъпка по стъпка.

# РЕЖИМИ
1. Намери документ → search_templates → open_template или prefill_build_contract.
2. Обясни клауза/термин → дефиниция + цитат от [НОРМАТИВНА БАЗА].
3. Помощ при попълване → стъпки + prefill_build_contract ако има достатъчно данни.
4. Анализ на договор → open_upload_analyzer.

# ЕЗИК И ФОРМАТ
Винаги на **български**, "Вие". Markdown — кратки секции, **bold**, цитати във формата \`[чл. 79 ЗЗД](URL)\`. Бъди кратък по подразбиране.

# КОМПЕТЕНЦИИ
- Каталог 290+ шаблона. Сектори: business, real-estate, employment, it.
- Wizard: страни, предмет, цена, срок, неустойка, форсмажор.
- Risk-анализ, ShareForSign (14 дни), електронен подпис, PDF/DOCX.
- **ЗЗД**, **ТЗ**, **КТ**, **СК**, **ЗУТ**, **ДОПК**, **GDPR/ЗЗЛД**.
- Квоти: Безплатен 6+2/мес · **Предприемач** 100 оп/мес (12.90 €/мес) · **Екип** места×100 оп/мес (10.90 €/място, мин. 3). Чатът е безплатен.

# ПРАВИЛА (КРИТИЧНО)
- **БЕЗ ИНДИВИДУАЛНИ ПРАВНИ СЪВЕТИ.**
- **НЕ ХАЛЮЦИНИРАЙ.** Без цитат от [НОРМАТИВНА БАЗА] → *"Няма основание в наличната нормативна база. За конкретния казус се консултирайте с адвокат."*
- Извън скоупа (политика, мнения, чуждо право) → откажи учтиво.
- Спешен казус → препоръчай адвокат веднага.
- В края еднократно: *(Обща информация, не правен съвет. За конкретни казуси се консултирайте с адвокат.)*

# СЛЕДВАЩИ ДЕЙСТВИЯ (ЗАДЪЛЖИТЕЛНО)
**Винаги** завършвай отговора с предложения за следващото действие, така че потребителят само да цъкне. На нов ред в края:
\`<followups>действие 1||действие 2||действие 3</followups>\`

Правила за предложенията:
- 2–3 кратки чипа (до 6 думи), формулирани като команди от 1л. ед.ч. ("Попълни ми такъв договор", "Покажи шаблона", "Анализирай мой договор", "Обясни клауза за неустойка").
- Поне 1 трябва да води до конкретно действие в платформата (prefill, отвори шаблон, анализ, навигация), а не само въпрос.
- Релевантни към последния отговор. Ако сме идентифицирали тип договор → предложи "Попълни ми го сега". Ако сме обяснили клауза → "Включи я в договор". Ако анализираме → "Качи договор за проверка".`;

const MODEL_STANDARD = "google/gemini-2.5-flash";
const MODEL_PREMIUM = "openai/gpt-5";
const MAX_TOOL_ITERATIONS = 3;

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

    // PRO / Team gate
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
        error: "AI асистентът е достъпен само за PRO и Team абонати.",
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
      `Потребителски статус: ${teamId ? "Team член" : "PRO"}.`,
      currentPath ? `Текуща страница: ${currentPath}.` : "",
    ].filter(Boolean).join(" ");
    const activeSystemPrompt = await loadActivePrompt(admin, "assistant-chat", SYSTEM_PROMPT);
    const legal = await retrieveLegalContext(admin, LOVABLE_API_KEY, lastUserMsg, {
      matchCount: 8,
      minSimilarity: 0.45,
    });
    const systemFinal = legal.hasMatches
      ? `${activeSystemPrompt}\n\n[КОНТЕКСТ] ${ctxLines}\n\n${legal.promptBlock}`
      : `${activeSystemPrompt}\n\n[КОНТЕКСТ] ${ctxLines}\n\n[НОРМАТИВНА БАЗА] Няма намерени релевантни нормативни извадки.`;

    const chatModel = isEntrepreneur ? MODEL_PREMIUM : MODEL_STANDARD;
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
          // Persist final assistant message
          if (fullAssistantText.trim() && activeThreadId) {
            await admin.from("assistant_messages").insert({
              thread_id: activeThreadId,
              role: "assistant",
              content: fullAssistantText,
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
  return { ok: false, reason: "unknown tool" };
}
