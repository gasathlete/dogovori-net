/**
 * Bounded, same-origin sitemap traversal used by scripts/seo-monitor.ts.
 *
 * - Handles both <sitemapindex> (recurses into child sitemaps) and <urlset>
 *   (collects page URLs).
 * - Only follows/collects URLs on the configured origin; external locs are
 *   reported and skipped.
 * - Dedups sitemaps (cycle-safe) and page URLs; caps depth, sitemap count
 *   and page count so a malformed or hostile map cannot run unbounded.
 * - Never returns XML sitemap URLs as pages.
 */

export interface CrawlLimits {
  maxDepth: number;
  maxSitemaps: number;
  maxPages: number;
}

export const DEFAULT_LIMITS: CrawlLimits = { maxDepth: 3, maxSitemaps: 50, maxPages: 20000 };

export type SitemapFetcher = (url: string) => Promise<{ ok: boolean; status: number; text: string }>;

export interface CrawlResult {
  pages: string[];
  sitemapsVisited: string[];
  problems: { url: string; message: string }[];
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function extractLocs(xml: string, container: "sitemap" | "url"): string[] {
  const re = new RegExp(`<${container}\\b[^>]*>([\\s\\S]*?)<\\/${container}>`, "gi");
  const out: string[] = [];
  for (const block of xml.matchAll(re)) {
    const loc = block[1].match(/<loc>\s*([^<]+?)\s*<\/loc>/i);
    if (loc) out.push(decodeXml(loc[1].trim()));
  }
  return out;
}

export function classifySitemap(xml: string): "index" | "urlset" | "unknown" {
  if (/<sitemapindex\b/i.test(xml)) return "index";
  if (/<urlset\b/i.test(xml)) return "urlset";
  return "unknown";
}

function sameOrigin(url: string, origin: string): URL | null {
  try {
    const u = new URL(url);
    if (u.origin !== origin) return null;
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    u.hash = "";
    return u;
  } catch {
    return null;
  }
}

export function isXmlUrl(u: URL): boolean {
  return /\.xml(\.gz)?$/i.test(u.pathname);
}

export async function crawlSitemaps(
  rootUrl: string,
  origin: string,
  fetcher: SitemapFetcher,
  limits: CrawlLimits = DEFAULT_LIMITS,
): Promise<CrawlResult> {
  const normOrigin = new URL(origin).origin;
  const visited = new Set<string>();
  const pages = new Set<string>();
  const problems: CrawlResult["problems"] = [];
  const queue: { url: string; depth: number }[] = [];

  const root = sameOrigin(rootUrl, normOrigin);
  if (!root) {
    problems.push({ url: rootUrl, message: "root sitemap is not on the monitored origin" });
    return { pages: [], sitemapsVisited: [], problems };
  }
  queue.push({ url: root.href, depth: 0 });

  while (queue.length) {
    const { url, depth } = queue.shift()!;
    if (visited.has(url)) continue;
    if (visited.size >= limits.maxSitemaps) {
      problems.push({ url, message: `sitemap limit ${limits.maxSitemaps} reached; skipped` });
      continue;
    }
    visited.add(url);

    let res: Awaited<ReturnType<SitemapFetcher>>;
    try {
      res = await fetcher(url);
    } catch (e) {
      problems.push({ url, message: `fetch failed: ${(e as Error).message}` });
      continue;
    }
    if (!res.ok) {
      problems.push({ url, message: `HTTP ${res.status}` });
      continue;
    }
    const kind = classifySitemap(res.text);
    if (kind === "unknown") {
      problems.push({ url, message: "not a sitemapindex or urlset" });
      continue;
    }
    if (kind === "index") {
      for (const loc of extractLocs(res.text, "sitemap")) {
        const child = sameOrigin(loc, normOrigin);
        if (!child) {
          problems.push({ url: loc, message: "external or invalid child sitemap skipped" });
          continue;
        }
        if (depth + 1 > limits.maxDepth) {
          problems.push({ url: child.href, message: `max depth ${limits.maxDepth} reached; skipped` });
          continue;
        }
        if (!visited.has(child.href)) queue.push({ url: child.href, depth: depth + 1 });
      }
      continue;
    }
    for (const loc of extractLocs(res.text, "url")) {
      const page = sameOrigin(loc, normOrigin);
      if (!page) {
        problems.push({ url: loc, message: "external or invalid page URL skipped" });
        continue;
      }
      if (isXmlUrl(page)) {
        problems.push({ url: page.href, message: "XML URL listed as page in urlset; not audited as HTML" });
        continue;
      }
      if (pages.size >= limits.maxPages) {
        problems.push({ url, message: `page limit ${limits.maxPages} reached; rest skipped` });
        break;
      }
      pages.add(page.href);
    }
  }
  return { pages: [...pages], sitemapsVisited: [...visited], problems };
}
