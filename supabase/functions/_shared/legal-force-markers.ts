/**
 * Консервативна проверка НА НИВО ОТКЪС дали текстът може да обоснове извод за
 * ДЕЙСТВАЩО право.
 *
 * Документният интервал (`effective_from`/`effective_to`) не е достатъчен:
 * един действащ консолидиран закон съдържа и отменени, и бъдещи, и обявени за
 * противоконституционни разпоредби. Тук се чете САМО самият текст на откъса и
 * се решава дали той е авторитетен ДНЕС.
 *
 * Правила:
 *   * нищо не се „поправя“ и не се изтрива — откъсът остава в корпуса за
 *     исторически контекст, само губи авторитет;
 *   * никакви измислени дати: щом маркерът е двусмислен, резултатът е
 *     `ambiguous` и откъсът НЕ е авторитетен;
 *   * модулът е чист и напълно детерминистичен (без мрежа, база и модел).
 */

/**
 * Колко знака реално стигат до модела за вграждане (вж. `embedText`). Част,
 * по-дълга от този праг, е вградена само частично и не може да обоснове точно
 * цитиране.
 */
export const EMBED_TEXT_CHAR_LIMIT = 8000;

export const FORCE_CLASSES = Object.freeze([
  "in_force",
  "repealed",
  "future",
  "expired",
  "unconstitutional",
  "ambiguous",
] as const);
export type ForceClass = (typeof FORCE_CLASSES)[number];

export interface ForceAssessment {
  /** Може ли откъсът да обоснове извод за действащо право. */
  readonly authoritative: boolean;
  readonly forceClass: ForceClass;
  /** Кои точно маркери са довели до решението — за одит и за обяснение. */
  readonly markers: readonly string[];
}

// \b в JavaScript работи само с латиница, затова границите са явни: израз
// започва в начало на текст или след небуквен знак.
const REPEALED_RE =
  /\(\s*отм\.|(?<![\p{L}\p{N}])отменен(?:а|и|о)?\s+с(?![\p{L}\p{N}])/iu;
/**
 * САМО действителна анотация за обявена противоконституционност, напр.
 * „(Обявена за противоконституционна с РКС № 8 от 2019 г. …)“.
 * Обикновено споменаване на думата — както в чл. 149 от Конституцията, който
 * изброява правомощията на Конституционния съд — НЕ отнема авторитет.
 */
const UNCONSTITUTIONAL_RE =
  /(?:обявен[аио]?\s+(?:за\s+)?противоконституцион\w*)|(?:противоконституцион\w*\s*(?:—|-|,)?\s*(?:с\s+)?(?:РКС|Решение\s*№))/iu;
/** „в сила от 1.03.2008 г.“ / „в сила от 01.03.2008“ */
const IN_FORCE_FROM_RE = /в\s+сила\s+от\s+(\d{1,2})\.(\d{1,2})\.(\d{4})/gi;
/** „…до 9.08.2027 г.“ — краен срок на временна разпоредба. */
const IN_FORCE_TO_RE = /до\s+(\d{1,2})\.(\d{1,2})\.(\d{4})\s*г/gi;
/** Маркер за действие без разбираема дата. */
const VAGUE_FORCE_RE = /в\s+сила\s+от\s+(?!\d{1,2}\.\d{1,2}\.\d{4})/i;

function utc(day: number, month: number, year: number): number | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ts = Date.UTC(year, month - 1, day);
  return Number.isFinite(ts) ? ts : null;
}

function collect(re: RegExp, text: string): number[] {
  const out: number[] = [];
  re.lastIndex = 0;
  for (const m of text.matchAll(re)) {
    const ts = utc(Number(m[1]), Number(m[2]), Number(m[3]));
    if (ts !== null) out.push(ts);
  }
  return out;
}

/** Начало на алинея: „(1) “, „(2) “ … в началото на ред или след точка/нов ред. */
const PARAGRAPH_START_RE = /(?:^|\n|(?<=[.;:)]\s))\(\s*(\d{1,3})\s*\)\s/gu;
/**
 * Граници на друг вид разпоредба вътре в откъс, цитиран като член:
 * параграфи („§ 12.“) и заглавия на допълнителни/преходни разпоредби.
 */
const SECTION_BOUNDARY_RE =
  /(?:§\s*\d+\s*[.)])|Допълнителни\s+разпоредби|Преходни\s+и\s+[Зз]аключителни\s+разпоредби/u;

