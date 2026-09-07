import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  ALL_POSTS,
  getPostBySlug,
  hasVerifiedSources,
  isPublishablePost,
  resolveDateModified,
  type BlogPostModule,
} from "@/lib/blog";
import { MIN_SOURCE_PACK_SIZE, utcToday, validateSourcePack, serializeDraftArticle } from "../../scripts/generate-blog";

const GENERATOR_SRC = readFileSync("scripts/generate-blog.ts", "utf8");

function base(over: Partial<BlogPostModule> = {}): BlogPostModule {
  return {
    slug: "x",
    title: "T",
    keyword: "k",
    category: "Договори",
    summary: "s",
    metaDescription: "m",
    image: "/blog/x.jpg",
    intro: "i",
    sections: [],
    faq: [],
    takeaways: [],
    ...over,
  };
}

describe("generator source guard", () => {
  it("contains no fake lawyer persona or credential claims", () => {
    expect(GENERATOR_SRC).not.toMatch(/български юрист/i);
    expect(GENERATOR_SRC).not.toMatch(/15 години опит/i);
    expect(GENERATOR_SRC).toMatch(/редакционен асистент/);
    expect(GENERATOR_SRC).toMatch(/Не си юрист/);
  });

  it("contains no hard-coded backdating base or synthetic date math", () => {
    expect(GENERATOR_SRC).not.toContain("2026-04-15");
    expect(GENERATOR_SRC).not.toMatch(/baseDate/);
    expect(GENERATOR_SRC).not.toMatch(/24 \* 3600 \* 1000/);
  });

  it("never serializes publishedAt / reviewedAt / modifiedAt", () => {
    const out = serializeDraftArticle(
      {
        slug: "s",
        title: "T",
        keyword: "k",
        summary: "sum",
        category: "Договори",
        imagePrompt: "p",
      } as any,
      { intro: "i", sections: [], faq: [], takeaways: [], metaDescription: "m" },
      "/blog/s.jpg",
      "2026-09-07",
      [{ title: "A", url: "https://lex.bg/a", note: "n" }],
    );
    expect(out).toContain('"status": "draft"');
    expect(out).toContain('"reviewStatus": "unreviewed"');
    expect(out).toContain('"draftedAt": "2026-09-07"');
    expect(out).not.toContain("publishedAt");
    expect(out).not.toContain("reviewedAt");
    expect(out).not.toContain("modifiedAt");
  });

  it("uses the real UTC generation date", () => {
    expect(utcToday(new Date("2026-09-07T23:30:00Z"))).toBe("2026-09-07");
  });
});

describe("fail-closed source pack validation", () => {
  it("rejects a missing or too-small pack", () => {
    expect(validateSourcePack({}).ok).toBe(false);
    expect(
      validateSourcePack({ sourcePack: [{ title: "A", url: "https://lex.bg/a", note: "n" }] }).ok,
    ).toBe(false);
    expect(MIN_SOURCE_PACK_SIZE).toBeGreaterThanOrEqual(2);
  });

  it("rejects non-HTTPS URLs and empty grounding notes", () => {
    expect(
      validateSourcePack({
        sourcePack: [
          { title: "A", url: "http://lex.bg/a", note: "n" },
          { title: "B", url: "https://lex.bg/b", note: "n" },
        ],
      }).ok,
    ).toBe(false);
    expect(
      validateSourcePack({
        sourcePack: [
          { title: "A", url: "https://lex.bg/a", note: "  " },
          { title: "B", url: "https://lex.bg/b", note: "n" },
        ],
      }).ok,
    ).toBe(false);
  });

  it("accepts a curated pack of two annotated HTTPS sources", () => {
    expect(
      validateSourcePack({
        sourcePack: [
          { title: "A", url: "https://lex.bg/a", note: "обхват A" },
          { title: "B", url: "https://lex.bg/b", note: "обхват B" },
        ],
      }).ok,
    ).toBe(true);
  });
});

describe("publishability", () => {
  it("excludes explicit drafts, keeps legacy published modules", () => {
    expect(isPublishablePost(base({ status: "draft", draftedAt: "2026-09-07" }))).toBe(false);
    expect(isPublishablePost(base({ status: "draft", publishedAt: "2026-01-01" }))).toBe(false);
    expect(isPublishablePost(base({ publishedAt: "2026-01-01" }))).toBe(true);
    expect(isPublishablePost(base({ status: "published", publishedAt: "2026-01-01" }))).toBe(true);
    expect(isPublishablePost(base())).toBe(false);
  });

  it("every routable post has a real publishedAt and is not a draft", () => {
    for (const p of ALL_POSTS) {
      expect(p.status).not.toBe("draft");
      expect(p.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(getPostBySlug(p.slug)?.slug).toBe(p.slug);
    }
  });

  it("keeps the current article count and URLs unchanged", () => {
    expect(ALL_POSTS.length).toBe(35);
    expect(new Set(ALL_POSTS.map((p) => p.slug)).size).toBe(35);
    expect(ALL_POSTS.every((p, i, a) => i === 0 || a[i - 1].publishedAt >= p.publishedAt)).toBe(true);
  });
});

describe("dateModified fallback", () => {
  it("prefers modifiedAt, falls back to publishedAt", () => {
    expect(resolveDateModified(base({ publishedAt: "2026-01-01" }) as any)).toBe("2026-01-01");
    expect(
      resolveDateModified(base({ publishedAt: "2026-01-01", modifiedAt: "2026-03-04" }) as any),
    ).toBe("2026-03-04");
  });
});

describe("verified-source claim", () => {
  const sources = [{ title: "A", url: "https://lex.bg/a", note: "n" }];

  it("requires source-checked + reviewedAt + non-empty sources", () => {
    expect(hasVerifiedSources(base({ reviewStatus: "source-checked", reviewedAt: "2026-05-01", sources }))).toBe(true);
    expect(hasVerifiedSources(base({ reviewStatus: "unreviewed", reviewedAt: "2026-05-01", sources }))).toBe(false);
    expect(hasVerifiedSources(base({ reviewStatus: "source-checked", sources }))).toBe(false);
    expect(hasVerifiedSources(base({ reviewStatus: "source-checked", reviewedAt: "2026-05-01", sources: [] }))).toBe(false);
  });

  it("never claims lawyer or expert review", () => {
    const src = readFileSync("src/components/article/OfficialSources.tsx", "utf8");
    expect(src).toContain("Проверено спрямо официални източници");
    expect(src).not.toMatch(/юрист|адвокат|експерт/i);
    expect(src).toContain('rel="noopener noreferrer"');
    expect(src).toContain('target="_blank"');
  });
});
