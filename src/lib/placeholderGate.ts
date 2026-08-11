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

// Placeholder-и, които по замисъл се попълват от потребителя ЛОКАЛНО след
// сваляне — Договори.нет не събира и не съхранява лични данни. Когато
// потребителят потвърди „Ще попълня личните данни след сваляне", те не се
// отчитат нито в export-гейта, нито в автоматичната AI ревизия.
const PERSONAL_DATA_KEYWORDS = [
  "име", "имена", "егн", "лнч", "еик", "булстат", "адрес", "седалище",
  "iban", "ибан", "банк", "сметка", "телефон", "тел.", "имейл", "email",
  "e-mail", "лична карта", "л.к", "паспорт", "мол", "представител",
  "управител", "пълномощник", "град", "дата", "подпис", "страна",
  "възложител", "изпълнител", "наемодател", "наемател", "продавач",
  "купувач", "прехвърлител", "приобретател", "цедент", "цесионер",
];

/** Дали даден placeholder е поле за лични/идентификационни данни. */
export function isPersonalDataPlaceholder(raw: string): boolean {
  const inner = raw
    .replace(/^\[|\]$/g, "")
    .replace(/^\{\{|\}\}$/g, "")
    .trim()
    .toLowerCase();
  if (!inner) return false;
  // Голи черти/маски (______, XXXX) винаги са ръчно попълване на данни.
  if (/^[_\sXХх]+$/.test(inner)) return true;
  return PERSONAL_DATA_KEYWORDS.some((k) => inner.includes(k));
}

const FILL_LATER_KEY = "fill-personal-data-later";

/** Прочита потвърждението „ще попълня личните данни след сваляне". */
export function getFillLaterPersonalData(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(FILL_LATER_KEY) === "1";
  } catch {
    return false;
  }
}

export function setFillLaterPersonalData(on: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (on) sessionStorage.setItem(FILL_LATER_KEY, "1");
    else sessionStorage.removeItem(FILL_LATER_KEY);
  } catch {
    /* ignore quota errors */
  }
}

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
export function findUnfilledPlaceholders(
  payload: unknown,
  limit = 12,
  opts: { ignorePersonalData?: boolean } = {},
): string[] {
  const ignorePersonal = opts.ignorePersonalData ?? getFillLaterPersonalData();
  const strings: string[] = [];
  collectStrings(payload, strings);
  const found = new Set<string>();
  for (const s of strings) {
    for (const re of PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(s)) !== null) {
        const hit = m[0].trim();
        if (ignorePersonal && isPersonalDataPlaceholder(hit)) continue;
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
export function ensurePlaceholdersReviewed(
  payload: unknown,
  opts: { ignorePersonalData?: boolean } = {},
): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const placeholders = findUnfilledPlaceholders(payload, 12, opts);
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
