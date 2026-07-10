// Deno-side resolver: docName → pre-authored blank draft (raw text).
// Mirrors the logic of src/lib/templateDraftResolver.ts (exact match, then
// filtered token-overlap fallback) so preview and download stay in sync.

import draftsMap from "./blank-drafts.json" with { type: "json" };

const DRAFTS = draftsMap as Record<string, string>;
const SLUGS = Object.keys(DRAFTS);

// ---- slugify (mirror of src/lib/slugify.ts) ----
const BG_TO_LAT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p",
  р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch",
  ш: "sh", щ: "sht", ъ: "a", ь: "y", ю: "yu", я: "ya",
};

export function slugify(input: string): string {
  const lower = (input ?? "").toLowerCase().trim();
  let out = "";
  for (const ch of lower) {
    if (BG_TO_LAT[ch] !== undefined) out += BG_TO_LAT[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else if (/[\s\-_/.,()«»"'„":;–—]/.test(ch)) out += "-";
  }
  return out.replace(/-+/g, "-").replace(/^-|-$/g, "").substring(0, 90);
}

const KIND_PREFIXES: Array<{ test: RegExp; prefix: string }> = [
  { test: /^\s*количествено[\s\-]*стойностна\s+сметка/i, prefix: "kolichestveno-stoynostna-smetka" },
  { test: /^\s*допълнително\s+споразумение/i, prefix: "dopalnitelno" },
  { test: /^\s*предварителен\s+договор/i, prefix: "predvaritelen-dogovor" },
  { test: /^\s*длъжностна\s+характеристика/i, prefix: "dlazhnostna-harakteristika" },
  { test: /^\s*приемо[\s\-]*предавателен\s+протокол/i, prefix: "priemo-predavatelen-protokol" },
  { test: /^\s*граждански\s+договор/i, prefix: "dogovor" },
  { test: /^\s*срочен\s+трудов\s+договор/i, prefix: "dogovor" },
  { test: /^\s*трудов\s+договор/i, prefix: "dogovor" },
  { test: /^\s*общо\s+пълномощно/i, prefix: "palnomoshtno" },
  { test: /^\s*nda\b/i, prefix: "dogovor" },
  { test: /^\s*аренда/i, prefix: "dogovor" },
  { test: /^\s*предизвестие/i, prefix: "uvedomlenie" },
  { test: /^\s*дисциплинарно\s+наказание/i, prefix: "zapoved" },
  { test: /^\s*договор/i, prefix: "dogovor" },
  { test: /^\s*приложение/i, prefix: "prilozhenie" },
  { test: /^\s*анекс/i, prefix: "aneks" },
  { test: /^\s*споразумение/i, prefix: "sporazumenie" },
  { test: /^\s*декларация/i, prefix: "deklaratsiya" },
  { test: /^\s*пълномощно/i, prefix: "palnomoshtno" },
  { test: /^\s*протокол/i, prefix: "protokol" },
  { test: /^\s*оферта/i, prefix: "oferta" },
  { test: /^\s*фактура/i, prefix: "faktura" },
  { test: /^\s*разписка/i, prefix: "razpiska" },
  { test: /^\s*покана/i, prefix: "pokana" },
  { test: /^\s*заявление/i, prefix: "zayavlenie" },
  { test: /^\s*молба/i, prefix: "molba" },
  { test: /^\s*решение/i, prefix: "reshenie" },
  { test: /^\s*акт(?:\s|\.|,|$)/i, prefix: "akt" },
  { test: /^\s*сертификат/i, prefix: "sertifikat" },
  { test: /^\s*уведомление/i, prefix: "uvedomlenie" },
  { test: /^\s*препоръка/i, prefix: "preporaka" },
  { test: /^\s*заповед/i, prefix: "zapoved" },
  { test: /^\s*бланка/i, prefix: "blanka" },
  { test: /^\s*дропшипинг/i, prefix: "dropshipping" },
];

function detectKindPrefix(docName: string): string | null {
  for (const k of KIND_PREFIXES) if (k.test.test(docName)) return k.prefix;
  return null;
}

function tokenMatchesSlug(t: string, slugWords: string[]): boolean {
  for (const w of slugWords) {
    if (w === t) return true;
    if (w.length >= 3 && t.length >= 3 && (w.startsWith(t) || t.startsWith(w))) return true;
  }
  return false;
}

export function resolveDraftSlug(docName: string): string | null {
  const wanted = slugify(docName);
  if (!wanted) return null;
  if (DRAFTS[wanted]) return wanted;

  const allTokens = wanted.split("-").filter((t) => t.length >= 3);
  if (allTokens.length === 0) return null;

  const numberTokens = (wanted.match(/\d+/g) || []).filter((n) => n.length >= 1);
  const kindPrefix = detectKindPrefix(docName);
  const kindTokens = new Set((kindPrefix || "").split("-").filter((t) => t.length >= 3));
  const STOP = new Set(["pri", "kam", "kato", "ili", "chl", "pod", "nad", "bez", "sas", "sled"]);
  const seen = new Set<string>();
  const distinctiveTokens: string[] = [];
  for (const t of allTokens) {
    if (kindTokens.has(t) || STOP.has(t) || seen.has(t)) continue;
    seen.add(t);
    distinctiveTokens.push(t);
  }
  if (distinctiveTokens.length === 0 && numberTokens.length === 0) return null;

  const candidates = kindPrefix
    ? SLUGS.filter((s) => s.startsWith(kindPrefix + "-") || s === kindPrefix)
    : SLUGS;

  const minScore = distinctiveTokens.length === 0
    ? 0
    : Math.max(2, Math.ceil(distinctiveTokens.length * 0.6));
  const requiredLeading = distinctiveTokens.slice(0, Math.min(2, distinctiveTokens.length));

  let best: { slug: string; score: number; leadingScore: number; length: number } | null = null;
  for (const k of candidates) {
    const slugWords = k.split("-").filter((w) => w.length >= 3 && !STOP.has(w));
    if (numberTokens.length > 0) {
      const slugAllWords = k.split("-");
      let numOk = true;
      for (const n of numberTokens) if (!slugAllWords.includes(n)) { numOk = false; break; }
      if (!numOk) continue;
    }
    let leadingOk = true;
    for (const lt of requiredLeading) {
      if (!tokenMatchesSlug(lt, slugWords)) { leadingOk = false; break; }
    }
    if (!leadingOk) continue;
    let score = 0;
    let leadingScore = 0;
    for (const t of distinctiveTokens) {
      if (tokenMatchesSlug(t, slugWords)) {
        score++;
        if (requiredLeading.includes(t)) leadingScore++;
      }
    }
    if (score < minScore) continue;
    if (
      !best ||
      score > best.score ||
      (score === best.score && leadingScore > best.leadingScore) ||
      (score === best.score && leadingScore === best.leadingScore && k.length < best.length)
    ) {
      best = { slug: k, score, leadingScore, length: k.length };
    }
  }
  return best?.slug ?? null;
}

export function getDraftText(docName: string): string | null {
  const slug = resolveDraftSlug(docName);
  return slug ? DRAFTS[slug] ?? null : null;
}

// ---- Parser: raw draft text → BlankPayload ----

export interface BlankPayload {
  title: string;
  preamble: string;
  clauses: Array<{ number: string; title: string; body: string }>;
  closing: string;
}

const ARTICLE_RE = /^\s*(Чл\.?\s*\d+[а-я]?)\.?\s*(.*)$/i;
const ROMAN_RE = /^\s*([IVX]+)\.\s+([А-ЯA-Z][^\n]*)$/;
// Common "section title in ALL CAPS" (no leading number)
const CAPS_HEADING_RE = /^\s*([А-Я][А-Я\s,\-„"‑\/]{4,80})\s*$/;

/**
 * Split a pre-authored draft into title / preamble / clauses / closing.
 * Preserves the original wording verbatim — only structures it for the DOCX
 * builder used by download-blank.
 */
export function parseDraftToBlankPayload(raw: string): BlankPayload {
  const text = raw.replace(/\r\n?/g, "\n").trim();
  const lines = text.split(/\n/);

  const title = (lines.shift() ?? "").trim() || "Бланка";

  type Sec = { number: string; title: string; body: string[] };
  const preamble: string[] = [];
  const clauses: Sec[] = [];
  let closing: string[] = [];

  let current: Sec | null = null;
  let currentRoman: { number: string; title: string } | null = null;
  let inClosing = false;

  const CLOSING_MARKERS = [
    /настоящ(ият|ото|ата)\s.*(състав|подпис|екземпляр)/i,
    /^\s*дата\s*:/i,
    /^\s*подпис/i,
    /^\s*за\s+възложител/i,
    /^\s*за\s+изпълнител/i,
    /^\s*декларатор\s*:/i,
    /^\.\.\.\.\.+/,
  ];

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");

    // Detect closing zone
    if (!inClosing) {
      for (const re of CLOSING_MARKERS) {
        if (re.test(line)) { inClosing = true; break; }
      }
    }
    if (inClosing) {
      closing.push(line);
      continue;
    }

    const mArt = line.match(ARTICLE_RE);
    if (mArt) {
      // Start a new clause. Title = current roman title (if any) or first sentence tail.
      const number = mArt[1].replace(/\s+/g, " ").trim();
      const tail = (mArt[2] ?? "").trim();
      const titleForClause = currentRoman?.title || tail.split(/[.:]/)[0].slice(0, 60) || "";
      current = { number: `${number}.`, title: titleForClause, body: tail ? [tail] : [] };
      clauses.push(current);
      currentRoman = null;
      continue;
    }

    const mRoman = line.match(ROMAN_RE);
    if (mRoman) {
      // Roman section header — remember for next clause; do NOT create a clause itself
      currentRoman = { number: mRoman[1] + ".", title: mRoman[2].trim() };
      continue;
    }

    const mCaps = line.match(CAPS_HEADING_RE);
    if (mCaps && clauses.length > 0) {
      // ALL-CAPS heading between articles → remember as next clause title
      currentRoman = { number: "", title: mCaps[1].trim() };
      continue;
    }

    if (current) {
      if (line.trim() || current.body.length) current.body.push(line);
    } else {
      preamble.push(line);
    }
  }

  // Trim empty trailing lines from bodies.
  for (const c of clauses) {
    while (c.body.length && !c.body[c.body.length - 1].trim()) c.body.pop();
  }
  while (preamble.length && !preamble[preamble.length - 1].trim()) preamble.pop();

  return {
    title,
    preamble: preamble.join("\n").trim(),
    clauses: clauses.length
      ? clauses.map((c) => ({ number: c.number, title: c.title || "", body: c.body.join("\n").trim() }))
      : [
          // Ultra-defensive fallback: if no articles were detected, put the
          // whole body in one clause so nothing is lost.
          { number: "", title: "", body: text.split("\n").slice(1).join("\n").trim() },
        ],
    closing: closing.join("\n").trim(),
  };
}
