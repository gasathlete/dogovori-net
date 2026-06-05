// Storage-key helpers for blank templates.
//
// Why this exists: the previous `safeKey()` used `[^a-zA-Z0-9-_]+` which
// stripped ALL Cyrillic characters, collapsing names like "Трудов договор",
// "Анекс към трудов договор...", "Споразумение за прекратяване..." all to
// "_" — every blank in a sector overwrote the same Storage object.
//
// Fix: transliterate BG → Latin, sanitise, and append a short SHA-1 prefix of
// the original (sector, name) tuple to guarantee uniqueness even when
// transliterations clash.

const BG_MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
  р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch",
  ш: "sh", щ: "sht", ъ: "a", ь: "", ю: "yu", я: "ya",
};

function transliterateBg(input: string): string {
  let out = "";
  for (const ch of input) {
    const lower = ch.toLowerCase();
    if (BG_MAP[lower] !== undefined) {
      const t = BG_MAP[lower];
      out += ch === lower ? t : t.toUpperCase();
    } else {
      out += ch;
    }
  }
  return out;
}

async function shortHash(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-1", data);
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < 4; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex; // 8 hex chars
}

/** Pure ASCII slug. NOT guaranteed unique on its own — combine with shortHash. */
export function slugifyBlank(s: string): string {
  return transliterateBg(s)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "blank";
}

/**
 * Build a collision-free Storage path for a blank.
 *   v6/employment/trudov-dogovor-67-kt-a3f7b201.docx
 *   v6-bilingual/services/dvuezichen-trudov-dogovor-bg-en-9d12fe04.docx
 */
export async function buildBlankStoragePath(
  cacheVersion: string,
  sectorId: string,
  documentName: string,
): Promise<string> {
  const sectorSlug = slugifyBlank(sectorId);
  const docSlug = slugifyBlank(documentName);
  const hash = await shortHash(`${sectorId}::${documentName}`);
  return `${cacheVersion}/${sectorSlug}/${docSlug}-${hash}.docx`;
}