/** Разделя текста на алинеи; при липса на маркери връща един сегмент. */
function splitParagraphs(text: string): string[] {
  const idx: number[] = [];
  PARAGRAPH_START_RE.lastIndex = 0;
  for (const m of text.matchAll(PARAGRAPH_START_RE)) {
    if (typeof m.index === "number") idx.push(m.index);
  }
  if (idx.length < 2) return [text];
  const out: string[] = [];
  if (idx[0] > 0) out.push(text.slice(0, idx[0]));
  for (let i = 0; i < idx.length; i++) {
    out.push(text.slice(idx[i], i + 1 < idx.length ? idx[i + 1] : undefined));
  }
  return out.filter((s) => s.trim().length > 0);
}

/**
 * Оценява откъс спрямо момент `now` (ms). Празен текст е неавторитетен.
 *
 * Оценката е двустепенна: първо целият текст, после всяка алинея поотделно.
 * Ако алинеите се различават (действаща + бъдеща/отменена/противоконституционна),
 * откъсът е СМЕСЕН и затова не е авторитетен — консервативно, без да се гадае
 * коя част е цитирана.
 */
export function assessChunkForce(content: unknown, now: number): ForceAssessment {
  const text = typeof content === "string" ? content : "";
  if (!text.trim()) {
    return { authoritative: false, forceClass: "ambiguous", markers: Object.freeze(["празен текст"]) };
  }

  // Смесени граници: текст на член, в който е попаднал параграф или цял дял
  // разпоредби. Самостоятелен параграф („§ 5. …“) си остава редовен откъс.
  const startsAsArticle = /^\s*(?:Чл\.|\(\s*\d{1,3}\s*\)|\(\s*(?:Нов|Изм|Доп|Отм))/u.test(text);
  if (startsAsArticle && SECTION_BOUNDARY_RE.test(text)) {
    return {
      authoritative: false,
      forceClass: "ambiguous",
      markers: Object.freeze(["смесени граници член/§"]),
    };
  }

  const parts = splitParagraphs(text);
  if (parts.length > 1) {
    const classes = parts.map((p) => assessSingle(p, now));
    const bad = classes.find((c) => !c.authoritative);
    const good = classes.find((c) => c.authoritative);
    if (bad && good) {
      return {
        authoritative: false,
        forceClass: "ambiguous",
        markers: Object.freeze(["смесени алинеи", ...bad.markers]),
      };
    }
    if (bad && !good) return bad;
  }

  return assessSingle(text, now);
}

function assessSingle(content: string, now: number): ForceAssessment {
  const text = content;


  if (UNCONSTITUTIONAL_RE.test(text)) {
    return {
      authoritative: false,
      forceClass: "unconstitutional",
      markers: Object.freeze(["противоконституционност"]),
    };
  }
  if (REPEALED_RE.test(text)) {
    return { authoritative: false, forceClass: "repealed", markers: Object.freeze(["отмяна"]) };
  }

  const starts = collect(IN_FORCE_FROM_RE, text);
  const ends = collect(IN_FORCE_TO_RE, text);

  // Изтекла временна разпоредба: всички крайни срокове са в миналото.
  if (ends.length > 0 && ends.every((ts) => ts < now)) {
    return { authoritative: false, forceClass: "expired", markers: Object.freeze(["изтекъл срок"]) };
  }

  // Бъдещо действие: има дата на влизане в сила и ВСИЧКИ такива дати са напред.
  if (starts.length > 0 && starts.every((ts) => ts > now)) {
    return { authoritative: false, forceClass: "future", markers: Object.freeze(["бъдещо действие"]) };
  }

  // Действаща редакция с вече обнародвано бъдещо изменение в същия текст:
  // не се гадае коя редакция е цитирана.
  if (starts.some((ts) => ts > now) && starts.some((ts) => ts <= now)) {
    return {
      authoritative: false,
      forceClass: "ambiguous",
      markers: Object.freeze(["предстоящо изменение в същия текст"]),
    };
  }


  // Маркер за действие без разбираема дата и без нито една ясна дата →
  // двусмислено. Нищо не се предполага.
  if (starts.length === 0 && VAGUE_FORCE_RE.test(text)) {
    return {
      authoritative: false,
      forceClass: "ambiguous",
      markers: Object.freeze(["неясна дата на влизане в сила"]),
    };
  }

  return { authoritative: true, forceClass: "in_force", markers: Object.freeze([]) };
}
