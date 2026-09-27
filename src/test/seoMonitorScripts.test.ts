import { describe, it, expect, vi } from "vitest";
import { crawlSitemaps, type SitemapFetcher } from "../../scripts/lib/sitemapCrawl";
import { fetchPsi, parseRetryAfter, extractScores, MAX_ATTEMPTS } from "../../scripts/lib/psiResult";

const O = "https://dogovori.net";
const idx = (...locs: string[]) =>
  `<?xml version="1.0"?><sitemapindex>${locs.map((l) => `<sitemap><loc>${l}</loc></sitemap>`).join("")}</sitemapindex>`;
const set = (...locs: string[]) =>
  `<?xml version="1.0"?><urlset>${locs.map((l) => `<url><loc>${l}</loc></url>`).join("")}</urlset>`;
const fx = (map: Record<string, string | number>): SitemapFetcher => async (u) => {
  const v = map[u];
  if (v === undefined) return { ok: false, status: 404, text: "" };
  if (typeof v === "number") return { ok: false, status: v, text: "" };
  return { ok: true, status: 200, text: v };
};

describe("sitemap crawl", () => {
  it("recurses sitemapindex into urlsets and returns only HTML pages", async () => {
    const r = await crawlSitemaps(`${O}/sitemap.xml`, O, fx({
      [`${O}/sitemap.xml`]: idx(`${O}/a.xml`, `${O}/b.xml`),
      [`${O}/a.xml`]: set(`${O}/`, `${O}/catalog`),
      [`${O}/b.xml`]: set(`${O}/catalog`, `${O}/blog/x`),
    }));
    expect(r.pages.sort()).toEqual([`${O}/`, `${O}/blog/x`, `${O}/catalog`]);
    expect(r.pages.some((p) => p.endsWith(".xml"))).toBe(false);
    expect(r.sitemapsVisited).toHaveLength(3);
  });

  it("is cycle-safe", async () => {
    const f = vi.fn(fx({ [`${O}/sitemap.xml`]: idx(`${O}/a.xml`), [`${O}/a.xml`]: idx(`${O}/sitemap.xml`, `${O}/a.xml`) }));
    const r = await crawlSitemaps(`${O}/sitemap.xml`, O, f);
    expect(f).toHaveBeenCalledTimes(2);
    expect(r.pages).toEqual([]);
  });

  it("skips external sitemaps and pages without fetching them", async () => {
    const f = vi.fn(fx({
      [`${O}/sitemap.xml`]: idx("https://evil.example/s.xml", `${O}/a.xml`),
      [`${O}/a.xml`]: set("https://evil.example/p", `${O}/ok`, "javascript:alert(1)"),
    }));
    const r = await crawlSitemaps(`${O}/sitemap.xml`, O, f);
    expect(f.mock.calls.map((c) => c[0])).not.toContain("https://evil.example/s.xml");
    expect(r.pages).toEqual([`${O}/ok`]);
    expect(r.problems.length).toBeGreaterThanOrEqual(2);
  });

  it("reports malformed / failing maps without throwing", async () => {
    const r = await crawlSitemaps(`${O}/sitemap.xml`, O, fx({
      [`${O}/sitemap.xml`]: idx(`${O}/bad.xml`, `${O}/gone.xml`, `${O}/err.xml`),
      [`${O}/bad.xml`]: "<html>not xml</html>",
      [`${O}/err.xml`]: 500,
    }));
    expect(r.pages).toEqual([]);
    expect(r.problems.map((p) => p.message).join("|")).toMatch(/not a sitemapindex|HTTP 404|HTTP 500/);
    expect(r.problems).toHaveLength(3);
  });

  it("enforces depth, sitemap and page limits", async () => {
    const r = await crawlSitemaps(`${O}/0.xml`, O, fx({
      [`${O}/0.xml`]: idx(`${O}/1.xml`), [`${O}/1.xml`]: idx(`${O}/2.xml`), [`${O}/2.xml`]: set(`${O}/deep`),
    }), { maxDepth: 1, maxSitemaps: 10, maxPages: 10 });
    expect(r.pages).toEqual([]);
    const p = await crawlSitemaps(`${O}/s.xml`, O, fx({ [`${O}/s.xml`]: set(`${O}/a`, `${O}/b`, `${O}/c`) }), { maxDepth: 3, maxSitemaps: 5, maxPages: 2 });
    expect(p.pages).toHaveLength(2);
  });

  it("rejects an off-origin root", async () => {
    const f = vi.fn(fx({}));
    const r = await crawlSitemaps("https://evil.example/sitemap.xml", O, f);
    expect(f).not.toHaveBeenCalled();
    expect(r.pages).toEqual([]);
  });
});

const res = (status: number, body: unknown = {}, retryAfter: string | null = null) => ({
  ok: status >= 200 && status < 300, status, statusText: "", headers: { get: (n: string) => (n === "retry-after" ? retryAfter : null) }, json: async () => body,
});

describe("PSI classification", () => {
  it("429 is unavailable, bounded attempts, no scores invented", async () => {
    const f = vi.fn(async () => res(429, {}, "5"));
    const sleep = vi.fn(async () => {});
    const o = await fetchPsi("x", f, sleep);
    expect(o.kind).toBe("unavailable");
    expect(f).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    expect(sleep).toHaveBeenCalledTimes(MAX_ATTEMPTS - 1);
    expect(sleep).toHaveBeenCalledWith(5000);
  });

  it("clamps Retry-After", () => {
    expect(parseRetryAfter("99999")).toBe(30_000);
    expect(parseRetryAfter("garbage")).toBeNull();
    expect(parseRetryAfter(null)).toBeNull();
  });

  it("400 is a non-retried error", async () => {
    const f = vi.fn(async () => res(400));
    expect((await fetchPsi("x", f, async () => {})).kind).toBe("error");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("recovers after a transient 503", async () => {
    const f = vi.fn().mockResolvedValueOnce(res(503)).mockResolvedValueOnce(res(200, { lighthouseResult: { categories: { seo: { score: 0.97 } } } }));
    const o = await fetchPsi("x", f, async () => {});
    expect(o.kind).toBe("measured");
    if (o.kind === "measured") expect(extractScores(o.json)).toEqual({ performance: null, seo: 97, accessibility: null, "best-practices": null });
  });

  it("network errors are unavailable, not scores", async () => {
    const o = await fetchPsi("x", async () => { throw new Error("ECONNRESET"); }, async () => {});
    expect(o).toMatchObject({ kind: "unavailable" });
  });
});
