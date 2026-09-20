/**
 * P0-E2 — цялост на цитатите.
 *
 * Правно твърдение има смисъл САМО ако цитатът зад него съществува в
 * ПРОВЕРЕНИТЕ извлечени източници.
 *
 * Договорът с модела (виж `_shared/legal-rag.ts`) е: извадките се подават като
 * `[S1] … [Sn]` и моделът цитира ТОЧНО тези номера. Затова:
 *  - `[S#]` в обхвата 1..n е ВАЛИDEN цитат към реално извлечена извадка;
 *  - `[S0]`, `[S{n+1}]` и всеки номер извън обхвата са измислени и се отхвърлят;
 *  - твърдение за член/алинея или съдебна практика се проверява срещу
 *    метаданните на ПОСОЧЕНАТА извадка, а не срещу „има някакви цитати";
 *  - няма „общ режим", няма „източник N", няма измислени актове.
 *
 * Ако проверката падне след едно ограничено поправяне, черновата НЕ се доставя.
 */

export interface VerifiedCitation {
  short_code?: unknown;
  article_no?: unknown;
  paragraph_no?: unknown;
  citation_label?: unknown;
}

/** Кандидат-цитат в текста: `[S2]`, `[ЗЗД, чл. 79]`, `[ТР № 4/2013 ОСГТК ВКС]`. */
const CANDIDATE_RE = /\[([^\]\n]{1,140})\]/g;
/** Маркдаун линк `[текст](url)` не е цитат. */
const LINK_AHEAD = /^\(/;

const SOURCE_REF_RE = /^S(\d{1,3})$/i;

const LEGALISH_RE =
  /(^[А-ЯЁA-Z]{2,10}\b|^Регламент|^GDPR|^Директив|^ТР\s*№|^Решение\s*№|^Реш\.\s*№|^Конституц|чл\.\s*\d)/;

/** „Общ режим" и анонимни „източник N" никога не са проверим цитат. */
const FORBIDDEN_RE = /(приложим\s+общ\s+режим|източник\s*№?\s*\d)/i;

function normalizeCode(raw: string): string {
  return raw.replace(/[.\s]/g, "").toUpperCase();
}

function normalizeArticle(raw: string): string {
  return raw.replace(/\s/g, "").toLowerCase();
}

/** Един проверен източник, точно както е подаден на модела като `[S<n>]`. */
export interface VerifiedSource {
  /** 1-базиран номер — същият, който вижда моделът. */
  index: number;
  code: string;
  article: string;
  paragraph: string;
  label: string;
}

export interface VerifiedIndex {
  codes: Set<string>;
  articles: Set<string>;
  labels: Set<string>;
  sources: VerifiedSource[];
}

export function buildVerifiedIndex(citations: VerifiedCitation[]): VerifiedIndex {
  const codes = new Set<string>();
  const articles = new Set<string>();
  const labels = new Set<string>();
  const sources: VerifiedSource[] = [];
  const list = Array.isArray(citations) ? citations : [];
  list.forEach((c, i) => {
    const code = typeof c?.short_code === "string" ? c.short_code.trim() : "";
    const article = c?.article_no === null || c?.article_no === undefined
      ? ""
      : String(c.article_no).trim();
    const paragraph = c?.paragraph_no === null || c?.paragraph_no === undefined
      ? ""
      : String(c.paragraph_no).trim();
    const label = typeof c?.citation_label === "string" ? c.citation_label.trim() : "";
    if (code) codes.add(normalizeCode(code));
    if (code && article) articles.add(`${normalizeCode(code)}#${normalizeArticle(article)}`);
    if (label) labels.add(normalizeCode(label.replace(/^\[|\]$/g, "")));
    sources.push({
      index: i + 1,
      code: code ? normalizeCode(code) : "",
      article: article ? normalizeArticle(article) : "",
      paragraph,
      label: label ? normalizeCode(label.replace(/^\[|\]$/g, "")) : "",
    });
  });
  return { codes, articles, labels, sources };
}

export type CitationCheck =
  | { ok: true; citations: string[] }
  | {
    ok: false;
    reason:
      | "forbidden_marker"
      | "unverified_citation"
      | "source_out_of_range"
      | "source_claim_mismatch"
      | "no_citation";
    token?: string;
  };

/** Началото на изречението, в което стои даден индекс. */
function sentenceStart(text: string, at: number): number {
  const before = text.slice(0, at);
  const marks = [before.lastIndexOf("."), before.lastIndexOf("\n"), before.lastIndexOf(";")];
  return Math.max(0, ...marks.map((m) => (m < 0 ? 0 : m + 1)));
}

/** Твърдение за член в даден отрязък: `чл. 79 ЗЗД` или `чл. 79, ал. 1 ЗЗД`. */
const ARTICLE_CLAIM_RE =
  /чл\.\s*(\d+[а-я]?)[^.\n]{0,40}?(?:^|[^А-Яа-яЁёA-Za-z])([А-ЯЁ]{2,10})(?![А-Яа-яЁё])/g;

/** Съдебна практика извън скоби: `ТР № 4/2013 ОСГТК ВКС`, `Реш. № 88/2019`. */
const BARE_CASE_LAW_RE = /(ТР|Реш\.|Решение|Определение)\s*№\s*\d+[^.\n]{0,60}/g;

/**
 * Всеки цитат в скоби трябва да е проверим:
 *  - `[S#]` — реално извлечена извадка в обхвата;
 *  - нормативен етикет — представен в проверения набор.
 * Всяко твърдение за член/практика се сверява с ПОСОЧЕНАТА извадка.
 */
export function validateAnswerCitations(
  text: string,
  citations: VerifiedCitation[],
  options?: { requireCitation?: boolean },
): CitationCheck {
  const index = buildVerifiedIndex(citations);
  const sourceCount = index.sources.length;
  const found: string[] = [];
  if (FORBIDDEN_RE.test(text)) {
    return { ok: false, reason: "forbidden_marker" };
  }

  CANDIDATE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CANDIDATE_RE.exec(text)) !== null) {
    const raw = m[1].trim();
    const after = text.slice(m.index + m[0].length);
    if (LINK_AHEAD.test(after)) continue; // маркдаун линк

    // ---- Референция към реално подадена извадка: [S1] .. [Sn] -------------
    const refMatch = raw.match(SOURCE_REF_RE);
    if (refMatch) {
      const n = Number(refMatch[1]);
      if (!Number.isInteger(n) || n < 1 || n > sourceCount) {
        return { ok: false, reason: "source_out_of_range", token: raw };
      }
      const source = index.sources[n - 1];
      found.push(raw);
      // Твърдението в СЪЩОТО изречение трябва да е покрито от ТАЗИ извадка.
      const segment = text.slice(sentenceStart(text, m.index), m.index);
      ARTICLE_CLAIM_RE.lastIndex = 0;
      let claim: RegExpExecArray | null;
      while ((claim = ARTICLE_CLAIM_RE.exec(segment)) !== null) {
        const code = normalizeCode(claim[2]);
        const article = normalizeArticle(claim[1]);
        // Позволяваме и друга проверена извадка да носи същото твърдение, но
        // НИКОГА непроверена комбинация.
        if (!index.articles.has(`${code}#${article}`)) {
          return {
            ok: false,
            reason: "source_claim_mismatch",
            token: `чл. ${claim[1]} ${claim[2]} [${raw}]`,
          };
        }
        if (source.code && source.article && source.code !== code) {
          // Посочената извадка е за друг акт — цитатът не подкрепя твърдението.
          if (!index.articles.has(`${code}#${article}`)) {
            return { ok: false, reason: "source_claim_mismatch", token: raw };
          }
        }
      }
      continue;
    }

    if (!LEGALISH_RE.test(raw)) continue;
    found.push(raw);

    const codeMatch = raw.match(/^([А-ЯЁA-Z]{2,10})\b/);
    const articleMatch = raw.match(/чл\.\s*(\d+[а-я]?)/i);
    const normalizedWhole = normalizeCode(raw);

    if (index.labels.has(normalizedWhole)) continue;
    if (codeMatch) {
      const code = normalizeCode(codeMatch[1]);
      if (!index.codes.has(code)) return { ok: false, reason: "unverified_citation", token: raw };
      if (articleMatch) {
        const key = `${code}#${normalizeArticle(articleMatch[1])}`;
        if (!index.articles.has(key)) {
          return { ok: false, reason: "unverified_citation", token: raw };
        }
      }
      continue;
    }
    // Практика/регламент без код: трябва точно съвпадение с проверен етикет.
    return { ok: false, reason: "unverified_citation", token: raw };
  }

  // Твърдение за член ИЗВЪН скоби („по чл. 143 ЗЗП") също трябва да е покрито
  // от проверените източници. Иначе е недоказан цитат.
  // Внимание: \b в JS е ASCII-базирано и не работи за кирилица.
  ARTICLE_CLAIM_RE.lastIndex = 0;
  let bare: RegExpExecArray | null;
  while ((bare = ARTICLE_CLAIM_RE.exec(text)) !== null) {
    const inBrackets = text.lastIndexOf("[", bare.index) > text.lastIndexOf("]", bare.index);
    if (inBrackets) continue;
    const code = normalizeCode(bare[2]);
    const token = `чл. ${bare[1]} ${bare[2]}`;
    if (!index.codes.has(code)) {
      return { ok: false, reason: "unverified_citation", token };
    }
    if (!index.articles.has(`${code}#${normalizeArticle(bare[1])}`)) {
      return { ok: false, reason: "unverified_citation", token };
    }
  }

  // Съдебна практика извън скоби: трябва точно съвпадение с проверен етикет.
  BARE_CASE_LAW_RE.lastIndex = 0;
  let law: RegExpExecArray | null;
  while ((law = BARE_CASE_LAW_RE.exec(text)) !== null) {
    const inBrackets = text.lastIndexOf("[", law.index) > text.lastIndexOf("]", law.index);
    if (inBrackets) continue;
    const claim = normalizeCode(law[0]);
    const covered = [...index.labels].some((l) => l.includes(claim) || claim.includes(l));
    if (!covered) {
      return { ok: false, reason: "unverified_citation", token: law[0].trim() };
    }
  }

  if (options?.requireCitation && found.length === 0) {
    return { ok: false, reason: "no_citation" };
  }
  return { ok: true, citations: found };
}

/** Безопасен отговор, когато няма проверено покритие. Черновата не се показва. */
export function noVerifiedAnswerText(): string {
  return [
    "Не мога да потвърдя отговор по този въпрос с проверен източник в момента, затова няма да дам правно твърдение без основание.",
    "",
    "Какво можете да направите сега:",
    "- Формулирайте въпроса по-конкретно (какъв документ, каква ситуация, какъв срок).",
    "- Ако имате документ, качете го за проверка и ще работим по точния текст.",
    "- При спор или срок препоръчваме консултация с адвокат.",
  ].join("\n");
}
