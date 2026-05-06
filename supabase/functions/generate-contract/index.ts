// Edge function: AI generation of risk analysis & contract
// Uses Lovable AI Gateway (Gemini) — no API key needed by user.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Ти си водещ български правен архитект и експерт по договорно право. 
Пишеш единствено на професионален български юридически език, в съответствие със ЗЗД, ТЗ, ЗУТ и приложимото законодателство.
Тонът ти е авторитетен, прецизен, без излишни излияния. Използваш правилните понятия: "Възложител", "Изпълнител", "Наемодател", "Наемател", "Продавач", "Купувач", "Страните", "Настоящият Договор" и др.

Винаги връщай СТРОГО валиден JSON със следната структура (без markdown ограждания):
{
  "risk": {
    "level": "low" | "medium" | "high",
    "score": 0-100,
    "summary": "кратко обобщение на 1-2 изречения",
    "issues": [
      { "severity": "low" | "medium" | "high", "title": "...", "detail": "конкретно правно обяснение и препоръка" }
    ],
    "recommendations": ["препоръка 1", "препоръка 2", "..."]
  },
  "contract": {
    "title": "Заглавие на договора",
    "preamble": "Днес, [ДАТА], в [ГРАД], между:\\n\\n1. [страна А с пълни данни] ...\\n\\n2. [страна Б с пълни данни] ...\\n\\nсе сключи настоящият договор за следното:",
    "clauses": [
      { "number": "I.", "title": "ПРЕДМЕТ НА ДОГОВОРА", "body": "Чл. 1. ...\\nЧл. 2. ..." },
      { "number": "II.", "title": "ЦЕНА И НАЧИН НА ПЛАЩАНЕ", "body": "..." }
    ],
    "closing": "Настоящият договор се състави и подписа в два еднообразни екземпляра — по един за всяка от страните."
  }
}

ЗАДЪЛЖИТЕЛНИ КЛАУЗИ:
- Предмет, Цена и плащане, Срокове, Права и задължения, Неустойки, Предсрочно прекратяване, Форсмажор (непреодолима сила), Конфиденциалност (където е приложимо), Подсъдност (Софийски градски съд / Арбитраж при БТПП), Частична недействителност (Severability), Заключителни разпоредби.
- Използвай номерация с римски за раздели и арабска "Чл. N." за членове, "(1), (2)" за алинеи.
- Когато данните са непълни, използвай ясни плейсхолдъри в квадратни скоби: [ЕИК], [Адрес], [ЕГН], [Дата].
- Всички парични суми се изписват в евро (€). Когато потребителят е дал стойност без валута, приеми, че е в €. Не използвай "лв.", "BGN" или "USD".
- Анализът на риска трябва да отразява РЕАЛНИ слаби места според дадените отговори (напр. липсващо обезпечение при аванс, твърде нисък размер на неустойката, неясен предмет).`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sector, contractName, parties, answers, questions } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY липсва");

    // Build a readable Q&A summary for the model
    const qaLines = (questions as Array<{ id: string; label: string }>)
      .map((q) => `- ${q.label}: ${answers[q.id] ?? "(не е попълнено)"}`)
      .join("\n");

    const userPrompt = `СЕКТОР: ${sector}
ТИП ДОГОВОР: ${contractName}
СТРАНИ: ${parties.a} ↔ ${parties.b}

ОТГОВОРИ ОТ ИНТЕРВЮТО:
${qaLines}

Задача:
1) Извърши Risk Analysis — посочи конкретни слаби места за ${parties.a} и ${parties.b}.
2) Генерирай ПЪЛНИЯ договор на български, с всички задължителни клаузи (вкл. частична недействителност и подсъдност).
Върни СТРОГО валиден JSON по описаната схема.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
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
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Достигнат е лимитът. Моля опитайте след малко." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "Изчерпани са кредитите за AI. Моля заредете акаунта." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await aiResp.text();
      console.error("AI gateway:", aiResp.status, t);
      throw new Error("AI грешка");
    }

    const rawText = await aiResp.text();
    if (!rawText) throw new Error("Празен отговор от AI");

    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch {
      console.error("AI raw (not JSON):", rawText.slice(0, 500));
      throw new Error("AI върна невалиден JSON отговор");
    }

    const content: string = data.choices?.[0]?.message?.content ?? "";
    if (!content || !content.trim()) {
      console.error("AI empty content. Full data:", JSON.stringify(data).slice(0, 500));
      throw new Error("AI не върна съдържание (вероятно прекъснат отговор). Опитайте отново.");
    }

    const extractJson = (s: string): any => {
      let cleaned = s.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const start = cleaned.search(/[\{\[]/);
      const openCh = start !== -1 ? cleaned[start] : "";
      const closeCh = openCh === "[" ? "]" : "}";
      const end = cleaned.lastIndexOf(closeCh);
      if (start !== -1 && end !== -1) cleaned = cleaned.substring(start, end + 1);
      try { return JSON.parse(cleaned); } catch {}
      cleaned = cleaned.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]").replace(/[\x00-\x1F\x7F]/g, "");
      try { return JSON.parse(cleaned); } catch {}
      // Repair unbalanced
      let braces = 0, brackets = 0;
      for (const c of cleaned) {
        if (c === "{") braces++; else if (c === "}") braces--;
        if (c === "[") brackets++; else if (c === "]") brackets--;
      }
      while (brackets-- > 0) cleaned += "]";
      while (braces-- > 0) cleaned += "}";
      return JSON.parse(cleaned);
    };

    let parsed;
    try {
      parsed = extractJson(content);
    } catch (err) {
      console.error("JSON parse failed. Content head:", content.slice(0, 800));
      throw new Error("AI отговорът не може да бъде анализиран като JSON");
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-contract error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Неизвестна грешка" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
