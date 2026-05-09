// Edge function: AI risk analysis on a user-uploaded contract.
// Reads uploaded_contracts.extracted_text, calls Lovable AI Gateway, stores result in risk_analyses.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";

const SYSTEM_PROMPT = `Ти си водещ български правен експерт по договорно право (ЗЗД, ТЗ, ЗУТ, ЗЗП, ЗЗЛД).
Анализираш качен от потребителя договор и връщаш СТРОГО валиден JSON по схемата по-долу. Без markdown ограждания.
Тон: професионален, конкретен, на български език.

{
  "contract_type": "напр. Договор за наем на недвижим имот / Трудов договор / Договор за изработка",
  "summary": "2-4 изречения резюме на правната рамка и страните",
  "score": 1-10,  // 1 = крайно неблагоприятен / правно проблемен; 10 = балансиран и пълен
  "issues": [
    {
      "severity": "low" | "medium" | "high",
      "title": "Кратко заглавие на проблема",
      "clause": "цитат или кратко перифразиране на клаузата от договора (до 200 знака)",
      "explanation": "Защо това е проблем — позоваване на конкретна правна норма когато е приложимо",
      "suggestion": "Конкретен предложен заместващ текст или препоръка"
    }
  ],
  "missing_clauses": [
    { "name": "Напр. Форсмажор / Подсъдност / Неустойка / Конфиденциалност", "why": "Защо липсата ѝ е риск за страната" }
  ]
}

Правила:
- Score отразява баланс на правата, яснота, спазване на императивни норми и наличие на съществените клаузи.
- Идентифицирай поне 3-8 issues когато текстът го позволява. Ако договорът е чист — върни празен масив и обясни в summary.
- Mark high-severity само за реални правни рискове (нищожност, неизпълнима клауза, груба неравнопоставеност, противоречие с императивна норма).
- Винаги изброй основните липсващи стандартни клаузи (Форсмажор, Подсъдност, Частична недействителност, Неустойка/обезщетение, Прекратяване).
- Не измисляй съдържание което не присъства в договора.`;

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Auth required
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: u } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    const userId = u?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { uploadedContractId } = await req.json();
    if (!uploadedContractId || typeof uploadedContractId !== "string") {
      return new Response(JSON.stringify({ error: "uploadedContractId е задължителен" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load contract (RLS enforced via service role + manual user_id check)
    const { data: contract, error: cErr } = await admin
      .from("uploaded_contracts")
      .select("id, user_id, title, extracted_text, text_hash")
      .eq("id", uploadedContractId)
      .maybeSingle();

    if (cErr || !contract) {
      return new Response(JSON.stringify({ error: "Договорът не е намерен" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (contract.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text = (contract.extracted_text ?? "").trim();
    if (text.length < 80) {
      return new Response(JSON.stringify({ error: "Текстът на договора е твърде кратък за анализ." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Atomic quota consumption — prevents free-tier bypass via concurrent calls.
    // The RPC checks plan + counter and increments in a single SERIALIZABLE step.
    const { data: consumed, error: consumeErr } = await admin.rpc("consume_quota", { _kind: "analysis" });
    if (consumeErr) {
      console.error("consume_quota error:", consumeErr);
      throw new Error("Грешка при проверка на квотата");
    }
    const quotaResult = consumed as { ok: boolean; reason?: string; is_pro: boolean };
    const isPro = !!quotaResult?.is_pro;
    if (!quotaResult?.ok) {
      return new Response(
        JSON.stringify({
          error: "Изчерпали сте безплатния си анализ. Активирайте Pro за неограничени риск-анализи.",
          code: "quota_exceeded",
        }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY липсва");

    // Truncate very long contracts to keep token use reasonable (~30k chars ≈ 7-8k tokens)
    const MAX_CHARS = 30000;
    const truncated = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + "\n\n[...текстът е съкратен поради дължина...]" : text;

    const userPrompt = `Заглавие на документа: ${contract.title}

ТЕКСТ НА ДОГОВОРА:
"""
${truncated}
"""

Извърши пълен правен риск-анализ. Върни СТРОГО валиден JSON по схемата.`;

    const model = "google/gemini-2.5-pro";
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Достигнат е лимитът. Моля опитайте след малко." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Изчерпани са кредитите за AI." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResp.text();
      console.error("AI gateway:", aiResp.status, t);
      throw new Error("AI грешка");
    }

    const data = await aiResp.json();
    const content: string = data.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) throw new Error("AI не върна съдържание");

    const extractJson = (s: string): any => {
      let cleaned = s.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const start = cleaned.search(/[\{\[]/);
      const end = cleaned.lastIndexOf("}");
      if (start !== -1 && end !== -1) cleaned = cleaned.substring(start, end + 1);
      try { return JSON.parse(cleaned); } catch {}
      cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
      return JSON.parse(cleaned);
    };

    const parsed = extractJson(content);

    const score = Math.max(1, Math.min(10, Number(parsed.score) || 5));
    const issues = Array.isArray(parsed.issues) ? parsed.issues : [];
    const missing = Array.isArray(parsed.missing_clauses) ? parsed.missing_clauses : [];

    // Persist analysis
    const { data: inserted, error: insErr } = await admin
      .from("risk_analyses")
      .insert({
        uploaded_contract_id: contract.id,
        user_id: userId,
        model,
        score,
        contract_type: String(parsed.contract_type ?? "").slice(0, 200),
        summary: String(parsed.summary ?? "").slice(0, 4000),
        issues,
        missing_clauses: missing,
        text_hash: contract.text_hash ?? "",
      })
      .select()
      .single();

    if (insErr) {
      console.error("insert risk_analysis:", insErr);
      throw new Error("Грешка при запис на анализа");
    }

    // Quota was already consumed atomically before the AI call (see consume_quota above).

    await admin.from("ai_usage").insert({
      user_id: userId,
      function_name: "analyze-contract",
    });

    return new Response(JSON.stringify({ analysis: inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-contract error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Неизвестна грешка" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
