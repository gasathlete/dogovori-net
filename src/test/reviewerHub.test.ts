import { describe, expect, it } from "vitest";
import { REVIEWER_ARTICLES, REVIEWER_EXAMPLES, REVIEWER_FAQ } from "@/data/reviewerHub";
import { getPostBySlug } from "@/lib/blog";

describe("материали към AI Ревизора", () => {
  it("всяка свързана статия е реално публикувана", () => {
    for (const a of REVIEWER_ARTICLES) {
      const post = getPostBySlug(a.slug);
      expect(post, `липсва статия ${a.slug}`).toBeTruthy();
      expect(post!.publishedAt, `статия ${a.slug} е чернова`).toBeTruthy();
    }
  });

  it("всяка статия има заглавие и кратко обяснение", () => {
    for (const a of REVIEWER_ARTICLES) {
      expect(a.title.length).toBeGreaterThan(10);
      expect(a.note.length).toBeGreaterThan(20);
    }
  });

  it("примерите и въпросите не са празни и не обещават правен съвет", () => {
    expect(REVIEWER_EXAMPLES.length).toBeGreaterThanOrEqual(3);
    expect(REVIEWER_FAQ.length).toBeGreaterThanOrEqual(4);
    const all = [
      ...REVIEWER_EXAMPLES.flatMap((e) => [e.clause, e.finding, e.nextStep]),
      ...REVIEWER_FAQ.flatMap((f) => [f.q, f.a]),
    ].join(" ");
    expect(all).not.toMatch(/гарантира|100%|безопасно за подпис/);
    // Обещание за правен съвет не се допуска; отричането му е допустимо.
    expect(REVIEWER_FAQ.some((f) => /правен съвет/.test(f.q) && /^Не\./.test(f.a))).toBe(true);
  });
});
