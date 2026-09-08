/**
 * Консервативно разпознаване на "отложени за попълване" ЛОКАЛНИ полета.
 *
 * Контекст: при `ignorePersonalData` потребителят ще попълни идентификационните
 * и контактните си данни сам, след сваляне. Затова констатация, която описва
 * САМО такова празно поле, не бива да блокира документа.
 *
 * Модел на разпознаване — ПОЗИТИВЕН и затворен (не blacklist):
 *  1. Констатацията трябва да съдържа поне един цял, самостоятелен placeholder
 *     токен с етикет от затворен списък за идентичност/контакт.
 *  2. Токенът трябва да присъства БУКВАЛНО и самостоятелно в ОРИГИНАЛНИЯ текст.
 *  3. След премахване на токените ЦЯЛАТА останала част от текста трябва да е
 *     съставена единствено от думи от затворен списък за "празно/непопълнено
 *     поле". Всяко друго твърдение — същностно ИЛИ непознато — дава false.
 *  4. Допълнителна евтина защита: явни думи за същностен риск дават false.
 *
 * Следствие: отлагането е рядко. Това е нарочно — по-безопасно е да задържим
 * констатация, отколкото да скрием реален проблем. Произходът на документа
 * („ние го генерирахме“) никога не е основание да скрием констатация.
 *
 * Функциите са чисти, работят само в паметта и НИЩО не логват.
 */

/** Затворен списък от етикети на локални лични/идентификационни/контактни полета. */
const DEFERRABLE_LABELS = new Set([
  "име",
  "имена",
  "трите имена",
  "две имена",
  "име и фамилия",
  "егн",
  "лнч",
  "еик",
  "булстат",
  "еик/булстат",
  "адрес",
  "постоянен адрес",
  "адрес на управление",
  "седалище",
  "седалище и адрес на управление",
  "iban",
  "банкова сметка",
  "телефон",
  "имейл",
  "email",
  "e-mail",
  "лична карта",
  "номер на лична карта",
  "представител",
  "мол",
  "град",
]);

/**
 * Затворен списък от думи, допустими в остатъка на констатацията след
 * премахване на токените. Само лексика за "празно/непопълнено поле".
 */
const BLANK_FIELD_WORDS = new Set([
  "и",
  "е",
  "са",
  "се",
  "не",
  "за",
  "от",
  "след",
  "преди",
  "поле",
  "полето",
  "полета",
  "полетата",
  "празно",
  "празни",
  "празното",
  "непопълнено",
  "непопълнени",
  "непопълненото",
  "попълнено",
  "попълнени",
  "попълва",
  "попълване",
  "попълни",
  "липсва",
  "липсват",
  "стойност",
  "стойността",
  "локално",
  "ръчно",
  "потребителя",
  "използване",
  "сваляне",
  "оставено",
]);

/** Явни сигнали за същностен проблем (втора, независима защита). */
const SUBSTANTIVE_VETO = [
  "противореч",
  "несъответств",
  "разлик",
  "различ",
  "съвпад",
  "разминав",
  "погреш",
  "грешн",
  "невалид",
  "недействител",
  "нищож",
  "форма",
  "нотариал",
  "заверк",
  "вписв",
  "регистър",
  "подпис",
  "срок",
  "дата",
  "сума",
  "цена",
  "валута",
  "лев",
  "евро",
  "плащан",
  "възнагражден",
  "неустойк",
  "риск",
  "закон",
  "чл.",
  "клауза",
];

/** Идентификатори на проверки, които никога не се смекчават. */
const PROTECTED_CHECK_ID_STEMS = [
  "forma",
  "deystvitel",
  "valid",
  "srok",
  "date",
  "dat",
  "sum",
  "valut",
  "podpis",
  "sign",
  "notar",
  "vpisv",
  "protivorech",
  "contradict",
  "konflikt",
  "conflict",
  "cena",
  "price",
  "plashtan",
  "payment",
  "risk",
  "zakon",
  "legal",
];

/** Токени от редакцията (<EGN_1>, NAME_2) никога не са реални липсващи полета. */
const REDACTION_TOKEN_RE = /^<?[A-Za-z_]{2,}_\d+>?$/;

/**
 * Цял, самостоятелен токен: `[Етикет]` или `{{Етикет}}`.
 * Двете форми се смятат за еквивалентни (нормализира се само етикетът).
 * Отляво/отдясно не се допускат букви, цифри или скоби — така `[[ЕГН]]`,
 * `x[ЕГН]y` и `{ {ЕГН} }` НЕ дават токен.
 */
const STANDALONE_TOKEN_RE =
  /(?<![\p{L}\p{N}\[\]{}])(?:\[([^\[\]{}\n]{1,60})\]|\{\{([^{}\[\]\n]{1,60})\}\})(?![\p{L}\p{N}\[\]{}])/gu;

