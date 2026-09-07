// Bulgarian → Latin transliteration + kebab-case slugifier.
// Used for SEO-friendly /shablon/:slug URLs.

const BG_TO_LAT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
  р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch",
  ш: "sh", щ: "sht", ъ: "a", ь: "y", ю: "yu", я: "ya",
};

/**
 * Legacy slug spellings that must stay byte-identical in URLs even after the
 * visible Bulgarian copy was corrected. The display name now reads
 * "приемно-предавателен", while the indexed, linked and canonical slug remains
 * the historical transliteration "priemo-predavatelen-...".
 */
const LEGACY_SLUG_SPELLINGS: [RegExp, string][] = [
  [/приемно-предавател/g, "приемо-предавател"],
];

export function slugify(input: string): string {
  let lower = input.toLowerCase().trim();
  for (const [pattern, replacement] of LEGACY_SLUG_SPELLINGS) {
    lower = lower.replace(pattern, replacement);
  }

  let out = "";
  for (const ch of lower) {
    if (BG_TO_LAT[ch] !== undefined) out += BG_TO_LAT[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else if (/[\s\-_/.,()«»"'„":;–—]/.test(ch)) out += "-";
    // skip everything else
  }
  return out
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 90);
}
