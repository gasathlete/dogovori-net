// Detects unfilled placeholders in a document payload before export.
//
// The generator and the templates use several placeholder conventions:
//   [ИМЕ НА СТРАНАТА]   — square-bracket slots
//   {{party_name}}      — mustache slots
//   ______              — blank lines to be filled by hand
//   XXXX / ХХХХ         — masked values
//
// Exporting a document that still contains them produces a legally useless
// file, so the download flow asks the user to confirm explicitly.

const PATTERNS: RegExp[] = [
  /\[[^\]\n]{2,60}\]/g,
  /\{\{[^}\n]{1,60}\}\}/g,
  /_{4,}/g,
  /(?:^|[\s(])[XХ]{4,}(?=$|[\s).,;:])/g,
];

/** Collects the human-readable text of every string leaf in a payload. */
function collectStrings(value: unknown, out: string[], depth = 0) {
  if (depth > 8 || value == null) return;
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, out, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectStrings(v, out, depth + 1);
    }
  }
}

/**
 * Returns a de-duplicated list of unfilled placeholders found in the payload,
 * capped at `limit` entries for display purposes.
 */
export function findUnfilledPlaceholders(payload: unknown, limit = 12): string[] {
  const strings: string[] = [];
  collectStrings(payload, strings);
  const found = new Set<string>();
  for (const s of strings) {
    for (const re of PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(s)) !== null) {
        const hit = m[0].trim();
        if (hit) found.add(hit.length > 70 ? `${hit.slice(0, 67)}…` : hit);
        if (found.size >= limit * 3) break;
      }
    }
  }
  return Array.from(found).slice(0, limit);
}

/**
 * Resolves when the user confirms they want to export despite unfilled
 * placeholders. Rejects with {cancelled:true} when they go back to editing.
 * Resolves immediately when nothing is unfilled.
 */
export function ensurePlaceholdersReviewed(payload: unknown): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const placeholders = findUnfilledPlaceholders(payload);
  if (placeholders.length === 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const onResolved = (e: Event) => {
      window.removeEventListener("placeholders:resolved", onResolved);
      const proceed = (e as CustomEvent<{ proceed: boolean }>).detail?.proceed;
      if (proceed) resolve();
      else reject({ cancelled: true, placeholders });
    };
    window.addEventListener("placeholders:resolved", onResolved);
    import("@/lib/bufferedEvents").then(({ dispatchBuffered }) =>
      dispatchBuffered("placeholders:request", { placeholders }),
    );
  });
}
