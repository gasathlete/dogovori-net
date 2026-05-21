// AI generation of a custom (free-form) contract from minimal user inputs.
// Uses Lovable AI Gateway (Gemini). Same response shape as generate-contract:
// { risk: { level, score, summary, issues, recommendations }, contract: { title, preamble, clauses, closing } }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { buildCors, hashIp, clientIp } from "../_shared/cors.ts";
import { sha256Hex, stableStringify } from "../_shared/normalize.ts";
import { extractJson } from "../_shared/json.ts";
import { loadActivePrompt } from "../_shared/prompt-loader.ts";

const SYSTEM_PROMPT = `Ти си български правен архитект. Пишеш на професионален юридически български (ЗЗД, ТЗ, ЗУТ). Използваш правилните понятия (Възложител/Изпълнител, Наемодател/Наемател, Продавач/Купувач, Страните, Настоящият Договор).

Потребителят е дал свободно описание на договора. Може да е оставил някои секции празни — за тях измисли пазарно-стандартни клаузи, подходящи за категорията. Никога не питай — попълвай разумно и пълно.

Връщай СТРОГО валиден JSON (без markdown ограждания):
{
  "risk": {
    "level": "low"|"medium"|"high",
    "score": 0-100,
    "summary": "1-2 изречения",
    "issues": [{"severity":"low"|"medium"|"high","title":"...","detail":"правно обяснение и препоръка"}],
    "recommendations": ["..."]
  },
  "contract": {
    "title": "...",
    "preamble": "Днес, [ДАТА], в [ГРАД], между:\\n\\n1. [страна А] ...\\n\\n2. [страна Б] ...\\n\\nсе сключи настоящият договор:",
    "clauses": [{"number":"I.","title":"ПРЕДМЕТ","body":"Чл. 1. ...\\nЧл. 2. ..."}],
    "closing": "Настоящият договор се състави в два еднообразни екземпляра — по един за всяка страна."
  }
}

Задължителни клаузи: Предмет, Цена и плащане, Срокове, Права и задължения, Неустойки, Прекратяване, Форсмажор, Конфиденциалност (ако е приложимо), Подсъдност (СГС/Арбитраж БТПП), Частична недействителност, Заключителни.
Номерация: римска за раздели, "Чл. N." за членове, "(1),(2)" за алинеи. Парични суми само в евро (€). Липсващи данни → плейсхолдъри в [квадратни скоби].`;

interface BuildPayload {
  name: string;
  category: string; // human-readable
  categorySectorId?: string | null;
  partiesA: string[]; // list of "Възложители"
  partiesB: string[]; // list of "Изпълнители"
  subject?: string;
  term?: string;
  prices?: string;
  obligations?: string;
  other?: string;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization") ?? "";
    let userId: string | null = null;
    let authDiag: { kid?: string; alg?: string; method?: string; reason?: string } = {};

    if (!authHeader.startsWith("Bearer ")) {
      authDiag.reason = "missing_bearer";
      console.warn("[build-custom-contract] auth fail:", authDiag);
    } else {
      const token = authHeader.replace("Bearer ", "").trim();

      // Decode JWT header for diagnostics (kid/alg) — no verification here.
      try {
        const headerB64 = token.split(".")[0];
        const padded = headerB64 + "=".repeat((4 - (headerB64.length % 4)) % 4);
        const headerJson = JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
        authDiag.kid = headerJson.kid;
        authDiag.alg = headerJson.alg;
      } catch (e) {
        authDiag.reason = "header_decode_failed";
        console.warn("[build-custom-contract] could not decode JWT header:", e);
      }

      // Prefer getClaims() — works with the signing-keys (ES256) auth system.
      try {
        const { data: claimsData, error: claimsErr } = await admin.auth.getClaims(token);
        if (claimsErr) {
          authDiag.reason = `getClaims:${claimsErr.message}`;
        } else if (claimsData?.claims?.sub) {
          userId = claimsData.claims.sub as string;
          authDiag.method = "getClaims";
        }
      } catch (e) {
        authDiag.reason = `getClaims_threw:${e instanceof Error ? e.message : String(e)}`;
      }

      // Fallback for legacy HS256 tokens.
      if (!userId) {
        try {
          const { data: u, error: uErr } = await admin.auth.getUser(token);
          if (uErr) {
            authDiag.reason = (authDiag.reason ?? "") + `|getUser:${uErr.message}`;
          } else if (u?.user?.id) {
            userId = u.user.id;
            authDiag.method = "getUser";
          }
        } catch (e) {
          authDiag.reason = (authDiag.reason ?? "") + `|getUser_threw:${e instanceof Error ? e.message : String(e)}`;
        }
      }
    }

