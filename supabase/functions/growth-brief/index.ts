// Edge function: „Режим разсъждение" — автоматичен Growth Brief.
//
// Надгражда съществуващите метрики (/admin/metrics, /admin/funnel): чете
// САМО реални агрегирани данни от public.growth_snapshot (без лични данни),
// сравнява текущия период с предходния и произвежда:
//   - разсъждение (кое е сигнал, кое е шум, коя хипотеза обяснява отпадането);
//   - готов за поставяне промпт за следващата итерация на сайта.
//
// Достъп: staff JWT ИЛИ service_role (за cron).
import { buildCors } from "../_shared/cors.ts";
import { extractJson } from "../_shared/json.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Period = "daily" | "weekly" | "monthly" | "yearly";

const PERIOD_DAYS: Record<Period, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  yearly: 365,
};

const PERIOD_LABEL: Record<Period, string> = {
  daily: "последните 24 часа",
  weekly: "последните 7 дни",
  monthly: "последните 30 дни",
  yearly: "последните 12 месеца",
};

const MODEL = "google/gemini-3.6-flash";

const SYSTEM_PROMPT = `Ти си Head of Growth + Head of Product на българската SaaS платформа Договори.нет (генериране на договори, AI асистент, анализ на качени договори, електронен подпис, комплекти документи).

ЗАДАЧА: анализираш РЕАЛНИ агрегирани продуктови данни и произвеждаш (1) разсъждение и (2) готов за поставяне промпт към разработчик-агент за следващата итерация на сайта.

ТЕКУЩА СТРАТЕГИЯ (не я подменяй, а я надграждай):
- Активен план: „Път към 30 абоната през септември".
- Вече изградено: разделяне на технически провал (fail) от продуктов блокаж (blocked) във funnel_events; табла /admin/funnel, /admin/metrics (индекс на качеството), /admin/financials (месечен одит); анонимен преглед на документ преди регистрация; AI ревизор на документа; блокиране на непопълнени полета.
- Основната диагностицирана пречка досега: потребителят не стига до усетена стойност преди login/quota гейт.

ПРОДУКТОВИ ПРАВИЛА (нарушаването им е грешка):
- Целият UI е на български, професионален правен тон.
- Валута само EUR. Цени: Предприемач 12.90 €/мес (100 операции), Екип 10.90 €/място/мес (мин. 3 места). Топ-ъп пакети: 10/2.90, 20/5.40, 50/12.90, 100/23.90 €.
- 1 операция = сваляне на документ | сваляне на шаблон | качване+анализ | 1 съобщение до AI асистента.
- Две целеви аудитории: малки фирми (по подразбиране) и фрийлансъри; цената винаги идва с ROI рамка.
- GUARDRAIL: ръст на конверсията НЕ се приема, ако индексът на качеството спада. Всяка задача носи и метрика за качество.
- Аналитиката е само consent-gated и без лични данни.
- Не предлагай неща, които вече съществуват, и не предлагай смяна на цени или на 7-те канонични hero елемента.

СТИЛ НА РАЗСЪЖДЕНИЕТО:
- Разграничавай сигнал от шум: при малки абсолютни числа (под ~30 събития) го казвай изрично и не строй стратегия върху тях.
- Свързвай числата с конкретни екрани и потоци в продукта.
- Приоритизирай по (очакван ефект върху абонаменти) / (усилие), максимум 5 задачи.

Връщай СТРОГО валиден JSON без markdown ограждания:
{
  "headline": "едно изречение — какво казват данните за периода",
  "reasoning": "3-6 абзаца разсъждение: какво е сигнал, какво е шум, коя хипотеза обяснява отпадането, какво опровергава предходната хипотеза",
  "top_actions": [
    {"title":"кратко заглавие","why":"обосновка с конкретните числа","effort":"S|M|L","impact":"low|medium|high","metric":"метрика за успех","quality_metric":"метрика за качество, която не бива да спада"}
  ],
  "prompt_md": "ГОТОВ ЗА ПОСТАВЯНЕ промпт в markdown на български: контекст на продукта и периода, ключовите числа, хипотезите, приоритизирани задачи със засегнати екрани/потоци, критерии за приемане и guardrail за качеството"
}

КРИТИЧНО: в текстовите стойности не използвай двойни кавички (ползвай единични или без), за да е JSON-ът винаги валиден.`;

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/** Позволява staff JWT или service_role (cron). Връща null при успех. */
async function authorize(req: Request, corsHeaders: Record<string, string>): Promise<Response | null> {
  const deny = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return deny(401, "unauthorized");

  // Cron: сравняваме директно със service ключа (той може да е в новия
  // sb_secret_* формат, който getClaims не валидира като JWT).
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (serviceKey && token === serviceKey) return null;

  // Cron: споделен ключ, съхранен само в базата (vault). Стойността никога
  // не излиза извън сървъра — сравнението се прави в базата.
  if (!token.includes(".")) {
    try {
      const { data: okCron } = await adminClient().rpc("verify_cron_secret", {
        _secret: token,
      });
      if (okCron === true) return null;
    } catch { /* продължаваме към потребителска проверка */ }
  }

  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );


  try {
    const { data, error } = await anon.auth.getClaims(token);
    const claims = (data?.claims ?? {}) as Record<string, unknown>;
    if (!error && claims.role === "service_role") return null;

    const userId = typeof claims.sub === "string" ? claims.sub : null;
    if (!userId) return deny(403, "forbidden");

    const sb = adminClient();
    const { data: staff } = await sb.rpc("is_staff", { _user_id: userId });
    if (staff === true) return null;
    return deny(403, "forbidden");
  } catch {
    return deny(403, "forbidden");
  }
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const denied = await authorize(req, corsHeaders);
    if (denied) return denied;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "Липсва конфигурация за AI" }, 500);

    const body = await req.json().catch(() => ({}));
    const rawPeriod = String(body?.period ?? "daily");
    const period: Period = (["daily", "weekly", "monthly", "yearly"] as Period[]).includes(rawPeriod as Period)
      ? (rawPeriod as Period)
      : "daily";
    const source = String(body?.source ?? "manual") === "cron" ? "cron" : "manual";
    // Насока от оператора (админ панел): вече изпълнени задачи или нов приоритет.
    const operatorPrompt = String(body?.operator_prompt ?? "").slice(0, 8000).trim();


    const days = PERIOD_DAYS[period];
    const to = new Date();
    const from = new Date(to.getTime() - days * 86400_000);
    const prevFrom = new Date(from.getTime() - days * 86400_000);

    const sb = adminClient();

    const [cur, prev] = await Promise.all([
      sb.rpc("growth_snapshot", { _from: from.toISOString(), _to: to.toISOString() }),
      sb.rpc("growth_snapshot", { _from: prevFrom.toISOString(), _to: from.toISOString() }),
    ]);

    if (cur.error) return json({ error: `Грешка при снапшота: ${cur.error.message}` }, 500);

    const snapshot = {
      period,
      current: cur.data,
      previous: prev.error ? null : prev.data,
    };

    const userPrompt = [
      `ПЕРИОД: ${PERIOD_LABEL[period]} (${from.toISOString()} → ${to.toISOString()})`,
      `Сравнение спрямо предходния същия период (${prevFrom.toISOString()} → ${from.toISOString()}).`,
      "",
      "ДАННИ (JSON, агрегирани, без лични данни):",
      JSON.stringify(snapshot),
      ...(operatorPrompt
        ? [
            "",
            "НАСОКА ОТ ОПЕРАТОРА (промпт, по който работим в момента — третирай описаните задачи като ВЕЧЕ ИЗПЪЛНЕНИ, не ги предлагай повторно; отчети очаквания им ефект и продължи разсъжденията към следващата итерация):",
            operatorPrompt,
          ]
        : []),
    ].join("\n");


    // Дълга заявка → стриймваме и консумираме сървърно, за да не ни отреже таймаут.
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Lovable-API-Key": LOVABLE_API_KEY,
        "Content-Type": "application/json",
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResp.ok || !aiResp.body) {
      const detail = await aiResp.text().catch(() => "");
      if (aiResp.status === 429) return json({ error: "Твърде много заявки към AI. Опитайте по-късно." }, 429);
      if (aiResp.status === 402) return json({ error: "Изчерпани AI кредити на работното пространство." }, 402);
      console.error("growth-brief AI error", aiResp.status, detail.slice(0, 500));
      return json({ error: "AI услугата е недостъпна" }, 502);
    }

    // Сглобяване на стрийма (SSE) до пълен текст.
    let text = "";
    const reader = aiResp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const evt = JSON.parse(payload);
          const delta = evt?.choices?.[0]?.delta?.content;
          if (typeof delta === "string") text += delta;
        } catch {
          // непълен чънк — игнорираме
        }
      }
    }

    const parsed = extractJson(text) as
      | { headline?: string; reasoning?: string; prompt_md?: string; top_actions?: unknown[] }
      | null;

    if (!parsed || (!parsed.prompt_md && !parsed.reasoning)) {
      return json({ error: "AI отговорът не можа да бъде разчетен" }, 502);
    }

    const row = {
      period,
      window_from: from.toISOString(),
      window_to: to.toISOString(),
      snapshot,
      reasoning: parsed.reasoning ?? null,
      prompt_md: parsed.prompt_md ?? null,
      headline: parsed.headline ?? null,
      top_actions: Array.isArray(parsed.top_actions) ? parsed.top_actions : [],
      source,
      model: MODEL,
    };

    const { data: saved, error: insErr } = await sb
      .from("growth_briefs")
      .insert(row)
      .select()
      .single();

    if (insErr) {
      console.error("growth-brief insert error", insErr.message);
      return json({ brief: row, warning: "Брифът е генериран, но не е записан." });
    }

    return json({ brief: saved });
  } catch (e) {
    console.error("growth-brief error", e instanceof Error ? e.message : String(e));
    return json({ error: "Неочаквана грешка при генериране на брифа" }, 500);
  }
});
