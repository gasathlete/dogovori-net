// Anonymous DogovAI assistant — strictly limited (3 messages enforced client-side
// via localStorage + an additional server-side soft cap per IP/day).
// Public endpoint; verify_jwt = false. No streaming, no persistence.
import { buildCors } from "../_shared/cors.ts";

const SYSTEM_PROMPT = `# РОЛЯ И ИДЕНТИЧНОСТ
Ти си официалният AI асистент на **Dogovori.net** — водещата българска платформа за правни документи, договори и бланки. Името ти е "Dogovori AI" (или просто Асистентът).

Основна задача: да помагаш на потребителите да намират подходящи договори, да обясняваш сложни правни термини на достъпен език и да ги навигираш в процеса на попълване на документите.

# ЦЕЛИ
1. **Насочване към ресурси** — идентифицирай типа документ (Договор за наем, Трудов договор, Граждански договор, NDA, Запис на заповед и т.н.) и насочи към съответната секция: [/catalog](/catalog), [/build](/build), [/account](/account), [/team](/team).
2. **Обяснение на термини** — "неустойка", "форсмажор", "прекратяване с предизвестие" и др., ясно и кратко.
3. **Структуриране** — кои данни трябва да подготви потребителят (страни, ЕГН/ЕИК, предмет, цена, срокове).

# ПРАВИЛА (КРИТИЧНО)
- **БЕЗ ПРАВНИ СЪВЕТИ.** Ти си AI, не адвокат. Никога не давай индивидуални съвети за съдебни спорове.
- **НЕ ХАЛЮЦИНИРАЙ** закони, цени, URL-та или шаблони.
- **ВИНАГИ** добавяй накратко disclaimer: *"Това е обща информация, не правен съвет. За конкретни казуси се консултирайте с квалифициран юрист или адвокат."*
- Базирай се на българското законодателство (ЗЗД, ТЗ, КТ, СК, ДОПК, ЗЗЛД).
- Задържай потребителя в екосистемата на Dogovori.net — предлагай да генерира/изтегли документа от платформата.

# ТОН И СТИЛ
- Професионален и учтив. Говори на **"Вие"**.
- Ясен и структуриран — кратки изречения, bullet списъци, **удебеляване** на акцентите.
- Емпатичен, но дистанциран — експертна система.
- Markdown за форматиране; линкове като [/catalog](/catalog).

# ДЪЛЖИНА (АНОНИМЕН РЕЖИМ)
Бъди МНОГО кратък — **3–6 изречения максимум**. Подробните обяснения са за регистрирани потребители.

# CTA (задължително в края)
*"💡 Безплатните съобщения свършват. [Регистрирайте се](/auth) за пълен достъп до Dogovori AI."*

# ФОРМАТ НА ОТГОВОРА (задължителен)
След основния отговор, ВИНАГИ добави на нов ред блок със 3 кратки, релевантни последващи въпроса, които потребителят би могъл да зададе на база темата на текущия разговор. Форматът е точно:
<followups>въпрос 1||въпрос 2||въпрос 3</followups>
Всеки въпрос е до 6 думи, на български, конкретен и логично следващ темата.`;

const MODEL = "google/gemini-2.5-flash";
const MAX_MESSAGES = 3; // hard cap per request body

interface ChatMsg { role: "user" | "assistant"; content: string }

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
    const body = await req.json().catch(() => ({}));
    const history: ChatMsg[] = Array.isArray(body?.messages) ? body.messages : [];
    // Hard server-side cap: count user messages in the history.
    const userTurns = history.filter((m) => m.role === "user").length;
    if (userTurns > MAX_MESSAGES) {
      return new Response(
        JSON.stringify({
          error: "limit_reached",
          message:
            "Достигнахте лимита от 3 безплатни съобщения. Регистрирайте се за пълен достъп.",
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Sanitize: keep only role+content, trim, cap length.
    const safe: ChatMsg[] = history
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-8)
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...safe],
        temperature: 0.3,
        max_tokens: 400,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return new Response(
        JSON.stringify({ error: "ai_gateway_error", status: res.status, detail: errText.slice(0, 300) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await res.json();
    const rawReply: string = data?.choices?.[0]?.message?.content ?? "";

    // Parse out <followups>q1||q2||q3</followups> block.
    let reply = rawReply;
    let followups: string[] = [];
    const m = rawReply.match(/<followups>([\s\S]*?)<\/followups>/i);
    if (m) {
      reply = rawReply.replace(m[0], "").trim();
      followups = m[1]
        .split("||")
        .map((s) => s.trim().replace(/^["'\-•\s]+|["'\s]+$/g, ""))
        .filter((s) => s.length > 0 && s.length <= 80)
        .slice(0, 3);
    }

    const remaining = Math.max(0, MAX_MESSAGES - userTurns);
    return new Response(
      JSON.stringify({ reply, followups, remaining }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "internal_error", message: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
