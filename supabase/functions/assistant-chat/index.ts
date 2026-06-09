// Edge function: 24/7 AI support assistant for PRO + Team subscribers.
// Streams responses via Lovable AI Gateway (SSE pass-through) and persists
// completed assistant messages to assistant_messages.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";
import { loadActivePrompt } from "../_shared/prompt-loader.ts";
import { guardIllegalContent } from "../_shared/illegal-content.ts";
import { classifyDocumentBeforeAI } from "../_shared/classify.ts";
import { routeModel } from "../_shared/model-router.ts";
import { logAiAudit } from "../_shared/ai-call.ts";

const SYSTEM_PROMPT = `Ти си "Правен асистент Dogovori.net" — професионален 24/7 помощник за PRO и Team абонати на платформата dogovori.net.

ЕЗИК: Винаги отговаряй на български език, ясно, кратко, професионално. Използвай Markdown за форматиране (списъци, **удебеляване**, [линкове](url), кодови блокове за примери).

КОМПЕТЕНЦИИ — помагаш в 4 области:

1) **НАВИГАЦИЯ В САЙТА** — насочваш потребителя към правилната страница чрез markdown линкове:
   - Каталог с 290+ шаблона: [/catalog](/catalog)
   - Изготви собствен договор с AI: [/build](/build)
   - Сектори: [/sektor/business](/sektor/business), [/sektor/real-estate](/sektor/real-estate), [/sektor/employment](/sektor/employment), [/sektor/it](/sektor/it)
   - Личен профил: [/account](/account) (документи, контакти, папки, абонамент)
   - Екип: [/team](/team)
   - Блог: [/blog](/blog)
   - Конкретен шаблон: [/shablon/SLUG](/shablon/SLUG)

2) **ПОМОЩ С ДОКУМЕНТИ** — обясняваш:
   - Как да попълни полета във wizard-а (страни, предмет, цена, срок, неустойка, форсмажор)
   - Какво означава дадена клауза и кога е важна
   - Как работи risk-анализът (1-10 скала, severity low/medium/high)
   - Експорт PDF/DOCX (бутон "Свали" в шаблона/документа)
   - Електронен подпис (ShareForSign диалог в /account → Документи)
   - Споделяне за подпис от втора страна (генерира защитен линк, валиден 14 дни)

3) **ПРАВНИ ВЪПРОСИ** — общи насоки по:
   - **ЗЗД** (Закон за задълженията и договорите) — гражданскоправни договори, неустойка, прекратяване
   - **ТЗ** (Търговски закон) — търговски сделки, дружества
   - **КТ** (Кодекс на труда) — трудови договори, предизвестие, обезщетения
   - **СК** (Семеен кодекс) — брачни договори, развод, издръжка
   - **ЗУТ** (Закон за устройство на територията) — строителство, имоти
   - **GDPR / ЗЗЛД** — обработка на лични данни, политики за поверителност
   ⚠️ ВИНАГИ добавяй накратко: *"Това е обща информация, не правен съвет. За конкретен казус се консултирайте с адвокат."*

4) **ТЕХНИЧЕСКА ПОДДРЪЖКА**:
   - Quota / лимити: Безплатен план = 6 операции общо + 2/месец (договори, бланки, анализи); Предприемач = 100 операции/месец; Екип = места × 100/месец. Чатът е безплатен.
   - Плащане: Stripe (картови плащания), управление през [/account?tab=billing](/account?tab=billing)
   - Грешки при export, OCR, подпис
   - Team управление, покани, seats

ПРАВИЛА:
- НЕ измисляй URL-та, шаблони, цени, закони които не знаеш със сигурност.
- Ако въпросът е извън компетенциите ти (политика, мнения, развлечения, друго право извън България) — учтиво обясни, че помагаш само с dogovori.net и българско договорно/трудово/семейно право.
- Винаги предлагай конкретно следващо действие (бутон, линк, страница).
- Бъди кратък по подразбиране. Подробни обяснения само когато потребителят попита.
- Ако има признак на спешен правен казус (съдебно дело, арест, заплахи) → препоръчай адвокат веднага.`;

