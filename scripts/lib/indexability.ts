export type IndexabilityIssue = { level: "error" | "warning"; rule: string; message: string };
export const PUBLIC_SEO_ROUTES = ["/", "/plans", "/catalog", "/blog", "/contacts", "/produkti", "/paketi", "/komplekti",
  "/paketi/naemi", "/paketi/uslugi-svobodni-profesii", "/paketi/ueb-digitalni-agentsii", "/paketi/sluzhiteli-rabotodateli",
  "/komplekti/naem-zhilishte", "/blog/opis-na-obzavezhdane-pri-naem",
  "/blog/obhvat-na-usluga-predi-oferta", "/blog/predavane-na-ueb-proekt-dostapi",
  "/blog/promyana-na-dlazhnost-danni-sporazumenie"] as const;

function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4];
  return out;
}
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
function headerBlocksGoogle(value: string): boolean {
  let agent = "*";
  return value.split(",").some((part) => {
    const match = part.trim().match(/^([\w*-]+):\s*(.*)$/);
    const directive = match ? match[2] : part.trim();
    if (match) agent = match[1].toLowerCase();
    return ["*", "googlebot"].includes(agent) && /^(noindex|none)$/i.test(directive);
  });
}

/** Read-only initial-HTML check; not Google's rendered/indexed verdict. */
export function assessIndexability(url: string, status: number, html: string, headers: { get(name: string): string | null }): IndexabilityIssue[] {
  const issues: IndexabilityIssue[] = [];
  const add = (level: IndexabilityIssue["level"], rule: string, message: string) => issues.push({ level, rule, message });
  if (status !== 200) add("error", "status", `Expected canonical HTTP 200; received ${status}`);
  if (!/text\/html/i.test(headers.get("content-type") ?? "")) add("error", "content-type", "Indexable page must return HTML");
  if (headerBlocksGoogle(headers.get("x-robots-tag") ?? "")) add("error", "x-robots-tag", "HTTP directive prevents Google indexing");
  const clean = html.replace(/<!--[\s\S]*?-->/g, "");
  const head = (clean.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  const links = [...head.matchAll(/<link\b[^>]*>/gi)].map((m) => attributes(m[0])).filter((a) => a.rel?.toLowerCase().split(/\s+/).includes("canonical"));
  if (links.length !== 1) add("error", "canonical-count", `Expected one canonical in head, found ${links.length}`);
  else {
    const canonical = decode(links[0].href ?? "");
    if (canonical.replace(/\/$/, "") !== url.replace(/\/$/, "")) add("error", "canonical-mismatch", `Canonical ${canonical} does not match ${url}`);
  }
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => attributes(m[0]));
  for (const a of metas) {
    if (["robots", "googlebot"].includes(a.name?.toLowerCase()) && /(?:^|[\s,])(noindex|none)(?:$|[\s,])/i.test(a.content ?? "")) add("error", "robots", `Blocking ${a.name} directive`);
    if (a["http-equiv"]?.toLowerCase() === "refresh") add("error", "meta-refresh", "Unexpected meta refresh on canonical page");
  }
  const titles = [...head.matchAll(/<title\b[^>]*>([^<]*)<\/title>/gi)];
  if (titles.length !== 1 || !titles[0][1].trim()) add("error", "title", "Expected one nonempty title");
  else if (decode(titles[0][1]).length > 60) add("warning", "title-length", "Title exceeds the editorial 60-character target (not an indexing block)");
  const descriptions = metas.filter((a) => a.name?.toLowerCase() === "description");
  if (descriptions.length !== 1 || !descriptions[0].content?.trim()) add("warning", "description", "Expected one nonempty description");
  else if (decode(descriptions[0].content).length > 160) add("warning", "description-length", "Description exceeds editorial target");
  const body = clean.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  const h1 = (body.match(/<h1\b/gi) ?? []).length;
  if (h1 !== 1) add("warning", "h1", `Expected one H1; found ${h1}`);
  return issues;
}
