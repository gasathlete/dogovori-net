// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assessIndexability, PUBLIC_SEO_ROUTES } from "../../scripts/lib/indexability";
import { renderUrlset } from "../../scripts/lib/sitemapXml";
import { readFileSync } from "node:fs";

const url = "https://dogovori.net/blog/example";
const page = `<html><head><title>Практично ръководство</title><meta content="Полезно описание" name="description"><link href="${url}" rel="canonical"></head><body><h1>Пример</h1></body></html>`;
const check = (html = page, extra: Record<string, string> = {}, status = 200) => assessIndexability(url, status, html, new Headers({"content-type": "text/html", ...extra}));

describe("live initial-HTML indexability", () => {
  it("accepts a dedicated canonical page with either attribute order", () => expect(check()).toEqual([]));
  it("rejects a homepage fallback even when HTTP is 200", () => expect(check(page.replace(url, "https://dogovori.net/"))).toEqual(expect.arrayContaining([expect.objectContaining({rule:"canonical-mismatch",level:"error"})])));
  it("rejects duplicate canonicals and missing head metadata", () => {
    expect(check(page.replace("</head>", `<link rel="canonical" href="${url}"></head>`)).some(x=>x.rule==="canonical-count")).toBe(true);
    expect(check("<h1>SPA only</h1>").some(x=>x.rule==="canonical-count")).toBe(true);
  });
  it("detects Google meta and HTTP noindex, not an unrelated crawler restriction", () => {
    expect(check(page.replace("</head>", '<meta content="none" name="googlebot"></head>')).some(x=>x.rule==="robots")).toBe(true);
    expect(check(page, {"x-robots-tag":"googlebot: noindex, nofollow"}).some(x=>x.rule==="x-robots-tag")).toBe(true);
    expect(check(page, {"x-robots-tag":"bingbot: noindex"})).toEqual([]);
  });
  it("does not parse metadata in comments or script literals", () => expect(check(page.replace("</head>", '<!-- <link rel="canonical" href="/fake"> --><script>"<meta name=robots content=noindex>"</script></head>'))).toEqual([]));
  it("rejects redirects and non-HTML responses", () => {
    expect(check(page, {}, 301).some(x=>x.rule==="status")).toBe(true);
    expect(check(page, {"content-type":"application/json"}).some(x=>x.rule==="content-type")).toBe(true);
  });
  it("does not treat private login/build routes as indexable SEO targets", () => {
    expect(PUBLIC_SEO_ROUTES).not.toContain("/build");
    expect(PUBLIC_SEO_ROUTES).not.toContain("/auth");
    expect(PUBLIC_SEO_ROUTES).toContain("/komplekti/naem-zhilishte");
  });
});

describe("honest sitemap dates", () => {
  it("omits unknown dates and preserves known editorial dates", () => {
    const xml = renderUrlset("https://dogovori.net", [{loc:"/catalog"},{loc:"/blog/example",lastmod:"2026-09-28"}]);
    expect(xml.match(/<lastmod>/g)).toHaveLength(1);
    expect(xml).toContain("<lastmod>2026-09-28</lastmod>");
    expect(xml).not.toMatch(/priority|changefreq|undefined/);
  });
  it("escapes XML and never derives dates from checkout mtime", () => {
    expect(renderUrlset("https://dogovori.net", [{loc:"/test?a=1&b=2"}])).toContain("&amp;");
    const source=readFileSync("scripts/build-sitemap.ts","utf8");
    expect(source).not.toMatch(/statSync|new Date\(/);
    expect(source).toContain("allTemplates()");
  });
});
