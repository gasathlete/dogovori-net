// Generates a 1200-1800 word SEO article + editorial hero image for each blog topic.
// Output:
//   src/content/blog/<slug>.ts  — typed article module (title, meta, mdx body)
//   public/blog/<slug>.jpg      — editorial hero image (1280x720)
//
// Resumable: skips topics whose article + image already exist on disk.
// Usage: bun run scripts/generate-blog.ts
//
// Env: LOVABLE_API_KEY must be set.

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { Buffer } from "node:buffer";
import { BLOG_TOPICS, type BlogTopic } from "../src/data/blogTopics";

const API_KEY = process.env.LOVABLE_API_KEY;
if (!API_KEY) {
  console.error("LOVABLE_API_KEY not set");
  process.exit(1);
}

const TEXT_MODEL = "google/gemini-2.5-pro";
const IMAGE_MODEL = "google/gemini-2.5-flash-image";
const ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface ArticleJson {
  intro: string; // 2-3 paragraphs
  sections: { heading: string; body: string }[]; // 4-7 sections
  faq: { q: string; a: string }[]; // 4-6
  takeaways: string[]; // 3-5 bullet points
  metaDescription: string; // 150-160 chars
}

const SYSTEM = `Ти си български юрист с 15 години опит и експерт по SEO съдържание. Пишеш ясно, точно, на правен български. Цитираш конкретни членове от ЗЗД, ТЗ, КТ, ЗУТ, ЗЗП, ЗДДС, СК, ЗЗЛД/GDPR. Никога не измисляш членове или закони. Използваш активен глас, кратки изречения, естествено разпределени ключови думи без stuffing. Между 1200 и 1800 думи общо за статията.`;

function buildArticlePrompt(t: BlogTopic): string {
  return `Напиши SEO-оптимизирана блог статия за dogovori.net на тема:

Заглавие: "${t.title}"
Главна ключова дума: "${t.keyword}"
Категория: "${t.category}"

Върни СТРОГО JSON със следната структура (без markdown, без обяснения):
{
  "metaDescription": "150-160 символа, естествено включваща ключовата дума, активен глас",
  "intro": "2-3 параграфа въведение (по 3-5 изречения), естествено включващи ключовата дума, без клишета",
  "sections": [
    { "heading": "Секционно заглавие като въпрос или твърдение", "body": "3-5 параграфа с конкретни цитирания на закони, примери, цифри" }
  ],
  "faq": [{"q": "Въпрос?", "a": "1-3 изречения с цитиране на закон ако е приложимо"}],
  "takeaways": ["3-5 ключови извода в по 1 изречение"]
}

Изисквания:
- 4-7 sections общо
- 4-6 faq въпроса
- Общо между 1200 и 1800 думи (sum от intro + всички sections + faq + takeaways)
- Никакви markdown символи в стойностите (без **, #, -, > и т.н.)
- Параграфите се разделят с двоен \\n\\n
- Цитирай конкретни членове на закони когато е приложимо (напр. "по чл. 240 ЗЗД")
- Не споменавай dogovori.net в самия текст`;
}

async function generateArticle(t: BlogTopic): Promise<ArticleJson | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          model: TEXT_MODEL,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: buildArticlePrompt(t) },
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

function serializeArticle(t: BlogTopic, a: ArticleJson, image: string, publishedAt: string): string {
  const json = JSON.stringify(
    {
      slug: t.slug,
      title: t.title,
      keyword: t.keyword,
      category: t.category,
      summary: t.summary,
      metaDescription: a.metaDescription,
      image,
      publishedAt,
      intro: a.intro,
      sections: a.sections,
      faq: a.faq,
      takeaways: a.takeaways,
    },
    null,
    2,
  );
  return `// AUTO-GENERATED by scripts/generate-blog.ts. Do not edit by hand.
import type { BlogPost } from "@/lib/blog";

export const POST: BlogPost = ${json} as const;
`;
}

async function main() {
  const articleDir = resolve(process.cwd(), "src/content/blog");
  const imageDir = resolve(process.cwd(), "public/blog");
  if (!existsSync(articleDir)) mkdirSync(articleDir, { recursive: true });
  if (!existsSync(imageDir)) mkdirSync(imageDir, { recursive: true });

  const baseDate = new Date("2026-04-15");
  let total = 0,
    generated = 0,
    skipped = 0,
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
    if (!hasArticle) {
      article = await generateArticle(topic);
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

    if (article) {
      const publishedAt = new Date(baseDate.getTime() - i * 3 * 24 * 3600 * 1000)
        .toISOString()
        .split("T")[0];
      const imageWebPath = `/blog/${topic.slug}.jpg`;
      writeFileSync(articlePath, serializeArticle(topic, article, imageWebPath, publishedAt), "utf8");
    }

    generated++;
    await new Promise((r) => setTimeout(r, 800));
  }

  console.log(`\nDone. total=${total} generated=${generated} skipped=${skipped} failed=${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
