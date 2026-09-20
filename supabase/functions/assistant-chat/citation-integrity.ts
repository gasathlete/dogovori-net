/**
 * P0-E2 — цялост на цитатите.
 *
 * Правно твърдение има смисъл САМО ако цитатът зад него съществува в
 * ПРОВЕРЕНИТЕ извлечени източници. Няма „общ режим“, няма измислени членове,
 * няма маркери [S1]. Ако проверката падне след едно ограничено поправяне,
 * черновата НЕ се доставя.
 */

export interface VerifiedCitation {
  short_code?: unknown;
  article_no?: unknown;
  paragraph_no?: unknown;
  citation_label?: unknown;
}

/** Кандидат-цитат в текста: `[ЗЗД, чл. 79]`, `[ТР № 4/2013 ОСГТК ВКС]`, … */
const CANDIDATE_RE = /\[([^\]\n]{1,140})\]/g;
/** Маркдаун линк `[текст](url)` не е цитат. */
const LINK_AHEAD = /^\(/;

const LEGALISH_RE =
  /(^[А-ЯЁA-Z]{2,10}\b|^Регламент|^GDPR|^Директив|^ТР\s*№|^Решение\s*№|^Конституц|чл\.\s*\d)/;

const FORBIDDEN_RE = /(приложим\s+общ\s+режим|\bS\d+\b|източник\s*\d+)/i;

function normalizeCode(raw: string): string {
  return raw.replace(/[.\s]/g, "").toUpperCase();
}

export interface VerifiedIndex {
  codes: Set<string>;
  articles: Set<string>;
  labels: Set<string>;
}

export function buildVerifiedIndex(citations: VerifiedCitation[]): VerifiedIndex {
  const codes = new Set<string>();
  const articles = new Set<string>();
  const labels = new Set<string>();
  for (const c of citations || []) {
    const code = typeof c?.short_code === "string" ? c.short_code.trim() : "";
    const article = c?.article_no === null || c?.article_no === undefined
      ? ""
      : String(c.article_no).trim();
    const label = typeof c?.citation_label === "string" ? c.citation_label.trim() : "";
    if (code) codes.add(normalizeCode(code));
    if (code && article) articles.add(`${normalizeCode(code)}#${article.replace(/\s/g, "")}`);
    if (label) labels.add(normalizeCode(label.replace(/^\[|\]$/g, "")));
  }
  return { codes, articles, labels };
}

export type CitationCheck =
  | { ok: true; citations: string[] }
  | { ok: false; reason: "forbidden_marker" | "unverified_citation" | "no_citation"; token?: string };

/**
 * Всеки цитат в скоби, който изглежда правен, трябва да е представен в
 * проверения набор. Изисква поне един цитат, когато текстът съдържа правно
 * твърдение (подава се от извикващия през `requireCitation`).
 */
export function validateAnswerCitations(
  text: string,
  citations: VerifiedCitation[],
  options?: { requireCitation?: boolean },
): CitationCheck {
  const index = buildVerifiedIndex(citations);
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
        const key = `${code}#${articleMatch[1].replace(/\s/g, "")}`;
        if (!index.articles.has(key)) {
          return { ok: false, reason: "unverified_citation", token: raw };
        }
      }
      continue;
    }
    // Практика/регламент без код: трябва точно съвпадение с проверен етикет.
    return { ok: false, reason: "unverified_citation", token: raw };
  }

  // Твърдение за член ИЗВЪН скоби („по чл. 143 ЗЗП“) също трябва да е покрито
  // от проверените източници. Иначе е недоказан цитат.
  // Внимание: \b в JS е ASCII-базирано и не работи за кирилица.
  const BARE_ARTICLE_RE =
    /чл\.\s*(\d+[а-я]?)[^.\n]{0,40}?(?:^|[^А-Яа-яЁёA-Za-z])([А-ЯЁ]{2,10})(?![А-Яа-яЁё])/g;
  BARE_ARTICLE_RE.lastIndex = 0;
  let bare: RegExpExecArray | null;
  while ((bare = BARE_ARTICLE_RE.exec(text)) !== null) {
    const inBrackets = text.lastIndexOf("[", bare.index) > text.lastIndexOf("]", bare.index);
    if (inBrackets) continue;
    const code = normalizeCode(bare[2]);
    if (!index.codes.has(code)) {
      return { ok: false, reason: "unverified_citation", token: `чл. ${bare[1]} ${bare[2]}` };
    }
    const key = `${code}#${bare[1].replace(/\s/g, "")}`;
    if (!index.articles.has(key)) {
      return { ok: false, reason: "unverified_citation", token: `чл. ${bare[1]} ${bare[2]}` };
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
