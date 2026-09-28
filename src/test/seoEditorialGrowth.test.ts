import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadPublishedBlogPosts } from "../../scripts/lib/blogContent";
import { ALL_POSTS, hasVerifiedSources } from "../lib/blog";
import { BLOG_POST_META } from "../lib/blogMeta.generated";
import { allTemplates } from "../lib/templateIndex";
import { TEMPLATE_DISCOVERY_PROFILES, getTemplateDiscoveryProfile } from "../lib/templateDiscovery";
import { SEO_TEMPLATE_META_SLUGS, getSeoTemplateMeta } from "../lib/seoTemplateMeta";
import { getSectorPackagesForArticle } from "../lib/seoCollections";
import { renderTemplatePreparation } from "../../scripts/lib/templateDiscovery";

const NEW_GUIDES = ["opis-na-obzavezhdane-pri-naem", "priemane-na-rabota-po-etapi", "zadanie-za-uebsayt-kakvo-da-utochnim", "dlazhnostna-harakteristika-podgotovka"];

describe("published content boundaries", () => {
  it("uses the same published routes in runtime, lightweight metadata and build consumers", async () => {
    const posts = await loadPublishedBlogPosts(resolve("src/content/blog"));
    const slugs = posts.map((post) => post.slug).sort();
    expect(slugs).toEqual(ALL_POSTS.map((post) => post.slug).sort());
    expect(slugs).toEqual(BLOG_POST_META.map((post) => post.slug).sort());
    expect(slugs).toEqual(expect.arrayContaining(NEW_GUIDES));
  });

  it("excludes dated drafts and undated articles from the actual build loader", async () => {
    const dir = mkdtempSync(join(tmpdir(), "seo-publication-"));
    try {
      for (const [slug, fields] of Object.entries({
        draft: { status: "draft", publishedAt: "2026-01-01" },
        undated: { status: "published" },
        published: { status: "published", publishedAt: "2026-01-01" },
        legacy: { publishedAt: "2025-01-01" },
      })) writeFileSync(join(dir, `${slug}.ts`), `export const POST = ${JSON.stringify({ slug, ...fields })};`);
      expect((await loadPublishedBlogPosts(dir)).map((post) => post.slug)).toEqual(["published", "legacy"]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("rejects a published filename/slug mismatch instead of advertising a wrong URL", async () => {
    const dir = mkdtempSync(join(tmpdir(), "seo-slug-"));
    try {
      writeFileSync(join(dir, "wrong.ts"), 'export const POST = { slug: "another", publishedAt: "2026-01-01" };');
      await expect(loadPublishedBlogPosts(dir)).rejects.toThrow("must match its filename");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("practical guides and canonical document discovery", () => {
  const catalog = new Set(allTemplates().map((entry) => entry.slug));

  it("connects each new guide to existing documents and its curated package", () => {
    for (const slug of NEW_GUIDES) {
      const post = ALL_POSTS.find((article) => article.slug === slug)!;
      expect(hasVerifiedSources(post)).toBe(true);
      expect(post.sources!.every((source) => source.url.startsWith("https://") && source.note)).toBe(true);
      expect(post.cta?.href.startsWith("/shablon/")).toBe(true);
      expect(catalog.has(post.cta!.href.replace("/shablon/", ""))).toBe(true);
      for (const document of post.relatedDocuments ?? []) expect(catalog.has(document.slug), document.slug).toBe(true);
      expect(getSectorPackagesForArticle(slug)).toHaveLength(1);
    }
  });

  it("keeps preparation and metadata specific to 20 existing catalog routes", () => {
    expect(TEMPLATE_DISCOVERY_PROFILES).toHaveLength(20);
    expect(new Set(TEMPLATE_DISCOVERY_PROFILES.map((profile) => profile.slug)).size).toBe(20);
    for (const profile of TEMPLATE_DISCOVERY_PROFILES) {
      expect(catalog.has(profile.slug), profile.slug).toBe(true);
      expect([...profile.title].length).toBeLessThanOrEqual(60);
      expect([...profile.description].length).toBeLessThanOrEqual(160);
      expect(profile.description).toContain("след вход според плана");
      expect(NEW_GUIDES).toContain(profile.guideSlug);
      const html = renderTemplatePreparation(profile.slug);
      expect(html).toContain(profile.context);
      for (const item of profile.prepare) expect(html).toContain(item);
      expect(html).toContain(`href="/blog/${profile.guideSlug}"`);
    }
    expect(getTemplateDiscoveryProfile("not-a-document")).toBeUndefined();
    expect(renderTemplatePreparation("not-a-document")).toBe("");
  });

  it("preserves the original three-route metadata experiment", () => {
    for (const slug of SEO_TEMPLATE_META_SLUGS) {
      expect(getTemplateDiscoveryProfile(slug)).toBeUndefined();
      expect(getSeoTemplateMeta(slug)?.slug).toBe(slug);
    }
  });
});
