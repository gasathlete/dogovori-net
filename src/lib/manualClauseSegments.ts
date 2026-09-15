/**
 * Разделяне на платения текст на клаузи за РЪЧЕН преглед.
 *
 * Правилото е строго: тук не се добавя, преформулира или тълкува нищо. Всяка
 * част е дословна извадка от текста на потребителя, с точни начало и край в
 * Unicode кодови точки, за да може винаги да се провери спрямо източника.
 */

export interface ClauseSegment {
  /** Устойчив идентификатор: позицията в текста. */
  readonly id: string;
  /** Първият ред на частта — само за ориентиране в списъка. */
  readonly label: string;
  /** Дословният текст на частта. */
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/** Минимална дължина, под която частта не е самостоятелна клауза. */
const MIN_SEGMENT_CHARS = 20;
const MAX_LABEL_CHARS = 90;

/** Ред, който започва нова клауза: „Чл. 5", „Член 5", „Раздел II", „1.", „1)". */
const HEADING_RE =
  /^\s*(?:(?:чл|член|раздел|глава|приложение)\.?(?![\p{L}])|(?:[IVXLC]+|\d+(?:\.\d+)*)\s*[.)]\s+)/iu;

function labelOf(text: string): string {
  const firstLine = text.split("\n").find((line) => line.trim().length > 0) ?? text;
  const trimmed = firstLine.trim();
  return trimmed.length > MAX_LABEL_CHARS ? `${trimmed.slice(0, MAX_LABEL_CHARS)}…` : trimmed;
}

/**
 * Части на документа в реда, в който се срещат. Прекъсва на празен ред или на
 * начало на нова клауза. Връща само дословни извадки.
 */
export function splitClauseSegments(source: string): readonly ClauseSegment[] {
  const chars = Array.from(source);
  const lines: { text: string; start: number; end: number }[] = [];
  let lineStart = 0;
  for (let i = 0; i <= chars.length; i += 1) {
    if (i === chars.length || chars[i] === "\n") {
      lines.push({ text: chars.slice(lineStart, i).join(""), start: lineStart, end: i });
      lineStart = i + 1;
    }
  }

  const segments: ClauseSegment[] = [];
  let current: { start: number; end: number } | null = null;

  const flush = () => {
    if (!current) return;
    const text = chars.slice(current.start, current.end).join("");
    if (text.trim().length >= MIN_SEGMENT_CHARS) {
      segments.push({
        id: `${current.start}-${current.end}`,
        label: labelOf(text),
        text,
        start: current.start,
        end: current.end,
      });
    }
    current = null;
  };

  for (const line of lines) {
    if (line.text.trim().length === 0) {
      flush();
      continue;
    }
    if (current && HEADING_RE.test(line.text)) flush();
    if (!current) current = { start: line.start, end: line.end };
    else current = { start: current.start, end: line.end };
  }
  flush();

  return segments;
}

/** Точният текст на избраните части, в реда на документа. */
export function selectedClauseText(
  segments: readonly ClauseSegment[],
  selected: ReadonlySet<string>,
): string {
  return segments
    .filter((segment) => selected.has(segment.id))
    .map((segment) => segment.text.trim())
    .join("\n\n");
}
