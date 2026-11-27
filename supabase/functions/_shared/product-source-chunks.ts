/**
 * Чисто разделяне на приетия източник на ограничени части (chunks).
 *
 * Правила:
 *  - никога не отрязваме: ВСЯКА кодова точка от източника е покрита;
 *  - границите са на абзац/клауза, когато е възможно;
 *  - идентификаторите и отместванията са детерминистични;
 *  - малко застъпване, за да не се къса контекст между съседни части.
 */
import { buildSourceMap, sliceByCodePoints, type SourceMap } from "./product-source-map.ts";

export const PRODUCT_CHUNK_MAX_CHARS = 4000;
export const PRODUCT_CHUNK_OVERLAP_CHARS = 200;

export interface SourceChunk {
  readonly id: string;
  readonly index: number;
  /** Ядро на частта — тези интервали покриват източника без празнини. */
  readonly start: number;
  readonly end: number;
  /** С добавено застъпване назад — за контекст, не за покритие. */
  readonly context_start: number;
  readonly text: string;
  readonly first_paragraph: number | null;
  readonly section: string | null;
  readonly page: number | null;
}

export interface ChunkOptions {
  readonly maxChars?: number;
  readonly overlapChars?: number;
}

/** Разделя източника. Приема готова карта или текст. */
export function chunkProductSource(
  input: string | SourceMap,
  options: ChunkOptions = {},
): readonly SourceChunk[] {
  const map = typeof input === "string" ? buildSourceMap(input) : input;
  const maxChars = Math.max(200, options.maxChars ?? PRODUCT_CHUNK_MAX_CHARS);
  const overlap = Math.max(0, Math.min(options.overlapChars ?? PRODUCT_CHUNK_OVERLAP_CHARS, maxChars - 1));
  if (map.charCount === 0) return [];

  // Кандидат-граници: краищата на абзаците, плюс краят на текста.
  const boundaries: number[] = [];
  for (const p of map.paragraphs) boundaries.push(p.end);
  boundaries.push(map.charCount);
  const sortedBoundaries = Array.from(new Set(boundaries.filter((b) => b > 0))).sort((a, b) => a - b);

  const chunks: SourceChunk[] = [];
  let start = 0;
  let index = 0;
  while (start < map.charCount) {
    const hardEnd = Math.min(start + maxChars, map.charCount);
    let end = hardEnd;
    if (hardEnd < map.charCount) {
      // Най-далечната граница на абзац, която пасва в частта.
      const fit = sortedBoundaries.filter((b) => b > start && b <= hardEnd);
      if (fit.length > 0) {
        end = fit[fit.length - 1];
      } else {
        // Дълъг абзац: режем на последен интервал, за да не късаме дума.
        let cut = hardEnd;
        while (cut > start + 1 && map.codePoints[cut - 1] !== " ") cut -= 1;
        end = cut > start + 1 ? cut : hardEnd;
      }
    }
    const contextStart = Math.max(0, start - (index === 0 ? 0 : overlap));
    const paragraph = map.paragraphs.find((p) => p.start < end && p.end > start) ?? null;
    chunks.push({
      id: `chunk_${index}_${start}_${end}`,
      index,
      start,
      end,
      context_start: contextStart,
      text: sliceByCodePoints(map.text, contextStart, end),
      first_paragraph: paragraph?.index ?? null,
      section: paragraph?.section ?? null,
      page: paragraph?.page ?? null,
    });
    start = end;
    index += 1;
  }
  return chunks;
}

export interface CoverageReport {
  readonly complete: boolean;
  readonly covered: number;
  readonly expected: number;
  readonly gaps: readonly { start: number; end: number }[];
}

/** Доказва, че ядрата на частите покриват целия източник без празнини. */
export function verifyChunkCoverage(
  chunks: readonly SourceChunk[],
  charCount: number,
): CoverageReport {
  const sorted = [...chunks].sort((a, b) => a.start - b.start);
  const gaps: { start: number; end: number }[] = [];
  let cursor = 0;
  let covered = 0;
  for (const chunk of sorted) {
    if (chunk.start > cursor) gaps.push({ start: cursor, end: chunk.start });
    covered += Math.max(0, chunk.end - Math.max(chunk.start, cursor));
    cursor = Math.max(cursor, chunk.end);
  }
  if (cursor < charCount) gaps.push({ start: cursor, end: charCount });
  return {
    complete: gaps.length === 0 && cursor === charCount && covered === charCount,
    covered,
    expected: charCount,
    gaps,
  };
}
