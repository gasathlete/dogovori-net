import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isPublishablePost, type BlogPost, type BlogPostModule } from "../../src/lib/blogEditorial";

/** One build-time source for sitemap, prerender and the lightweight blog index. */
export async function loadPublishedBlogPosts(directory: string): Promise<BlogPost[]> {
  const posts: BlogPost[] = [];
  const slugs = new Set<string>();
  for (const file of readdirSync(directory).filter((f) => f.endsWith(".ts")).sort()) {
    const { POST: post } = await import(pathToFileURL(resolve(directory, file)).href) as { POST?: BlogPostModule };
    if (!post || !isPublishablePost(post)) continue;
    if (post.slug !== file.slice(0, -3) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug)) {
      throw new Error(`Published blog slug must match its filename: ${file}`);
    }
    if (slugs.has(post.slug)) throw new Error(`Duplicate blog slug: ${post.slug}`);
    slugs.add(post.slug);
    posts.push(post);
  }
  return posts.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug));
}