    if (!userId) {
      console.warn("[build-custom-contract] 401 auth_required:", authDiag);
      return new Response(
        JSON.stringify({
          error: "За да изградите договор, влезте безплатно с email или Google.",
          code: "auth_required",
          requires_login: true,
          diag: authDiag,
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    console.log("[build-custom-contract] auth ok:", { userId, ...authDiag });

    const ipHash = await hashIp(clientIp(req));
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("function_name", "build-custom-contract")
      .gte("created_at", since)
      .eq("user_id", userId);
    if ((count ?? 0) >= 5) {
      return new Response(
        JSON.stringify({
          error: "Достигнахте дневния лимит от 5 генерации. Опитайте утре или вземете Pro.",
          code: "rate_limited",
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = (await req.json()) as BuildPayload;
    const {
      name = "",
      category = "",
      categorySectorId = null,
      partiesA = [],
      partiesB = [],
      subject = "",
      term = "",
      prices = "",
      obligations = "",
      other = "",
    } = body;

    if (!name.trim() || !category.trim()) {
      return new Response(
        JSON.stringify({ error: "Името и категорията са задължителни." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY липсва");

    // Cache key includes everything that affects output.
    const PROMPT_VERSION = "v1";
    const cacheKeyInput = stableStringify({
      v: PROMPT_VERSION, kind: "custom",
      name, category,
      partiesA, partiesB,
      subject, term, prices, obligations, other,
    });
    const cacheHash = await sha256Hex(cacheKeyInput);
    const cacheCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: cachedRow } = await admin
      .from("template_cache")
      .select("payload")
      .eq("hash", cacheHash)
      .gte("created_at", cacheCutoff)
      .maybeSingle();
    if (cachedRow?.payload) {
      // Skip blank-extraction on cache hit (likely already done).
      return new Response(JSON.stringify(cachedRow.payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const partiesAList = (partiesA.length ? partiesA : ["[Страна А]"]).map((p, i) => `  ${i + 1}. ${p}`).join("\n");
    const partiesBList = (partiesB.length ? partiesB : ["[Страна Б]"]).map((p, i) => `  ${i + 1}. ${p}`).join("\n");

    const userPrompt = `КАТЕГОРИЯ: ${category}
ИМЕ НА ДОГОВОРА: ${name}

ВЪЗЛОЖИТЕЛ/И:
${partiesAList}

ИЗПЪЛНИТЕЛ/И:
${partiesBList}

${subject ? `ПРЕДМЕТ:\n${subject}\n` : "ПРЕДМЕТ: (не е посочен — измисли подходящ за категорията)\n"}
${term ? `СРОК:\n${term}\n` : "СРОК: (не е посочен — приложи стандартен за категорията)\n"}
${prices ? `ЦЕНИ И ПЛАЩАНЕ:\n${prices}\n` : "ЦЕНИ И ПЛАЩАНЕ: (не са посочени — приложи стандартен модел в евро)\n"}
${obligations ? `ЗАДЪЛЖЕНИЯ:\n${obligations}\n` : "ЗАДЪЛЖЕНИЯ: (не са посочени — измисли пазарно-стандартни)\n"}
${other ? `ДРУГИ КЛАУЗИ / СПЕЦИФИКИ:\n${other}\n` : "ДРУГИ КЛАУЗИ: (без специфики — приложи стандартни заключителни)\n"}

Задача: Risk Analysis (конкретни слаби места за двете страни) + ПЪЛНИЯТ договор на български с всички задължителни клаузи. Върни СТРОГО валиден JSON по схемата.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Достигнат е лимитът. Моля опитайте след малко." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Изчерпани са кредитите за AI. Моля заредете акаунта." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const t = await aiResp.text();
      console.error("AI gateway:", aiResp.status, t);
      throw new Error("AI грешка");
    }

    await admin.from("ai_usage").insert({
      user_id: userId,
      ip_hash: null,
      function_name: "build-custom-contract",
    });

    const rawText = await aiResp.text();
    if (!rawText) throw new Error("Празен отговор от AI");

    let data: any;
    try { data = JSON.parse(rawText); } catch {
      console.error("AI raw (not JSON):", rawText.slice(0, 500));
      throw new Error("AI върна невалиден JSON отговор");
    }

    const content: string = data.choices?.[0]?.message?.content ?? "";
    if (!content || !content.trim()) {
      throw new Error("AI не върна съдържание. Опитайте отново.");
    }

    let parsed: { risk: any; contract: any };
    try { parsed = extractJson(content); }
    catch {
      console.error("JSON parse failed. Content head:", content.slice(0, 800));
      throw new Error("AI отговорът не може да бъде анализиран като JSON");
    }

    // Cache successful result.
    try {
      await admin.from("template_cache").upsert({ hash: cacheHash, payload: parsed, created_at: new Date().toISOString() });
    } catch (e) { console.error("template_cache upsert:", e); }

    // Fire-and-forget: anonymise + persist as a candidate blank for admin review.
    // We do NOT await this so the user's response is fast.
    EdgeRuntime?.waitUntil?.(
      anonymiseAndStoreBlank(admin, {
        name, category, categorySectorId,
        contract: parsed.contract,
        userId,
        LOVABLE_API_KEY,
      }).catch((e) => console.error("anonymiseAndStoreBlank failed:", e))
    );

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("build-custom-contract error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Неизвестна грешка" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

const ANON_SYSTEM = `Ти си редактор на правни шаблони. Получаваш JSON на договор и връщаш СЪЩИЯ JSON, но със заменени конкретни данни (имена на лица/фирми, ЕГН/ЕИК, точни суми, точни дати, конкретни адреси, телефони, email, IBAN, специфични продукти/услуги) с плейсхолдъри в квадратни скоби: [Възложител], [Изпълнител], [сума в €], [срок], [дата], [адрес], [предмет на договора] и т.н. Запази структурата, номерацията, всички клаузи и общите формулировки. Върни СТРОГО валиден JSON със същата схема: {"title":"...","preamble":"...","clauses":[{"number":"...","title":"...","body":"..."}],"closing":"..."}.`;

async function anonymiseAndStoreBlank(
  admin: ReturnType<typeof createClient>,
  args: {
    name: string;
    category: string;
    categorySectorId: string | null;
    contract: { title: string; preamble: string; clauses: any[]; closing: string };
    userId: string;
    LOVABLE_API_KEY: string;
  },
) {
  const { name, category, categorySectorId, contract, userId, LOVABLE_API_KEY } = args;

  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        { role: "system", content: ANON_SYSTEM },
        { role: "user", content: JSON.stringify(contract) },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!aiResp.ok) { console.error("anon ai status:", aiResp.status); return; }
  const data = await aiResp.json();
  const content: string = data.choices?.[0]?.message?.content ?? "";
  if (!content.trim()) return;

  let blank: any;
  try { blank = extractJson(content); } catch (e) { console.error("anon parse:", e); return; }

  // Hash on the anonymised text to dedupe similar blanks.
  const text = [blank.title, blank.preamble, ...(blank.clauses ?? []).map((c: any) => `${c.number} ${c.title} ${c.body}`), blank.closing].join("\n");
  const text_hash = await sha256Hex(text.replace(/\s+/g, " ").trim().toLowerCase());

  // Try insert; on conflict (duplicate text_hash) increment occurrences.
  const { error: insErr } = await admin.from("custom_contract_blanks").insert({
    source_user_id: userId,
    category,
    category_sector_id: categorySectorId,
    name,
    text_hash,
    blank_payload: blank,
  });
  if (insErr && (insErr as any).code === "23505") {
    // Duplicate — bump occurrences.
    await admin.rpc("noop_no_such_fn").catch(() => {});
    const { data: existing } = await admin
      .from("custom_contract_blanks")
      .select("id, occurrences")
      .eq("text_hash", text_hash)
      .maybeSingle();
    if (existing) {
      await admin
        .from("custom_contract_blanks")
        .update({ occurrences: (existing.occurrences ?? 1) + 1 })
        .eq("id", existing.id);
    }
  } else if (insErr) {
    console.error("blank insert error:", insErr);
  }
}
