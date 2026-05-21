// Admin-only AI article generator. Mirrors scripts/generate-blog.ts but writes
// the result into the user_articles table as an approved 'admin' article.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";
import { loadActivePrompt } from "../_shared/prompt-loader.ts";

const TEXT_MODEL = "google/gemini-2.5-pro";
const IMAGE_MODEL = "google/gemini-2.5-flash-image";
const ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface ArticleJson {
  intro: string;
  sections: { heading: string; body: string }[];
  faq: { q: string; a: string }[];
  takeaways: string[];
  metaDescription: string;
  summary: string;
  title: string;
}

interface AdminInput {
  topic: string;
  category: string;
  sectorId?: string;
  mandatoryText: string;
  imagePrompt?: string;
}

const SYSTEM = `Ти си български юрист с 15 години опит и експерт по SEO съдържание. Пишеш ясно, точно, на правен български. Цитираш конкретни членове от ЗЗД, ТЗ, КТ, ЗУТ, ЗЗП, ЗДДС, СК, ЗЗЛД/GDPR. Никога не измисляш членове или закони. Използваш активен глас, кратки изречения, естествено разпределени ключови думи без stuffing. Между 1200 и 1800 думи общо.`;

function buildArticlePrompt(t: AdminInput): string {
  return `Напиши SEO-оптимизирана блог статия за dogovori.net на тема:

Тема / Заглавие: "${t.topic}"
Категория: "${t.category}"
Сектор (ако е приложим): "${t.sectorId ?? "—"}"

ЗАДЪЛЖИТЕЛЕН ТЕКСТ (трябва да бъде интегриран дословно или близко до дословно някъде в статията — например в подходяща секция или в специален параграф):
"""
${t.mandatoryText}
"""

Върни СТРОГО JSON със следната структура (без markdown, без обяснения):
{
  "title": "Окончателно заглавие (може да е същото или редактиран вариант на темата)",
  "summary": "1-2 изречения, до 200 символа, като тийзър",
  "metaDescription": "150-160 символа, естествено включваща ключовата фраза, активен глас",
  "intro": "2-3 параграфа въведение (по 3-5 изречения)",
  "sections": [
    { "heading": "Секционно заглавие", "body": "3-5 параграфа с конкретни цитирания на закони, примери, цифри" }
  ],
  "faq": [{"q": "Въпрос?", "a": "1-3 изречения"}],
  "takeaways": ["3-5 ключови извода"]
}

Изисквания:
- 4-7 sections общо
- 4-6 faq въпроса
- Между 1200 и 1800 думи общо
- Никакви markdown символи в стойностите (без **, #, -, > и т.н.)
- Параграфите се разделят с двоен \\n\\n
- Цитирай конкретни членове на закони когато е приложимо
- Не споменавай dogovori.net в самия текст`;
}

async function generateText(input: AdminInput, apiKey: string): Promise<ArticleJson | null> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: TEXT_MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: buildArticlePrompt(input) },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    console.error("text_gen_failed", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) return null;
  try {
    return JSON.parse(text) as ArticleJson;
  } catch {
    return null;
  }
}

async function generateImage(prompt: string, apiKey: string): Promise<Uint8Array | null> {
  const fullPrompt = `${prompt}. Editorial magazine cover composition, 16:9, photographic realism, no text overlays, no watermarks, no faces, no logos.`;
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      messages: [{ role: "user", content: fullPrompt }],
      modalities: ["image", "text"],
    }),
  });
  if (!res.ok) {
    console.error("image_gen_failed", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  const url: string | undefined = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url || !url.startsWith("data:")) return null;
  const base64 = url.split(",", 2)[1];
  const binary = atob(base64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf;
}

function slugify(s: string): string {
  const map: Record<string, string> = {
    "а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ж":"zh","з":"z","и":"i","й":"y","к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f","х":"h","ц":"ts","ч":"ch","ш":"sh","щ":"sht","ъ":"a","ь":"y","ю":"yu","я":"ya"
  };
  return s.toLowerCase().split("").map((c) => map[c] ?? c).join("")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "statia";
}

function countWords(s: string): number {
  return (s.match(/\S+/g) ?? []).length;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: u } = await admin.auth.getUser(auth.replace("Bearer ", ""));
    const userId = u?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: staff } = await admin.rpc("is_staff", { _user_id: userId });
    if (!staff) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "ai_not_configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const input = await req.json() as AdminInput;
    if (!input.topic || !input.category || !input.mandatoryText || input.mandatoryText.trim().length < 30) {
      return new Response(JSON.stringify({ error: "validation_failed", details: ["Тема, категория и задължителен текст (мин. 30 знака) са нужни."] }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const article = await generateText(input, apiKey);
    if (!article || !article.intro || !Array.isArray(article.sections) || article.sections.length < 3) {
      return new Response(JSON.stringify({ error: "ai_text_failed" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate hero image
    const imgPrompt = input.imagePrompt
      ?? `Symbolic legal illustration for: ${input.topic}, Bulgarian jurisprudence, modern editorial style.`;
    const imageBytes = await generateImage(imgPrompt, apiKey);

    let imageUrl = "";
    const baseSlug = slugify(article.title || input.topic);
    let slug = baseSlug;
    for (let i = 2; i < 50; i++) {
      const { data: exists } = await admin.from("user_articles").select("id").eq("slug", slug).maybeSingle();
      if (!exists) break;
      slug = `${baseSlug}-${i}`;
    }

    if (imageBytes) {
      const path = `${userId}/admin/${slug}.jpg`;
      const { error: upErr } = await admin.storage.from("user-articles")
        .upload(path, imageBytes, { contentType: "image/jpeg", upsert: true });
      if (!upErr) {
        const { data: pub } = admin.storage.from("user-articles").getPublicUrl(path);
        imageUrl = pub.publicUrl;
      }
    }
    if (!imageUrl) {
      // Fallback to a placeholder so insert succeeds (NOT NULL field)
      imageUrl = "https://dogovori.net/og-image.jpg";
    }

    const fullText = [
      article.intro,
      ...article.sections.map((s) => `${s.heading}\n${s.body}`),
      ...(article.faq ?? []).map((f) => `${f.q}\n${f.a}`),
      ...(article.takeaways ?? []),
    ].join("\n\n");
    const wc = countWords(fullText);

    const { data: created, error } = await admin.from("user_articles").insert({
      user_id: userId,
      slug,
      title: (article.title || input.topic).trim(),
      category: input.category,
      summary: (article.summary || "").trim().slice(0, 250),
      meta_description: (article.metaDescription || "").trim().slice(0, 160),
      image_url: imageUrl,
      intro: article.intro,
      sections: article.sections,
      faq: article.faq ?? [],
      takeaways: article.takeaways ?? [],
      word_count: wc,
      source: "admin",
      status: "approved",
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      published_at: new Date().toISOString(),
    }).select("id, slug").single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true, id: created.id, slug: created.slug }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
