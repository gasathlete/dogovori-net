// Edge function: Pro-only — generate a corrected version of an uploaded contract
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";

const SYSTEM_PROMPT = `Ти си водещ български правен архитект. Получаваш СУРОВ ТЕКСТ на договор и списък от установени правни проблеми и липсващи клаузи.
Задачата ти: пренапиши договора, като отстраниш проблемите и добавиш липсващите стандартни клаузи. Запази стила, езика и структурата на оригинала, но направи го юридически по-стабилен и балансиран.
Връщай СТРОГО валиден JSON:
{
  "corrected_text": "пълен текст на коригирания договор, с номерация и заглавия по римски/арабски номера",
  "changes": ["кратко описание на всяка ключова промяна"]
}
Никакви markdown ограждания. Всички парични суми са в евро (€).`;

const DAILY_LIMIT = 30;

function extractJson(s: string): any {
  let cleaned = s.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = cleaned.search(/[\{\[]/);
  const openCh = start !== -1 ? cleaned[start] : "";
  const closeCh = openCh === "[" ? "]" : "}";
  const end = cleaned.lastIndexOf(closeCh);
  if (start !== -1 && end !== -1) cleaned = cleaned.substring(start, end + 1);
  try { return JSON.parse(cleaned); } catch {}
  cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]").replace(/[\x00-\x1F\x7F]/g, "");
  return JSON.parse(cleaned);
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCors(req);
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

    const { data: q } = await admin.from("download_quota")
      .select("plan, pro_until").eq("user_id", userId).maybeSingle();
    const isPro = !!q && (q.plan === "pro" || (!!q.pro_until && new Date(q.pro_until) > new Date()));
    if (!isPro) {
      return new Response(JSON.stringify({ error: "pro_required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("function_name", "correct-uploaded")
      .eq("user_id", userId)
      .gte("created_at", since);
    if ((count ?? 0) >= DAILY_LIMIT) {
      return new Response(JSON.stringify({
        error: `Достигнахте дневния лимит от ${DAILY_LIMIT} корекции. Опитайте отново след 24 часа.`,
        code: "rate_limited",
      }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { uploadedContractId } = await req.json();
    if (!uploadedContractId) {
      return new Response(JSON.stringify({ error: "uploadedContractId липсва" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: contract } = await admin.from("uploaded_contracts")
      .select("id, user_id, extracted_text").eq("id", uploadedContractId).maybeSingle();
    if (!contract || contract.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: analysis } = await admin.from("risk_analyses")
      .select("issues, missing_clauses, summary, contract_type")
      .eq("uploaded_contract_id", uploadedContractId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY липсва");

    const issuesBlock = analysis?.issues?.length
      ? "ПРОБЛЕМНИ КЛАУЗИ:\n" + (analysis.issues as any[]).map((i, n) => `${n + 1}. [${i.severity}] ${i.title} — ${i.explanation}${i.suggestion ? ` | Препоръка: ${i.suggestion}` : ""}`).join("\n")
      : "";
    const missingBlock = analysis?.missing_clauses?.length
      ? "ЛИПСВАЩИ СТАНДАРТНИ КЛАУЗИ:\n" + (analysis.missing_clauses as any[]).map((m, n) => `${n + 1}. ${m.name} — ${m.why}`).join("\n")
      : "";

    const userPrompt = `ОРИГИНАЛЕН ДОГОВОР (текст):
${contract.extracted_text.slice(0, 30000)}

ТИП: ${analysis?.contract_type || "(неуточнен)"}
РЕЗЮМЕ: ${analysis?.summary || ""}

${issuesBlock}

${missingBlock}

Задача: пренапиши договора, като отстраниш проблемите и добавиш липсващите клаузи. Връщай само JSON.`;

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
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Лимитът е достигнат." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiResp.status === 402) return new Response(JSON.stringify({ error: "Изчерпани кредити." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("AI грешка");
    }

    await admin.from("ai_usage").insert({ user_id: userId, function_name: "correct-uploaded" });

    const raw = await aiResp.json();
    const content: string = raw.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) throw new Error("Празен AI отговор");
    const parsed = extractJson(content);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("correct-uploaded error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Неизвестна грешка" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
