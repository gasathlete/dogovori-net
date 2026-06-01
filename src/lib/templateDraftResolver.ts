// Resolves a `docName` (Bulgarian display name) to a pre-written template
// "бланка" from `src/data/templateDrafts/` and fills its [PLACEHOLDERS] from
// the wizard answers.
//
// We try an exact slug match first; if that fails (catalog uses short names
// while templateDrafts use long descriptive slugs), we fall back to a small
// token-overlap fuzzy match so e.g. "Акт обр. 15 (приемане на строежа)" still
// resolves to "akt-obrazets-15-za-ustanovyavane-godnostta-za-priemane-na-
// stroezha-ot-vazlozhite".

import { slugify } from "@/lib/slugify";
import { isBilingualDocumentName } from "@/lib/bilingualBuildRouting";
import {
  loadTemplateDraft as loadBySlug,
  hasTemplateDraft,
  TEMPLATE_DRAFT_SLUGS,
} from "@/data/templateDrafts/index";

// Maps the leading "kind" word of the Bulgarian docName to the slug prefix
// every draft file of that kind uses. This is a HARD filter for the fuzzy
// fallback so that e.g. "Договор за …" can never resolve to a draft starting
// with `prilozhenie-` / `aneks-` / `dopalnitelno-` even when the appendix
// shares more tokens with the docName (because the appendix's name literally
// contains the word "приложение" / "анекс" / …).
const KIND_PREFIXES: Array<{ test: RegExp; prefix: string }> = [
  // Compound prefixes first — order matters (more specific before generic).
  { test: /^\s*количествено[\s\-]*стойностна\s+сметка/i, prefix: "kolichestveno-stoynostna-smetka" },
  { test: /^\s*допълнително\s+споразумение/i, prefix: "dopalnitelno" },
  { test: /^\s*договор/i, prefix: "dogovor" },
  { test: /^\s*предварителен\s+договор/i, prefix: "predvaritelen-dogovor" },
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
  { test: /^\s*акт\b/i, prefix: "akt" },
  { test: /^\s*сертификат/i, prefix: "sertifikat" },
  { test: /^\s*уведомление/i, prefix: "uvedomlenie" },
  { test: /^\s*препоръка/i, prefix: "preporaka" },
  { test: /^\s*заповед/i, prefix: "zapoved" },
  { test: /^\s*бланка/i, prefix: "blanka" },
  { test: /^\s*дропшипинг/i, prefix: "dropshipping" },
  { test: /^\s*длъжностна\s+характеристика/i, prefix: "dlazhnostna-harakteristika" },
];

function detectKindPrefix(docName: string): string | null {
  for (const k of KIND_PREFIXES) {
    if (k.test.test(docName)) return k.prefix;
  }
  return null;
}

