// Edge function: Pro-only — apply selected risk recommendations to an existing contract
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Ти си водещ български правен архитект. Получаваш съществуващ договор (в JSON) и списък от ИЗБРАНИ препоръки/слаби места, които трябва да коригираш в текста.
Запази всички останали клаузи, формат, номерация и стил. Промени САМО това, което е необходимо, за да адресираш избраните препоръки. Където е нужно — добави нови клаузи или алинеи в съответния раздел (или нов раздел "Допълнителни защитни клаузи").
След корекциите направи и нов кратък Risk Analysis на коригирания договор.
Връщай СТРОГО валиден JSON със същата структура като входа:
{
  "risk": { "level": "low"|"medium"|"high", "score": 0-100, "summary": "...", "issues": [{"severity":"...","title":"...","detail":"..."}], "recommendations": ["..."] },
  "contract": { "title": "...", "preamble": "...", "clauses": [{"number":"I.","title":"...","body":"..."}], "closing": "..." },
  "applied": ["кратко описание какво е променено за всяка избрана препоръка"]
}
Никакви markdown ограждания. Всички парични суми са в евро (€).`;

function extractJson(s: string): any {
  let cleaned = s.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = cleaned.search(/[\{\[]/);
  const openCh = start !== -1 ? cleaned[start] : "";
  const closeCh = openCh === "[" ? "]" : "}";
  const end = cleaned.lastIndexOf(closeCh);
  if (start !== -1 && end !== -1) cleaned = cleaned.substring(start, end + 1);
  try { return JSON.parse(cleaned); } catch {}
  cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]").replace(/[\x00-\x1F\x7F]/g, "");
  try { return JSON.parse(cleaned); } catch {}
  let braces = 0, brackets = 0;
  for (const c of cleaned) {
    if (c === "{") braces++; else if (c === "}") braces--;
    if (c === "[") brackets++; else if (c === "]") brackets--;
  }
  while (brackets-- > 0) cleaned += "]";
  while (braces-- > 0) cleaned += "}";
  return JSON.parse(cleaned);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    // Pro check
    const { data: q } = await admin.from("download_quota")
      .select("plan, pro_until").eq("user_id", userId).maybeSingle();
    const isPro = !!q && (q.plan === "pro" || (!!q.pro_until && new Date(q.pro_until) > new Date()));
    if (!isPro) {
      return new Response(JSON.stringify({ error: "pro_required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { contract, risk, selectedIssues = [], selectedRecommendations = [], answers = {} } = await req.json();

    if (!contract || (selectedIssues.length === 0 && selectedRecommendations.length === 0)) {
      return new Response(JSON.stringify({ error: "Нищо за коригиране" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY липсва");

    const issuesBlock = selectedIssues.length
      ? "ИЗБРАНИ СЛАБИ МЕСТА:\n" + selectedIssues.map((i: any, n: number) => `${n + 1}. [${i.severity}] ${i.title} — ${i.detail}`).join("\n")
      : "";
    const recsBlock = selectedRecommendations.length
      ? "ИЗБРАНИ ПРЕПОРЪКИ:\n" + selectedRecommendations.map((r: string, n: number) => `${n + 1}. ${r}`).join("\n")
      : "";

    const userPrompt = `СЪЩЕСТВУВАЩ ДОГОВОР (JSON):
${JSON.stringify(contract)}

ТЕКУЩ RISK:
${risk ? JSON.stringify(risk) : "(не е предоставен)"}

${issuesBlock}

${recsBlock}

КОНТЕКСТ ОТ ИНТЕРВЮТО:
${Object.entries(answers).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

Задача: Коригирай договора така, че да адресира САМО избраните препоръки/слаби места. Не променяй несвързани клаузи. Накрая върни нов risk анализ на коригирания договор и списък "applied" с кратко описание на промените.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Достигнат е лимитът. Опитайте по-късно." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiResp.status === 402) return new Response(JSON.stringify({ error: "Изчерпани са кредитите за AI." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await aiResp.text();
      console.error("AI gateway:", aiResp.status, t);
      throw new Error("AI грешка");
    }

    const raw = await aiResp.json();
    const content: string = raw.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) throw new Error("Празен AI отговор");
    const parsed = extractJson(content);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("apply-corrections error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Неизвестна грешка" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
