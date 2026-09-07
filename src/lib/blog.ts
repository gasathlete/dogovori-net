// Blog runtime types + index loader.
// Articles live in src/content/blog/<slug>.ts (auto-generated drafts).
//
// Editorial model: generated modules are written as explicit drafts
// (status: "draft", reviewStatus: "unreviewed", no publishedAt). Only modules
// that carry a real publishedAt and are not explicitly drafts are routable.
// Legacy modules without an explicit status stay publishable for compatibility.

export interface BlogSection {
  heading: string;
  body: string;
}

export interface BlogFaq {
  q: string;
  a: string;
}

/** Editorially curated official source used to ground legal claims. */
export interface BlogSource {
  /** Human-readable title of the official source. */
  title: string;
  /** Canonical HTTPS URL of the official source. */
  url: string;
  /** Editorial grounding note: which claims this source actually supports. */
  note?: string;
}

/** Optional article-specific call to action. */
export interface BlogCta {
  href: string;
  label: string;
  title?: string;
  body?: string;
}

export type BlogStatus = "draft" | "published";
export type BlogReviewStatus = "unreviewed" | "source-checked";

/**
 * Raw article module shape as written to src/content/blog/<slug>.ts.
 * Dates are YYYY-MM-DD. publishedAt is optional here: drafts have none.
 */
export interface BlogPostModule {
  slug: string;
  title: string;
  keyword: string;
  category: string;
  summary: string;
  metaDescription: string;
  image: string; // /blog/<slug>.jpg
  /** Optional only for backwards compatibility with legacy published modules. */
  status?: BlogStatus;
  draftedAt?: string;
  publishedAt?: string;
  modifiedAt?: string;
  reviewedAt?: string;
  reviewStatus?: BlogReviewStatus;
  sources?: readonly BlogSource[];
  cta?: BlogCta;
  intro: string;
  sections: BlogSection[];
  faq: BlogFaq[];
  takeaways: string[];
}

/** A module that is safe to route and render publicly. */
export type BlogPost = BlogPostModule & { publishedAt: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Publishable = not an explicit draft AND has a real publishedAt date.
 * Legacy modules with no `status` but a valid publishedAt remain visible.
 */
export function isPublishablePost(post: BlogPostModule): post is BlogPost {
  if (post.status === "draft") return false;
  return typeof post.publishedAt === "string" && DATE_RE.test(post.publishedAt);
}

/** dateModified for JSON-LD: explicit modification date, else publication date. */
export function resolveDateModified(post: BlogPost): string {
  return post.modifiedAt ?? post.publishedAt;
}

/**
 * A "checked against official sources" claim may only be shown when the
 * article is marked source-checked, carries a review date, and lists sources.
 * Never implies review by a named lawyer or expert.
 */
export function hasVerifiedSources(post: BlogPostModule): boolean {
  return (
    post.reviewStatus === "source-checked" &&
    typeof post.reviewedAt === "string" &&
    DATE_RE.test(post.reviewedAt) &&
    Array.isArray(post.sources) &&
    post.sources.length > 0
  );
}

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
