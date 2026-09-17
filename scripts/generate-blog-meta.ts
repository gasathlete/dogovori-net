/**
 * Генерира лек списък с метаданни на статиите (`src/lib/blogMeta.generated.ts`).
 *
 * Пълният модул `src/lib/blog.ts` внася съдържанието на всички статии (~460 KB
 * JS). Началната страница и ротаторите се нуждаят само от заглавие, кратко
 * описание, категория и изображение, затова тези полета се изнасят в отделен
 * малък файл, който се пресъздава при всяко сглобяване.
 *
 * Стартиране: bun run scripts/generate-blog-meta.ts
 */
import { readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dir, "..");
const CONTENT_DIR = join(ROOT, "src/content/blog");
const OUT = join(ROOT, "src/lib/blogMeta.generated.ts");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Meta = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  image: string;
  publishedAt: string;
};

const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".ts")).sort();
const metas: Meta[] = [];

for (const file of files) {
  const mod = (await import(pathToFileURL(join(CONTENT_DIR, file)).href)) as {
    POST?: Record<string, unknown>;
  };
  const post = mod.POST;
  if (!post) continue;
  if (post.status === "draft") continue;
  const publishedAt = post.publishedAt;
  if (typeof publishedAt !== "string" || !DATE_RE.test(publishedAt)) continue;
  metas.push({
    slug: String(post.slug),
    title: String(post.title),
    summary: String(post.summary),
    category: String(post.category),
    image: String(post.image ?? ""),
    publishedAt,
  });
}

metas.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

const body = `// АВТОМАТИЧНО ГЕНЕРИРАН ФАЙЛ — не редактирайте на ръка.
// Създава се от scripts/generate-blog-meta.ts при всяко сглобяване.
//
// Съдържа само метаданните на публикуваните статии, за да могат началната
// страница и ротаторите да работят без да внасят цялото съдържание на блога.

export interface BlogPostMeta {
  slug: string;
  title: string;
  summary: string;
  category: string;
  image: string;
  publishedAt: string;
}

export const BLOG_POST_META: readonly BlogPostMeta[] = ${JSON.stringify(metas, null, 2)};

export function findPostMeta(slug: string): BlogPostMeta | undefined {
  return BLOG_POST_META.find((p) => p.slug === slug);
}
`;

writeFileSync(OUT, body, "utf8");
console.log(`blog meta: ${metas.length} публикувани статии → ${OUT}`);
