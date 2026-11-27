/**
 * ВАЛИДАЦИЯ НА ЗАЗЕМЕН ОТГОВОР (анонимен асистент).
 *
 * Няма ръчно сглобени правни твърдения и няма общи псевдо-цитати. Всеки видим
 * цитат трябва да сочи към източник, който реално е бил извлечен и проверен за
 * тази заявка. Ако отговорът не издържи проверката, се прави ЕДИН опит със
 * същия заземен промпт, а след това се връща безопасна грешка без правен
 * отговор.
 *
 * Два капана, които се избягват изрично:
 * 1) Markdown връзки като [Регистрирайте се](/auth) НЕ са правни цитати. Ако се
 *    четат като цитати, всеки коректен отговор с покана би бил отхвърлен.
 * 2) Отговор по правен въпрос БЕЗ нито един реален цитат не е заземен и не се
 *    приема, дори да няма измислени обозначения.
 */

export interface MinimalCitation {
  short_code?: string | null;
  citation_label?: string | null;
  article_no?: string | number | null;
  paragraph_no?: string | number | null;
}

/** Забранени „общи режими" — това са измислени основания. */
const FORBIDDEN_MARKER_RE = /\[\s*приложим\s+общ\s+режим[^\]]*\]/i;

/** Markdown връзка: етикетът ѝ е интерфейс, не правно твърдение. */
const MD_LINK_RE = /\[([^\]\n]{1,200})\]\(([^)\s]{1,400})\)/g;

const MARKER_RE = /\[([^\]\n]{2,160})\]/g;

/** Вътрешна референция към извлечен източник по номер: [S1], [S2] … */
const SOURCE_REF_RE = /^S(\d{1,3})$/i;

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

/** Премахва Markdown връзките, за да не се броят етикетите им за цитати. */
export function stripMarkdownLinks(text: string): string {
  return text.replace(MD_LINK_RE, (_m, _label, _href) => "\u0000LINK\u0000");
}

export interface ReplyValidation {
  readonly ok: boolean;
  readonly reasons: string[];
  /** Брой разпознати валидни препратки към реално извлечени източници. */
  readonly validCitations: number;
}

export interface ValidateOptions {
  /**
   * Дали отговорът е ПРАВЕН по същество. Такъв отговор изисква поне един
   * реален цитат. Кратък отказ/пояснение не изисква цитат.
   */
  readonly requiresCitation?: boolean;
}

/**
 * Валиден цитат е:
 *  - [S<n>], където 1 <= n <= брой извлечени източници; или
 *  - обозначение, което ТОЧНО съвпада с нормализиран код/етикет на извлечен
 *    източник (без разхлабено „съдържа се в").
 * Всичко останало в квадратни скоби, което не е Markdown връзка, е непроверено
 * правно твърдение и отхвърля отговора.
 */
export function validateGroundedReply(
  reply: string,
  citations: MinimalCitation[],
  options: ValidateOptions = {},
): ReplyValidation {
  const reasons: string[] = [];
  const text = String(reply ?? "");
  if (!text.trim()) {
    return { ok: false, reasons: ["empty_reply"], validCitations: 0 };
  }
  if (FORBIDDEN_MARKER_RE.test(text)) {
    reasons.push("fabricated_general_regime_marker");
  }

  const allowed = new Set(allowedCitationKeys(citations));
  // Връзките се изваждат ПРЕДИ търсенето на обозначения.
  const withoutLinks = stripMarkdownLinks(text);
  const markers = [...withoutLinks.matchAll(MARKER_RE)].map((m) => m[1].trim());

  let validCitations = 0;
  for (const marker of markers) {
    const refMatch = SOURCE_REF_RE.exec(marker);
    if (refMatch) {
      const index = Number(refMatch[1]);
      if (index >= 1 && index <= citations.length) {
        validCitations += 1;
      } else {
        reasons.push(`source_ref_out_of_range:${marker.slice(0, 20)}`);
      }
      continue;
    }
    if (allowed.has(normalize(marker))) {
      validCitations += 1;
      continue;
    }
    reasons.push(`citation_not_retrieved:${marker.slice(0, 60)}`);
  }

  // Правен отговор без нито един реален цитат не е заземен.
  if (options.requiresCitation !== false && validCitations === 0) {
    reasons.push("no_retrieved_citation");
  }

  return { ok: reasons.length === 0, reasons, validCitations };
}

export const ANON_LEGAL_ANSWER_UNAVAILABLE = "legal_answer_unavailable";

export const ANON_LEGAL_ANSWER_UNAVAILABLE_MESSAGE_BG =
  "В момента не можем да дадем заземен отговор по този въпрос. " +
  "Не е използвано безплатно съобщение. Опитайте отново или преформулирайте въпроса.";
