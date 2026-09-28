export type SitemapEntry = { loc: string; lastmod?: string };

const xml = (value: string) => value.replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
}[c]!));

/** Only editorially known modification dates belong here; never checkout mtime. */
export function renderUrlset(site: string, entries: readonly SitemapEntry[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map((e) =>
    `  <url><loc>${xml(new URL(e.loc, site).href)}</loc>${e.lastmod ? `<lastmod>${xml(e.lastmod)}</lastmod>` : ""}</url>`,
  ).join("\n")}\n</urlset>\n`;
}
