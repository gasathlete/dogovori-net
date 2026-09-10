/**
 * Чиста карта на приетия източник: абзаци, раздели и (когато са известни)
 * страници — всичко в КАНОНИЧНАТА единица Unicode кодови точки.
 *
 * Без Deno/DB/мрежа и без предположения: ако границите на страниците не са
 * измерени, страницата липсва (null), а не се изчислява „приблизително“.
 */
import { countProductSourceChars } from "./product-source.ts";

/** Измерена граница на страница в кодови точки: [start, end). */
export interface PageBoundary {
  readonly page: number;
  readonly start: number;
  readonly end: number;
}

export interface ParagraphEntry {
  readonly index: number;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  /** Заглавие на раздела/члена, ако е разпознато по стабилен признак. */
  readonly section: string | null;
  readonly page: number | null;
}

export interface SourceMap {
  readonly text: string;
  /** Кодовите точки на текста — основата за всички отмествания. */
  readonly codePoints: readonly string[];
  readonly charCount: number;
  readonly paragraphs: readonly ParagraphEntry[];
  readonly pages: readonly PageBoundary[] | null;
}

/** Извадка по отмествания в кодови точки. */
export function sliceByCodePoints(text: string, start: number, end: number): string {
  return Array.from(text).slice(start, end).join("");
}

/** Стабилни признаци за начало на раздел/член — без езикова еквилибристика. */
const SECTION_RE =
  /^(?:(?:чл\.|член|раздел|глава|приложение)\s*[^\n]{0,80}|[IVXLC]{1,6}\.\s*[^\n]{0,80}|\d{1,3}(?:\.\d{1,3})*\.?\s*[^\n]{0,80})$/i;

function pageForOffset(pages: readonly PageBoundary[] | null, offset: number): number | null {
  if (!pages) return null;
  for (const p of pages) {
    if (offset >= p.start && offset < p.end) return p.page;
  }
  return null;
}

/**
 * Изгражда картата. `pages` се подава само когато е ИЗМЕРЕНО (например от
 * извличането по страници); иначе остава null и никой абзац не твърди страница.
 */
export function buildSourceMap(
  text: string,
  pages?: readonly PageBoundary[] | null,
): SourceMap {
  const cps = Array.from(text);
  const charCount = cps.length;
  const knownPages = pages && pages.length > 0 ? [...pages].sort((a, b) => a.start - b.start) : null;

  const paragraphs: ParagraphEntry[] = [];
  let currentSection: string | null = null;
  let index = 0;
  let cursor = 0;

  while (cursor < charCount) {
    // Прескачаме водещите нови редове, но НЕ губим отместването.
    if (cps[cursor] === "\n") {
      cursor += 1;
      continue;
    }
    let end = cursor;
    while (end < charCount) {
      if (cps[end] === "\n" && (end + 1 >= charCount || cps[end + 1] === "\n")) break;
      end += 1;
    }
    const raw = cps.slice(cursor, end).join("");
    const trimmed = raw.trim();
    if (trimmed) {
      const firstLine = trimmed.split("\n")[0].trim();
      if (SECTION_RE.test(firstLine) && countProductSourceChars(firstLine) <= 120) {
        currentSection = firstLine;
      }
      paragraphs.push({
        index,
        start: cursor,
        end,
        text: raw,
        section: currentSection,
        page: pageForOffset(knownPages, cursor),
      });
      index += 1;
    }
    cursor = end + 1;
  }

  return { text, codePoints: cps, charCount, paragraphs, pages: knownPages };
}

export interface OffsetLocation {
  readonly paragraph: number | null;
  readonly section: string | null;
  readonly page: number | null;
}

/** Къде се намира дадено отместване: абзац, раздел и страница (ако е известна). */
export function locateOffset(map: SourceMap, offset: number): OffsetLocation {
  if (offset < 0 || offset >= map.charCount) {
    return { paragraph: null, section: null, page: null };
  }
  for (const p of map.paragraphs) {
    if (offset >= p.start && offset < p.end) {
      return { paragraph: p.index, section: p.section, page: p.page };
    }
  }
  return { paragraph: null, section: null, page: pageForOffset(map.pages, offset) };
}