function resolveSlug(docName: string): string | null {
  const wanted = slugify(docName);
  if (!wanted) return null;
  if (hasTemplateDraft(wanted)) return wanted;

  const tokens = wanted.split("-").filter((t) => t.length >= 3);
  if (tokens.length === 0) return null;

  const kindPrefix = detectKindPrefix(docName);
  // When a kind prefix is recognised, fuzzy match candidates are restricted
  // to slugs that start with the same prefix. This prevents an appendix /
  // anex draft from "winning" the fuzzy match for a main contract just
  // because it shares the word "приложение" / "анекс" in its slug.
  const candidates = kindPrefix
    ? TEMPLATE_DRAFT_SLUGS.filter((s) => s.startsWith(kindPrefix + "-") || s === kindPrefix)
    : TEMPLATE_DRAFT_SLUGS;

  // Stricter threshold: require either >= 2 shared tokens OR >= 50% coverage
  // of the wanted tokens (whichever is larger). Avoids weak 2-token matches
  // on long docNames where 2 tokens cover < 20% of the meaning.
  const minScore = Math.max(2, Math.ceil(tokens.length * 0.5));

  const leadingTokens = new Set(tokens.slice(0, 3));

  let best: { slug: string; score: number; leadingScore: number; length: number } | null = null;
  for (const k of candidates) {
    let score = 0;
    let leadingScore = 0;
    for (const t of tokens) {
      if (k.includes(t)) {
        score++;
        if (leadingTokens.has(t)) leadingScore++;
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


const draftCache = new Map<string, string>();

export async function loadTemplateDraft(docName: string | undefined | null): Promise<string | null> {
  if (!docName) return null;
  if (isBilingualDocumentName(docName)) return null;
  const slug = resolveSlug(docName);
  if (!slug) return null;
  if (draftCache.has(slug)) return draftCache.get(slug)!;
  const p = loadBySlug(slug);
  if (!p) return null;
  try {
    const text = await p;
    draftCache.set(slug, text);
    return text;
  } catch {
    return null;
  }
}


// ---------- Placeholder substitution ----------

// Maps `[ПЛЕЙСХОЛДЪР]` → wizard answer key.
// Несъвпадналите плейсхолдъри остават с квадратни скоби, видими в превюто.
const PLACEHOLDER_MAP: Array<{ patterns: RegExp[]; resolve: (ctx: SubCtx) => string | undefined }> = [
  // Дата
  {
    patterns: [/^\s*ДАТА\s*$/i, /^\s*ДАТА\s+НА\s+СЪСТАВЯНЕ\s*$/i],
    resolve: (c) => c.date,
  },
  // Място / град
  {
    patterns: [/^\s*НАСЕЛЕНО\s+МЯСТО\s*$/i, /^\s*ГРАД\s*$/i, /^\s*МЯСТО\s*$/i],
    resolve: (c) => c.city,
  },
  // Възложител / страна А
  {
    patterns: [
      /^\s*ИМЕ.*ФИРМА.*ВЪЗЛОЖИТЕЛ.*$/i,
      /^\s*ТЪРГОВСКА\s+ФИРМА.*ВЪЗЛОЖИТЕЛ.*$/i,
      /^\s*ВЪЗЛОЖИТЕЛ.*$/i,
    ],
    resolve: (c) => c.partyAName,
  },
  {
    patterns: [/^\s*ЕГН.*ВЪЗЛОЖИТЕЛ.*$/i, /^\s*ЕИК.*ВЪЗЛОЖИТЕЛ.*$/i, /^\s*БУЛСТАТ.*ВЪЗЛОЖИТЕЛ.*$/i],
    resolve: (c) => c.partyAId,
  },
  {
    patterns: [/^\s*АДРЕС.*ВЪЗЛОЖИТЕЛ.*$/i, /^\s*СЕДАЛИЩЕ.*ВЪЗЛОЖИТЕЛ.*$/i],
    resolve: (c) => c.partyAAddress,
  },
  {
    patterns: [/^\s*ИМЕ.*ПРЕДСТАВИТЕЛ.*ВЪЗЛОЖИТЕЛ.*$/i, /^\s*ПРЕДСТАВИТЕЛ.*ВЪЗЛОЖИТЕЛ.*$/i],
    resolve: (c) => c.partyARep,
  },
  // Изпълнител / Строител / страна Б
  {
    patterns: [
      /^\s*ИМЕ.*ФИРМА.*ИЗПЪЛНИТЕЛ.*$/i,
      /^\s*ТЪРГОВСКА\s+ФИРМА.*ИЗПЪЛНИТЕЛ.*$/i,
      /^\s*ИЗПЪЛНИТЕЛ.*$/i,
      /^\s*СТРОИТЕЛ.*$/i,
    ],
    resolve: (c) => c.partyBName,
  },
  {
    patterns: [/^\s*ЕИК.*ИЗПЪЛНИТЕЛ.*$/i, /^\s*ЕГН.*ИЗПЪЛНИТЕЛ.*$/i, /^\s*БУЛСТАТ.*ИЗПЪЛНИТЕЛ.*$/i, /^\s*ЕИК.*СТРОИТЕЛ.*$/i],
    resolve: (c) => c.partyBId,
  },
  {
    patterns: [/^\s*АДРЕС.*ИЗПЪЛНИТЕЛ.*$/i, /^\s*СЕДАЛИЩЕ.*ИЗПЪЛНИТЕЛ.*$/i, /^\s*АДРЕС.*СТРОИТЕЛ.*$/i],
    resolve: (c) => c.partyBAddress,
  },
  {
    patterns: [/^\s*ИМЕ.*ПРЕДСТАВИТЕЛ.*ИЗПЪЛНИТЕЛ.*$/i, /^\s*ПРЕДСТАВИТЕЛ.*ИЗПЪЛНИТЕЛ.*$/i, /^\s*ИМЕ.*ПРЕДСТАВИТЕЛ.*СТРОИТЕЛ.*$/i],
    resolve: (c) => c.partyBRep,
  },
  // Стойност / срок (мин. покритие)
  {
    patterns: [/^\s*СТОЙНОСТ.*$/i, /^\s*ОБЩА\s+СТОЙНОСТ.*$/i, /^\s*ЦЕНА.*$/i],
    resolve: (c) => c.value,
  },
  {
    patterns: [/^\s*СРОК.*$/i, /^\s*БРОЙ\s+ДНИ.*$/i],
    resolve: (c) => c.deadline,
  },
];

interface SubCtx {
  date?: string;
  city?: string;
  partyAName?: string;
  partyAId?: string;
  partyAAddress?: string;
  partyARep?: string;
  partyBName?: string;
  partyBId?: string;
  partyBAddress?: string;
  partyBRep?: string;
  value?: string;
  deadline?: string;
}

export interface FillContext {
  answers: Record<string, string>;
  signature?: { name_a?: string; name_b?: string; city?: string; date?: string };
}

export function fillTemplateDraft(draft: string, ctx: FillContext): string {
  const a = ctx.answers || {};
  const sig = ctx.signature || {};
  const sub: SubCtx = {
    date: sig.date || a.date || undefined,
    city: sig.city || a.city || undefined,
    partyAName: a.party_a_name || sig.name_a || undefined,
    partyAId: a.party_a_id || a.party_a_egn || a.party_a_eik || undefined,
    partyAAddress: a.party_a_address || undefined,
    partyARep: a.party_a_rep || undefined,
    partyBName: a.party_b_name || sig.name_b || undefined,
    partyBId: a.party_b_id || a.party_b_egn || a.party_b_eik || undefined,
    partyBAddress: a.party_b_address || undefined,
    partyBRep: a.party_b_rep || undefined,
    value: a.value || undefined,
    deadline: a.deadline || undefined,
  };

  return draft.replace(/\[([^\]\n]+)\]/g, (full, inner: string) => {
    for (const rule of PLACEHOLDER_MAP) {
      if (rule.patterns.some((p) => p.test(inner))) {
        const v = rule.resolve(sub);
        if (v && v.trim()) return v.trim();
      }
    }
    return full; // leave placeholder visible
  });
}