// In-code allowlist of supported models (keeps client requests safe).
const MODEL_STANDARD = "google/gemini-2.5-flash";
const MODEL_PREMIUM = "openai/gpt-5"; // Предприемач tier

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
    // Sanitize messages: only role + string content, cap length
    const safeMessages = messages
      .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-20)
      .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 8000) }));
    if (safeMessages.length === 0 || safeMessages[safeMessages.length - 1].role !== "user") {
      return new Response(JSON.stringify({ error: "Последното съобщение трябва да е от потребителя" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Illegal content guard — only check the latest user message
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

    // === GDPR/AI Act compliance: block special-category data in chat ===
    const lastUserMsg = safeMessages[safeMessages.length - 1].content;
    const chatClassification = classifyDocumentBeforeAI(lastUserMsg);
    if (chatClassification.contains_special_category_data) {
      await logAiAudit({
        user_id: userId, operation: "assistant-chat", model: "",
        classification: chatClassification, redaction_applied: false,
        status: "blocked", error_code: "special_category_in_chat",
      });
      return new Response(JSON.stringify({
        error: "Молим не споделяйте чувствителни лични данни (здравни, биометрични, синдикални, политически, религиозни) в чата. За такива въпроси се консултирайте с адвокат.",
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

    // Detect Entrepreneur tier (premium model + priority)
    let isEntrepreneur = false;
    if (isPro) {
      const { data: subRow } = await admin
        .from("subscriptions")
        .select("price_id, status, current_period_end")
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

    // Validate / consume thread
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
      const firstUser = safeMessages.find((m) => m.role === "user");
      const title = (firstUser?.content ?? "Нов разговор").slice(0, 80);
      const { data: created, error: cErr } = await admin
        .from("assistant_threads")
        .insert({ user_id: userId, title })
        .select("id")
        .single();
      if (cErr || !created) {
        return new Response(JSON.stringify({ error: "Грешка при създаване на разговор" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      activeThreadId = created.id;
    }

    // Persist last user message
    const lastUser = safeMessages[safeMessages.length - 1];
    await admin.from("assistant_messages").insert({
      thread_id: activeThreadId,
      role: "user",
      content: lastUser.content,
    });

    // Чатът е безплатен — не консумира операция от квотата.

    // Compose system with runtime context
    const ctxLines = [
      `Потребителски статус: ${teamId ? "Team член" : "PRO"}.`,
      currentPath ? `Текуща страница: ${currentPath}.` : "",
    ].filter(Boolean).join(" ");
    const activeSystemPrompt = await loadActivePrompt(admin, "assistant-chat", SYSTEM_PROMPT);
    const systemFinal = `${activeSystemPrompt}\n\n[КОНТЕКСТ] ${ctxLines}`;

    // Call Lovable AI Gateway with streaming
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
    const chatModel = isEntrepreneur ? MODEL_PREMIUM : MODEL_STANDARD;
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: chatModel,
        stream: true,
        messages: [
          { role: "system", content: systemFinal },
          ...safeMessages,
        ],
      }),
    });

    // Metadata-only audit log (chat is streamed, content never stored here).
    await logAiAudit({
      user_id: userId, operation: "assistant-chat", model: chatModel,
      classification: chatClassification,
      redaction_applied: false,
      status: aiResp.ok ? "ok" : "error",
      error_code: aiResp.ok ? undefined : `http_${aiResp.status}`,
    });

    if (!aiResp.ok || !aiResp.body) {
      const errText = await aiResp.text().catch(() => "");
      console.error("AI gateway error:", aiResp.status, errText);
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Лимитът е достигнат. Опитайте отново скоро." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Изчерпани AI кредити. Свържете се с поддръжка." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI грешка. Опитайте отново." }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Stream SSE through to client; collect text for persistence on completion
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let fullText = "";
    const reader = aiResp.body.getReader();

    const stream = new ReadableStream({
      async start(controller) {
        // Send threadId first as a custom event so client can store it
        controller.enqueue(encoder.encode(`event: meta\ndata: ${JSON.stringify({ threadId: activeThreadId })}\n\n`));

        let buffer = "";
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const data = trimmed.slice(5).trim();
              if (data === "[DONE]") {
                controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                continue;
              }
              try {
                const parsed = JSON.parse(data);
                const delta = parsed?.choices?.[0]?.delta?.content;
                if (typeof delta === "string" && delta.length > 0) {
                  fullText += delta;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
                }
              } catch { /* ignore parse errors mid-stream */ }
            }
          }
        } catch (err) {
          console.error("Stream error:", err);
        } finally {
          // Persist assistant message
          if (fullText.trim()) {
            await admin.from("assistant_messages").insert({
              thread_id: activeThreadId,
              role: "assistant",
              content: fullText,
            });
            await admin.from("assistant_threads")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", activeThreadId);
          }
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
