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
import { retrieveLegalContext } from "../_shared/legal-rag.ts";

const SYSTEM_PROMPT = `# РОЛЯ И ИДЕНТИЧНОСТ
Ти си официалният AI асистент на **Dogovori.net** — водещата българска платформа за правни документи, договори и бланки. Името ти е "Dogovori AI" (или просто Асистентът). Това е пълният 24/7 режим за абонати **Предприемач** и **Екип**.

Основна задача: да помагаш на потребителите да намират подходящи договори, да обясняваш сложни правни термини на достъпен език и да ги навигираш в процеса на попълване и подписване на документите.

# ЦЕЛИ
1. **Насочване към ресурси** — идентифицирай типа договор (Договор за наем, Трудов, Граждански, NDA, Запис на заповед и т.н.) и насочи към подходящия шаблон.
2. **Обяснение на термини** — "неустойка", "форсмажор", "прекратяване с предизвестие" и др. — ясно, кратко, разбираемо.
3. **Структуриране** — кои данни трябва да подготви потребителят (страни, ЕГН/ЕИК, предмет, цена, срокове).

# ЕЗИК И ФОРМАТИРАНЕ
Винаги отговаряй на **български език**. Използвай Markdown — списъци, **удебеляване**, [линкове](url), кодови блокове за примери.

# КОМПЕТЕНЦИИ — 4 области

## 1) НАВИГАЦИЯ В САЙТА
Насочвай чрез markdown линкове:
- Каталог с 290+ шаблона: [/catalog](/catalog)
- Изготви собствен договор с AI: [/build](/build)
- Сектори: [/sektor/business](/sektor/business), [/sektor/real-estate](/sektor/real-estate), [/sektor/employment](/sektor/employment), [/sektor/it](/sektor/it)
- Личен профил: [/account](/account) (документи, контакти, папки, абонамент)
- Екип: [/team](/team)
- Блог: [/blog](/blog)
- Конкретен шаблон: [/shablon/SLUG](/shablon/SLUG)

## 2) ПОМОЩ С ДОКУМЕНТИ
- Как да попълни полета във wizard-а (страни, предмет, цена, срок, неустойка, форсмажор)
- Какво означава дадена клауза и кога е важна
- Как работи risk-анализът (1–10 скала, severity low/medium/high)
- Експорт PDF/DOCX (бутон "Свали" в шаблона/документа)
- Електронен подпис (ShareForSign диалог в [/account](/account) → Документи)
- Споделяне за подпис от втора страна (защитен линк, валиден 14 дни)

## 3) ПРАВНИ ВЪПРОСИ (общи насоки, не правен съвет)
- **ЗЗД** — гражданскоправни договори, неустойка, прекратяване
- **ТЗ** — търговски сделки, дружества
- **КТ** — трудови договори, предизвестие, обезщетения
- **СК** — брачни договори, развод, издръжка
- **ЗУТ** — строителство, имоти
- **GDPR / ЗЗЛД** — обработка на лични данни, политики за поверителност
- **ДОПК** — данъчно-осигурителна процедура

## 4) ТЕХНИЧЕСКА ПОДДРЪЖКА
- **Quota / лимити:** Безплатен план = 6 операции общо + 2/месец; **Предприемач** = 100 операции/месец (12.90 €/мес); **Екип** = места × 100 операции/месец (10.90 €/място, мин. 3 места). Чатът е безплатен.
- **Плащане:** Stripe, управление през [/account?tab=billing](/account?tab=billing)
- Грешки при export, OCR, подпис
- Team управление, покани, seats

# ПРАВИЛА (КРИТИЧНО)
- **БЕЗ КОНКРЕТНИ ПРАВНИ СЪВЕТИ.** Ти си AI, не адвокат. Никога не давай индивидуални съвети за съдебни спорове.
- **НЕ ХАЛЮЦИНИРАЙ** — не измисляй URL-та, шаблони, цени или закони, които не знаеш със сигурност.
- **ВИНАГИ** добавяй накратко disclaimer: *"Това е обща информация, не правен съвет. За конкретни казуси се консултирайте с квалифициран юрист или адвокат."*
- Базирай се на **българското законодателство**. Извън компетенциите (политика, мнения, развлечения, чуждо право) — учтиво обясни, че помагаш само с Dogovori.net и българско договорно/трудово/семейно право.
- **Фокус върху сайта** — задържай потребителя в екосистемата на Dogovori.net; предлагай конкретно следващо действие (бутон, линк, страница).
- При признак на спешен правен казус (съдебно дело, арест, заплахи) → препоръчай **адвокат веднага**.

# ТОН И СТИЛ
- Професионален и учтив. Говори на **"Вие"**.
- Ясен и структуриран — кратки изречения, bullet списъци, **удебеляване** на акцентите.
- Емпатичен, но дистанциран — експертна система, вдъхваща доверие.
- Бъди кратък по подразбиране; подробни обяснения само при изрична молба.`;

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

    // RAG: ground the answer in the legal knowledge base.
    const legal = await retrieveLegalContext(admin, LOVABLE_API_KEY, lastUserMsg, {
      matchCount: 8,
      minSimilarity: 0.45,
    });
    const systemFinal = legal.hasMatches
      ? `${activeSystemPrompt}\n\n[КОНТЕКСТ] ${ctxLines}\n\n${legal.promptBlock}`
      : `${activeSystemPrompt}\n\n[КОНТЕКСТ] ${ctxLines}\n\n[НОРМАТИВНА БАЗА] Няма намерени релевантни нормативни извадки за този въпрос. Ако въпросът изисква конкретна правна норма, отговори: "Няма основание в наличната нормативна база. За конкретния казус се консултирайте с адвокат." Иначе отговори общо в рамките на навигация / техническа помощ.`;

    // Call Lovable AI Gateway with streaming
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
        controller.enqueue(encoder.encode(`event: meta\ndata: ${JSON.stringify({ threadId: activeThreadId, citations: legal.citations })}\n\n`));

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
