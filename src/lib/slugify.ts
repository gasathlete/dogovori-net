// Bulgarian → Latin transliteration + kebab-case slugifier.
// Used for SEO-friendly /shablon/:slug URLs.

const BG_TO_LAT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
  р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch",
  ш: "sh", щ: "sht", ъ: "a", ь: "y", ю: "yu", я: "ya",
};

export function slugify(input: string): string {
  const lower = input.toLowerCase().trim();
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
