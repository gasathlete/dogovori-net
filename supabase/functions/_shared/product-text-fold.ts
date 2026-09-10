/**
 * Съпоставяне на текст, безопасно за Unicode — ЕДНА реализация за всички
 * продуктови проверки (доказателства и проверки за отсъствие).
 *
 * Защо съществува: `String.indexOf` връща отмествания в UTF-16 units, а всички
 * продуктови отмествания са в Unicode КОДОВИ ТОЧКИ. При емоджи или друг знак
 * извън BMP двете стойности се разминават и валидна извадка би посочила грешно
 * място в източника. Затова тук всичко работи върху масиви от кодови точки.
 *
 * Единствените разрешени безопасни разлики при съпоставянето:
 *  1. водещи и завършващи празни знаци;
 *  2. поредица от празни знаци (включително нов ред) се смята за един интервал;
 *  3. по избор — сваляне на регистъра (само за проверките за отсъствие).
 * Нищо друго: без изтриване на пунктуация и без „приблизително“ съвпадение.
 */

const WS_RE = /\s/u;

export interface FoldedText {
  /** Свитият текст като масив от кодови точки. */
  readonly folded: readonly string[];
  /** За всяка позиция в `folded` — индексът на кодовата точка в източника. */
  readonly toOriginal: readonly number[];
}

export interface FoldOptions {
  /** Свалянето на регистъра може да разшири един знак до няколко. */
  readonly lowercase?: boolean;
}

/**
 * Свива празните знаци (и по избор регистъра) и пази точна карта към
 * отместванията в кодови точки на източника.
 */
export function foldText(cps: readonly string[], opts: FoldOptions = {}): FoldedText {
  const folded: string[] = [];
  const toOriginal: number[] = [];
  let pendingSpace = false;

  for (let i = 0; i < cps.length; i += 1) {
    const ch = cps[i];
    if (WS_RE.test(ch)) {
      if (folded.length > 0) pendingSpace = true;
      continue;
    }
    if (pendingSpace) {
      folded.push(" ");
      toOriginal.push(i);
      pendingSpace = false;
    }
    const mapped = opts.lowercase ? ch.toLocaleLowerCase("bg-BG") : ch;
    // Едно свалено на малки букви знаково място може да даде няколко кодови
    // точки — всяка сочи към ЕДНАТА кодова точка в източника.
    for (const out of mapped) {
      folded.push(out);
      toOriginal.push(i);
    }
  }

  return { folded, toOriginal };
}

/** Свит текст като низ — само за дължини и съобщения, не за отмествания. */
export function foldToString(value: string, opts: FoldOptions = {}): string {
  return foldText(Array.from(value), opts).folded.join("");
}

/**
 * Търси подредица от кодови точки. Връща индекс В КОДОВИ ТОЧКИ или -1.
 * Съзнателно не ползва `indexOf` върху низ — той брои UTF-16 units.
 */
export function indexOfCodePoints(
  haystack: readonly string[],
  needle: readonly string[],
  from = 0,
): number {
  if (needle.length === 0 || needle.length > haystack.length) return -1;
  const last = haystack.length - needle.length;
  for (let i = Math.max(0, from); i <= last; i += 1) {
    let hit = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        hit = false;
        break;
      }
    }
    if (hit) return i;
  }
  return -1;
}

/** Всички начални позиции (в кодови точки) до зададен таван. */
export function findAllCodePoints(
  haystack: readonly string[],
  needle: readonly string[],
  limit = 64,
): number[] {
  const out: number[] = [];
  let from = 0;
  while (out.length <= limit) {
    const at = indexOfCodePoints(haystack, needle, from);
    if (at === -1) break;
    out.push(at);
    from = at + 1;
  }
  return out;
}
