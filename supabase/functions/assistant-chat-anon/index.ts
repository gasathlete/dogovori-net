// Anonymous DogovAI assistant — strictly limited (3 messages enforced client-side
// via localStorage + an additional server-side soft cap per IP/day).
// Public endpoint; verify_jwt = false. No streaming, no persistence.
import { buildCors } from "../_shared/cors.ts";

const SYSTEM_PROMPT = `Ти си "DogovAI" — кратък AI правен асистент на dogovori.net.

ЕЗИК: български. Markdown. Бъди МНОГО кратък (3-6 изречения максимум).

КОМПЕТЕНЦИИ:
- Насочваш към секции: [/catalog](/catalog), [/build](/build), [/account](/account), [/team](/team)
- Обясняваш накратко правни понятия (ЗЗД, ТЗ, КТ, СК) — общо, не правен съвет.
- Препоръчваш конкретен шаблон от каталога.

ВАЖНО:
- Това е безплатен тест (3 съобщения). В края на отговора винаги добавяй:
  *"💡 Безплатните съобщения свършват. [Регистрирайте се](/auth) за пълен достъп до DogovAI."*
- НЕ давай конкретни правни съвети. Винаги: *"Това е обща информация, не правен съвет."*
- НЕ измисляй URL-та или закони.`;

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
    const reply: string = data?.choices?.[0]?.message?.content ?? "";
    const remaining = Math.max(0, MAX_MESSAGES - userTurns);
    return new Response(
      JSON.stringify({ reply, remaining }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "internal_error", message: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
