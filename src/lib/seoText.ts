/** A display target, not a Google indexing limit. Never cut a legal name mid-word. */
const TITLE_TARGET = 60;

export function formatSeoTitle(value: string): string {
  let title = value.trim();
  if (title.length <= TITLE_TARGET) return title;
  title = title.replace(/\s+[|·—–]\s+Dogovori\.net$/i, "");
  if (title.length <= TITLE_TARGET) return title;
  title = title
    .replace(/ — образец на български$/, " — образец")
    .replace(/ — пакет документи по сектор$/, " — документи")
    .replace(/ \| Комплект документи$/, " — комплект")
    .replace(/ — договори, шаблони и документи$/, " — документи")
    .replace(/ — (\d+) шаблона на български$/, " — $1 шаблона");
  if (title.length > TITLE_TARGET) {
    title = title.replace(/ — (образец|комплект|документи)$/, "");
  }
  // Some precise document names necessarily exceed 60 characters. Preserve
  // their meaning; Google chooses its own title link and display truncation.
  return title;
}

/** Preserve full sentences/qualifications rather than mechanically cutting copy. */
export function formatSeoDescription(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** These /en routes change the interface, not the Bulgarian primary content. */
export function hasBulgarianPrimaryContent(path: string): boolean {
  const bare = path.replace(/^\/en(?=\/|$)/i, "");
  return bare === "/catalog" || bare === "/blog" || bare.startsWith("/shablon/") || bare.startsWith("/blog/");
}
