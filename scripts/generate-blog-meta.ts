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
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPublishedBlogPosts } from "./lib/blogContent";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const CONTENT_DIR = join(ROOT, "src/content/blog");
const OUT = join(ROOT, "src/lib/blogMeta.generated.ts");

const metas = (await loadPublishedBlogPosts(CONTENT_DIR)).map((post) => ({
  slug: post.slug,
  title: post.title,
  summary: post.summary,
  category: post.category,
  image: post.image,
  publishedAt: post.publishedAt,
}));

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
