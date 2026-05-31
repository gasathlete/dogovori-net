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

type Loader = () => Promise<string>;

let loaderMap: Record<string, Loader> | null = null;
let keys: string[] = [];

async function ensureLoaders() {
  if (loaderMap) return;
  // Lazy: only fetch the index when first needed.
  const mod = await import("@/data/templateDrafts/index");
  // The auto-generated index file uses a default export of the loaders map.
  // It actually exports as a named `loaders` const via `export default`, so
  // we accept either shape.
  loaderMap =
    (mod as unknown as { default?: Record<string, Loader>; loaders?: Record<string, Loader> })
      .default ??
    (mod as unknown as { loaders?: Record<string, Loader> }).loaders ??
    null;
  if (!loaderMap) loaderMap = {};
  keys = Object.keys(loaderMap);
}

function resolveSlug(docName: string): string | null {
  const wanted = slugify(docName);
  if (!wanted) return null;
  if (loaderMap && loaderMap[wanted]) return wanted;

  const tokens = wanted.split("-").filter((t) => t.length >= 3);
  if (tokens.length === 0) return null;

  let best: { slug: string; score: number; length: number } | null = null;
  for (const k of keys) {
    let score = 0;
    for (const t of tokens) if (k.includes(t)) score++;
    if (score < 2) continue;
    if (
      !best ||
      score > best.score ||
      (score === best.score && k.length < best.length)
    ) {
      best = { slug: k, score, length: k.length };
    }
  }
  return best?.slug ?? null;
}

const draftCache = new Map<string, string>();

export async function loadTemplateDraft(docName: string | undefined | null): Promise<string | null> {
  if (!docName) return null;
  await ensureLoaders();
  const slug = resolveSlug(docName);
  if (!slug || !loaderMap) return null;
  if (draftCache.has(slug)) return draftCache.get(slug)!;
  try {
    const text = await loaderMap[slug]();
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
