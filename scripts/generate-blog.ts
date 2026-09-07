// Generates a DRAFT SEO article + editorial hero image for each blog topic.
//
// IMPORTANT — editorial policy:
//   * Generated article modules are ALWAYS explicit drafts
//     (status: "draft", reviewStatus: "unreviewed", no publishedAt).
//     Nothing generated here is publicly routable; src/lib/blog.ts filters drafts out.
//   * Article text is generated ONLY for topics with an editorially supplied
//     source pack (>= 2 HTTPS official sources, each with a grounding note).
//     Topics without a source pack are skipped — fail closed, no guessing.
//   * Publication requires a human source-check and an explicit editorial change
//     to the module (add publishedAt / reviewedAt / reviewStatus: "source-checked").
//
// Output:
//   src/content/blog/<slug>.ts  — typed draft article module
//   public/blog/<slug>.jpg      — editorial hero image (1280x720)
//
// Resumable: skips topics whose article + image already exist on disk.
// Usage: bun run scripts/generate-blog.ts
//
// Env: LOVABLE_API_KEY must be set.

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { Buffer } from "node:buffer";
import { BLOG_TOPICS, type BlogTopic, type BlogTopicSource } from "../src/data/blogTopics";

const API_KEY = process.env.LOVABLE_API_KEY;
if (!API_KEY) {
  console.error("LOVABLE_API_KEY not set");
  process.exit(1);
}

const TEXT_MODEL = "google/gemini-2.5-pro";
const IMAGE_MODEL = "google/gemini-2.5-flash-image";
const ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";

/** Minimum curated official sources required before any text is generated. */
export const MIN_SOURCE_PACK_SIZE = 2;

interface ArticleJson {
  intro: string; // 2-3 paragraphs
  sections: { heading: string; body: string }[]; // 4-7 sections
  faq: { q: string; a: string }[]; // 4-6
  takeaways: string[]; // 3-5 bullet points
  metaDescription: string; // 150-160 chars
}

export interface SourcePackCheck {
  ok: boolean;
  reason?: string;
  sources: readonly BlogTopicSource[];
}

/**
 * Fail-closed validation of an editorially supplied source pack.
 * Domain allowlists are NOT grounding: every source needs a real note.
 */
export function validateSourcePack(topic: {
  sourcePack?: readonly BlogTopicSource[];
}): SourcePackCheck {
  const sources = topic.sourcePack ?? [];
  if (sources.length < MIN_SOURCE_PACK_SIZE) {
    return {
      ok: false,
      reason: `source pack missing: needs >= ${MIN_SOURCE_PACK_SIZE} curated official sources, got ${sources.length}`,
      sources,
    };
  }
  for (const s of sources) {
    if (!s.url.startsWith("https://")) {
      return { ok: false, reason: `source URL is not HTTPS: ${s.url}`, sources };
    }
    if (!s.title.trim()) {
      return { ok: false, reason: `source missing title: ${s.url}`, sources };
    }
    if (!s.note || !s.note.trim()) {
      return { ok: false, reason: `source missing grounding note: ${s.url}`, sources };
    }
  }
  return { ok: true, sources };
}

/** Actual UTC generation date, YYYY-MM-DD. No synthetic or backdated values. */
export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

const SYSTEM = `Ти си редакционен асистент, който подготвя ЧЕРНОВИ на статии на правен български език за последваща редакционна проверка. Не си юрист и не твърдиш професионален опит или квалификация. Пишеш ясно, точно, с активен глас и кратки изречения, без keyword stuffing. Позоваваш се на нормативни разпоредби САМО когато това следва пряко от предоставените официални източници и бележките към тях. Никога не измисляш закон, член, алинея, съдебно решение или срок. Ако нещо не се потвърждава от предоставените източници, го посочваш изрично като несигурно вместо да предполагаш. Между 1200 и 1800 думи общо.`;

function formatSourcePack(sources: readonly BlogTopicSource[]): string {
  return sources.map((s, i) => `${i + 1}. ${s.title} — ${s.url}\n   Обхват: ${s.note}`).join("\n");
}

function buildArticlePrompt(t: BlogTopic, sources: readonly BlogTopicSource[]): string {
  return `Подготви ЧЕРНОВА на SEO статия за dogovori.net на тема:

Заглавие: "${t.title}"
Главна ключова дума: "${t.keyword}"
Категория: "${t.category}"

Разрешени официални източници (единствената допустима основа за правни твърдения):
${formatSourcePack(sources)}

Върни СТРОГО JSON със следната структура (без markdown, без обяснения):
{
  "metaDescription": "150-160 символа, естествено включваща ключовата дума, активен глас",
  "intro": "2-3 параграфа въведение (по 3-5 изречения), естествено включващи ключовата дума, без клишета",
  "sections": [
    { "heading": "Секционно заглавие като въпрос или твърдение", "body": "3-5 параграфа с конкретни примери" }
  ],
  "faq": [{"q": "Въпрос?", "a": "1-3 изречения"}],
  "takeaways": ["3-5 ключови извода в по 1 изречение"]
}

Изисквания:
- 4-7 sections общо
- 4-6 faq въпроса
- Общо между 1200 и 1800 думи (sum от intro + всички sections + faq + takeaways)
- Никакви markdown символи в стойностите (без **, #, -, > и т.н.)
- Параграфите се разделят с двоен \\n\\n
- Цитирай нормативна разпоредба само ако е покрита от обхвата на изброените източници; в противен случай формулирай общо и отбележи, че въпросът изисква проверка
- Не измисляй закони, членове, срокове, суми или съдебна практика
- Не споменавай dogovori.net в самия текст`;
}

