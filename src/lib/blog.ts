import { isPublishablePost, type BlogPost, type BlogPostModule } from "./blogEditorial";
export * from "./blogEditorial";

// Eagerly import every generated article module. Vite tree-shakes unused exports,
// and the blog list page needs metadata for all posts anyway.
const modules = import.meta.glob<{ POST: BlogPostModule }>("/src/content/blog/*.ts", {
  eager: true,
});

export const ALL_POSTS: BlogPost[] = Object.values(modules)
  .map((m) => m.POST)
  .filter(isPublishablePost)
  .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

export function getPostBySlug(slug: string): BlogPost | undefined {
  return ALL_POSTS.find((p) => p.slug === slug);
}

export function getRelatedPosts(slug: string, limit = 3): BlogPost[] {
  const current = getPostBySlug(slug);
  if (!current) return [];
  return ALL_POSTS.filter((p) => p.slug !== slug && p.category === current.category)
    .slice(0, limit)
    .concat(
      ALL_POSTS.filter((p) => p.slug !== slug && p.category !== current.category).slice(0, limit),
    )
    .slice(0, limit);
}

export function getAllCategories(): string[] {
  return Array.from(new Set(ALL_POSTS.map((p) => p.category))).sort();
}
