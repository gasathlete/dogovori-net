// Submit a user-authored blog article. Pro plan required.
// Performs validation (>=300 words, image, legal category) and inserts as 'pending'.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";

interface Section { heading: string; body: string }
interface Faq { q: string; a: string }

interface Payload {
  title: string;
  category: string;
  summary: string;
  imageUrl: string;
  intro: string;
  sections: Section[];
  faq?: Faq[];
  takeaways?: string[];
}

const ALLOWED_CATEGORIES = [
  "Договорно право",
  "Трудово право",
  "Търговско право",
  "Имоти",
  "Семейно право",
  "Данъци",
  "GDPR / Защита на данните",
  "Електронна търговия",
  "Защита на потребителите",
  "Финанси и заеми",
  "Интелектуална собственост",
  "Други",
];

function countWords(s: string): number {
  return (s.match(/\S+/g) ?? []).length;
}

function slugify(s: string): string {
  const map: Record<string, string> = {
    "а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ж":"zh","з":"z","и":"i","й":"y","к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f","х":"h","ц":"ts","ч":"ch","ш":"sh","щ":"sht","ъ":"a","ь":"y","ю":"yu","я":"ya"
  };
  return s.toLowerCase()
    .split("")
    .map((c) => map[c] ?? c)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "statia";
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

    // Pro check
    const { data: q } = await admin.from("download_quota")
      .select("plan, pro_until").eq("user_id", userId).maybeSingle();
    const isPro = q?.plan === "pro" || (q?.pro_until && new Date(q.pro_until) > new Date());
    if (!isPro) {
      return new Response(JSON.stringify({ error: "pro_required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as Payload;
    const errors: string[] = [];
    if (!body.title || body.title.trim().length < 8) errors.push("Заглавието трябва да е поне 8 символа.");
    if (!body.category || !ALLOWED_CATEGORIES.includes(body.category)) errors.push("Невалидна категория.");
    if (!body.imageUrl || !/^https?:\/\//.test(body.imageUrl)) errors.push("Изисква се изображение.");
    if (!body.intro || !Array.isArray(body.sections) || body.sections.length === 0)
      errors.push("Статията трябва да има въведение и поне една секция.");
    if (!body.summary || body.summary.trim().length < 30) errors.push("Резюмето трябва да е поне 30 символа.");

    const fullText = [
      body.intro ?? "",
      ...(body.sections ?? []).map((s) => `${s.heading}\n${s.body}`),
      ...(body.faq ?? []).map((f) => `${f.q}\n${f.a}`),
      ...(body.takeaways ?? []),
    ].join("\n\n");
    const wc = countWords(fullText);
    if (wc < 300) errors.push(`Статията трябва да е поне 300 думи (има ${wc}).`);
    if (wc > 5000) errors.push(`Статията не може да е над 5000 думи (има ${wc}).`);

    if (errors.length > 0) {
      return new Response(JSON.stringify({ error: "validation_failed", details: errors }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build unique slug
    let baseSlug = slugify(body.title);
    let slug = baseSlug;
    for (let i = 2; i < 50; i++) {
      const { data: exists } = await admin.from("user_articles").select("id").eq("slug", slug).maybeSingle();
      if (!exists) break;
      slug = `${baseSlug}-${i}`;
    }

    const insertRow = {
      user_id: userId,
      slug,
      title: body.title.trim(),
      category: body.category,
      summary: body.summary.trim(),
      meta_description: body.summary.trim().slice(0, 160),
      image_url: body.imageUrl,
      intro: body.intro.trim(),
      sections: body.sections,
      faq: body.faq ?? [],
      takeaways: body.takeaways ?? [],
      word_count: wc,
      source: "user" as const,
      status: "pending" as const,
    };

    const { data: created, error } = await admin.from("user_articles").insert(insertRow).select("id, slug").single();
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