async function generateArticle(
  t: BlogTopic,
  sources: readonly BlogTopicSource[],
): Promise<ArticleJson | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          model: TEXT_MODEL,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: buildArticlePrompt(t, sources) },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (res.status === 429) {
        console.warn(`  rate limited, waiting 15s...`);
        await new Promise((r) => setTimeout(r, 15000));
        continue;
      }
      if (!res.ok) {
        console.error(`  text HTTP ${res.status}: ${await res.text()}`);
        return null;
      }
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) return null;
      const parsed = JSON.parse(text) as ArticleJson;
      if (!parsed.intro || !Array.isArray(parsed.sections) || parsed.sections.length < 3) {
        console.warn(`  invalid article structure, retry`);
        continue;
      }
      return parsed;
    } catch (e: any) {
      console.error(`  text error: ${e.message}, retry ${attempt + 1}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return null;
}

async function generateImage(t: BlogTopic, outPath: string): Promise<boolean> {
  const prompt = `${t.imagePrompt}. Editorial magazine cover composition, 16:9 aspect ratio, photographic realism, no text overlays, no watermarks, no faces, no logos, professional color grading.`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          model: IMAGE_MODEL,
          messages: [{ role: "user", content: prompt }],
          modalities: ["image", "text"],
        }),
      });
      if (res.status === 429) {
        console.warn(`  image rate limited, waiting 15s...`);
        await new Promise((r) => setTimeout(r, 15000));
        continue;
      }
      if (!res.ok) {
        console.error(`  image HTTP ${res.status}: ${await res.text()}`);
        return false;
      }
      const data = await res.json();
      const url: string | undefined = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (!url || !url.startsWith("data:")) {
        console.error(`  no image data returned`);
        return false;
      }
      const base64 = url.split(",", 2)[1];
      const buf = Buffer.from(base64, "base64");
      writeFileSync(outPath, buf);
      return true;
    } catch (e: any) {
      console.error(`  image error: ${e.message}, retry ${attempt + 1}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return false;
}

/**
 * Serializes a DRAFT module. Never emits publishedAt/reviewedAt/modifiedAt,
 * so generation can never auto-publish.
 */
export function serializeDraftArticle(
  t: BlogTopic,
  a: ArticleJson,
  image: string,
  draftedAt: string,
  sources: readonly BlogTopicSource[],
): string {
  const json = JSON.stringify(
    {
      slug: t.slug,
      title: t.title,
      keyword: t.keyword,
      category: t.category,
      summary: t.summary,
      metaDescription: a.metaDescription,
      image,
      status: "draft",
      reviewStatus: "unreviewed",
      draftedAt,
      sources,
      intro: a.intro,
      sections: a.sections,
      faq: a.faq,
      takeaways: a.takeaways,
    },
    null,
    2,
  );
  return `// AUTO-GENERATED DRAFT by scripts/generate-blog.ts. Do not edit by hand.
// Requires a human source-check and explicit editorial publication
// (add publishedAt, reviewedAt and reviewStatus: "source-checked") before it becomes visible.
import type { BlogPostModule } from "@/lib/blog";

export const POST: BlogPostModule = ${json} as const;
`;
}

async function main() {
  const articleDir = resolve(process.cwd(), "src/content/blog");
  const imageDir = resolve(process.cwd(), "public/blog");
  if (!existsSync(articleDir)) mkdirSync(articleDir, { recursive: true });
  if (!existsSync(imageDir)) mkdirSync(imageDir, { recursive: true });

  let total = 0,
    generated = 0,
    skipped = 0,
    blocked = 0,
    failed = 0;

  for (let i = 0; i < BLOG_TOPICS.length; i++) {
    const topic = BLOG_TOPICS[i];
    total++;
    const articlePath = resolve(articleDir, `${topic.slug}.ts`);
    const imagePath = resolve(imageDir, `${topic.slug}.jpg`);
    const hasArticle = existsSync(articlePath);
    const hasImage = existsSync(imagePath);
    if (hasArticle && hasImage) {
      skipped++;
      continue;
    }

    console.log(`[${i + 1}/${BLOG_TOPICS.length}] ${topic.title}`);

    let article: ArticleJson | null = null;
    let check: SourcePackCheck | null = null;
    if (!hasArticle) {
      check = validateSourcePack(topic);
      if (!check.ok) {
        blocked++;
        console.warn(`  ⊘ skipped, no editorial grounding — ${check.reason}`);
        continue;
      }
      article = await generateArticle(topic, check.sources);
      if (!article) {
        failed++;
        console.error(`  ✗ article failed`);
        continue;
      }
    }

    if (!hasImage) {
      console.log(`  → image...`);
      const ok = await generateImage(topic, imagePath);
      if (!ok) {
        failed++;
        console.error(`  ✗ image failed`);
        continue;
      }
    }

    if (article && check) {
      const imageWebPath = `/blog/${topic.slug}.jpg`;
      writeFileSync(
        articlePath,
        serializeDraftArticle(topic, article, imageWebPath, utcToday(), check.sources),
        "utf8",
      );
    }

    generated++;
    await new Promise((r) => setTimeout(r, 800));
  }

  console.log(
    `\nDone. total=${total} drafted=${generated} skipped=${skipped} blocked=${blocked} failed=${failed}`,
  );
  console.log("All generated modules are drafts and stay invisible until editorially published.");
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