/**
 * Нормализация на етикет: САМО обрязване и свиване на празни знаци + малки
 * букви. Пунктуацията НЕ се маха — `[ЕГН:]` не е равно на `[ЕГН]`.
 */
function normalizeLabel(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Извлича нормализираните етикети на целите самостоятелни токени в текста. */
export function extractPlaceholderTokens(text: string): string[] {
  if (typeof text !== "string" || !text) return [];
  const out: string[] = [];
  STANDALONE_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = STANDALONE_TOKEN_RE.exec(text)) !== null) {
    const norm = normalizeLabel(m[1] ?? m[2] ?? "");
    if (norm) out.push(norm);
  }
  return out;
}

function hasSubstantiveSignal(text: string): boolean {
  const t = text.toLowerCase();
  return SUBSTANTIVE_VETO.some((w) => t.includes(w));
}

/** Остатъкът след премахване на токените съдържа ли САМО лексика за празно поле? */
function residueIsOnlyBlankFieldTalk(text: string): boolean {
  const residue = text.replace(STANDALONE_TOKEN_RE, " ");
  const words = residue
    .replace(/[.,;:!?()"'„“”«»\-–—/\\]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
  if (words.length === 0) return true;
  return words.every((w) => BLANK_FIELD_WORDS.has(w));
}

/**
 * true САМО когато ЦЯЛАТА констатация описва непопълнено локално
 * лично/идентификационно поле, доказано присъстващо в оригиналния текст.
 * Непознато или същностно твърдение → false (задържаме констатацията).
 */
export function isDeferredLocalPlaceholder(
  itemText: unknown,
  originalDocumentText: unknown,
): boolean {
  if (typeof itemText !== "string" || typeof originalDocumentText !== "string") return false;
  if (!itemText.trim() || !originalDocumentText.trim()) return false;
  if (hasSubstantiveSignal(itemText)) return false;
  if (!residueIsOnlyBlankFieldTalk(itemText)) return false;

  const tokens = extractPlaceholderTokens(itemText);
  if (tokens.length === 0) return false;

  const documentTokens = new Set(extractPlaceholderTokens(originalDocumentText));
  if (documentTokens.size === 0) return false;

  for (const token of tokens) {
    if (REDACTION_TOKEN_RE.test(token)) return false;
    if (!DEFERRABLE_LABELS.has(token)) return false;
    if (!documentTokens.has(token)) return false;
  }
  return true;
}

/** Видима неутрална бележка за проверки върху отложени полета. */
export const DEFERRED_NOTE = "За попълване преди използване";

export type ReviewCheck = Record<string, unknown>;

function isProtectedCheckId(id: unknown): boolean {
  if (typeof id !== "string" || !id.trim()) return true; // непознат id → защитен
  const normalized = id.toLowerCase();
  return PROTECTED_CHECK_ID_STEMS.some((stem) => normalized.includes(stem));
}

/**
 * Проверките НИКОГА не се изтриват и никога не хвърлят. „fail“ се сваля до
 * видим „warn“ САМО когато id-то не е защитено и цялата двойка label+note
 * описва единствено доказано празно локално поле.
 */
export function softenDeferredCheck(
  check: unknown,
  originalDocumentText: unknown,
): unknown {
  if (check === null || typeof check !== "object" || Array.isArray(check)) return check;
  const rec = check as ReviewCheck;
  if (String(rec.status) !== "fail") return check;
  if (isProtectedCheckId(rec.id)) return check;

  const label = typeof rec.label === "string" ? rec.label : "";
  const note = typeof rec.note === "string" ? rec.note : "";
  if (rec.label !== undefined && typeof rec.label !== "string") return check;
  if (rec.note !== undefined && typeof rec.note !== "string") return check;

  const combined = `${label} ${note}`;
  if (!isDeferredLocalPlaceholder(combined, originalDocumentText)) return check;

  const trimmedNote = note.trim();
  return {
    ...rec,
    status: "warn",
    note: trimmedNote.includes(DEFERRED_NOTE)
      ? trimmedNote
      : (trimmedNote ? `${trimmedNote} — ${DEFERRED_NOTE}.` : `${DEFERRED_NOTE}.`),
  };
}

/**
 * Единствената точка, през която обхватът се прилага — прави флага тестваем
 * без стартиране на функция или мрежа.
 */
export function shouldDeferItem(
  ignorePersonalData: boolean,
  itemText: unknown,
  originalDocumentText: unknown,
): boolean {
  if (ignorePersonalData !== true) return false;
  return isDeferredLocalPlaceholder(itemText, originalDocumentText);
}

export function applyDeferredScopeToCheck(
  ignorePersonalData: boolean,
  check: unknown,
  originalDocumentText: unknown,
): unknown {
  if (ignorePersonalData !== true) return check;
  return softenDeferredCheck(check, originalDocumentText);
}
