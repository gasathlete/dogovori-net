/**
 * ВАЛИДАЦИЯ НА ЗАЗЕМЕН ОТГОВОР (анонимен асистент).
 *
 * Няма ръчно сглобени правни твърдения и няма общи псевдо-цитати. Всеки видим
 * цитат трябва да сочи към източник, който реално е бил извлечен и проверен за
 * тази заявка. Ако отговорът не издържи проверката, се прави ЕДИН опит със
 * същия заземен промпт, а след това се връща безопасна грешка без правен
 * отговор.
 */

export interface MinimalCitation {
  short_code?: string | null;
  citation_label?: string | null;
  article_no?: string | number | null;
  paragraph_no?: string | number | null;
}

/** Забранени „общи режими" — това са измислени основания. */
const FORBIDDEN_MARKER_RE = /\[\s*приложим\s+общ\s+режим[^\]]*\]/i;

const MARKER_RE = /\[([^\]\n]{2,160})\]/g;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s.,;]+/g, " ").trim();
}

/** Допустимите обозначения, изведени само от извлечените източници. */
export function allowedCitationKeys(citations: MinimalCitation[]): string[] {
  const keys: string[] = [];
  for (const c of citations) {
    if (c.short_code) keys.push(normalize(String(c.short_code)));
    if (c.citation_label) keys.push(normalize(String(c.citation_label).replace(/^\[|\]$/g, "")));
  }
  return keys.filter((k) => k.length > 1);
}

export interface ReplyValidation {
  readonly ok: boolean;
  readonly reasons: string[];
}

/**
 * Цитат е валиден, когато съдържа обозначение на извлечен източник. Маркерите
 * за вътрешни бележки (например [S1]) не се броят за правно твърдение и се
 * игнорират, но измислените „общи режими" водят до отхвърляне.
 */
export function validateGroundedReply(
  reply: string,
  citations: MinimalCitation[],
): ReplyValidation {
  const reasons: string[] = [];
  const text = String(reply ?? "");
  if (!text.trim()) {
    return { ok: false, reasons: ["empty_reply"] };
  }
  if (FORBIDDEN_MARKER_RE.test(text)) {
    reasons.push("fabricated_general_regime_marker");
  }

  const allowed = allowedCitationKeys(citations);
  const markers = [...text.matchAll(MARKER_RE)].map((m) => m[1]);
  const legalMarkers = markers.filter((m) => !/^S\d+$/i.test(m.trim()));

  for (const marker of legalMarkers) {
    const norm = normalize(marker);
    const matched = allowed.some((key) => norm.includes(key) || key.includes(norm));
    if (!matched) {
      reasons.push(`citation_not_retrieved:${marker.slice(0, 60)}`);
    }
  }

  return { ok: reasons.length === 0, reasons };
}

export const ANON_LEGAL_ANSWER_UNAVAILABLE = "legal_answer_unavailable";

export const ANON_LEGAL_ANSWER_UNAVAILABLE_MESSAGE_BG =
  "В момента не можем да дадем заземен отговор по този въпрос. " +
  "Не е използвано безплатно съобщение. Опитайте отново или преформулирайте въпроса.";
