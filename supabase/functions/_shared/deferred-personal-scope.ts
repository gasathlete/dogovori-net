/**
 * Консервативно разпознаване на "отложени за попълване" ЛОКАЛНИ полета.
 *
 * Контекст: при `ignorePersonalData` потребителят ще попълни идентификационните
 * и контактните си данни сам, след сваляне. Затова констатация за ТАКОВА
 * конкретно непопълнено поле не бива да блокира документа.
 *
 * Принципи (умишлено тесни, за да няма false negatives):
 *  1. Разпознаваме САМО когато констатацията сочи конкретен placeholder токен
 *     ([ЕГН], {{Адрес}} и т.н.) с етикет от затворен списък за идентичност/контакт.
 *  2. Токенът трябва да съществува БУКВАЛНО и самостоятелно в ОРИГИНАЛНИЯ текст
 *     (доказателство, че полето наистина е празно място в документа).
 *  3. Всеки намек за същностен риск — противоречие, различие, форма,
 *     действителност, срок, сума, валута, подпис, нотариус, вписване — веднага
 *     връща "запази".
 *  4. Неизвестно/двусмислено → запази. Никога не използваме произхода на
 *     документа ("ние го генерирахме") като основание да скрием констатация.
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
 * Думи, които сигнализират СЪЩНОСТЕН проблем (не просто празно поле).
 * Наличието на която и да е от тях означава: констатацията остава както е.
 */
const SUBSTANTIVE_VETO = [
  "противореч",
  "несъответств",
  "не съответств",
  "разлик",
  "различ",
  "не съвпад",
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
  "давност",
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
  "два пъти",
  "дублир",
];

/** Токени от редакцията (<EGN_1>, <NAME_2>) не са реални липсващи полета. */
const REDACTION_TOKEN_RE = /^<?[A-Z_]{3,}_\d+>?$/;

const TOKEN_RE = /\[([^\[\]\n]{1,60})\]|\{\{([^{}\n]{1,60})\}\}/g;

function normalizeLabel(raw: string): string {
  return raw
    .replace(/[…\.·:；;,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Извлича пълните placeholder токени (нормализирани етикети) от текст. */
export function extractPlaceholderTokens(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    const inner = m[1] ?? m[2] ?? "";
    const norm = normalizeLabel(inner);
    if (norm) out.push(norm);
  }
  return out;
}

function hasSubstantiveSignal(text: string): boolean {
  const t = text.toLowerCase();
  return SUBSTANTIVE_VETO.some((w) => t.includes(w));
}

/**
 * true САМО когато констатацията описва конкретно непопълнено локално
 * лично/идентификационно поле, доказано присъстващо в оригиналния текст,
 * и не твърди никакъв същностен проблем.
 */
export function isDeferredLocalPlaceholder(
  itemText: string,
  originalDocumentText: string,
): boolean {
  if (!itemText || !originalDocumentText) return false;
  if (hasSubstantiveSignal(itemText)) return false;

  const tokens = extractPlaceholderTokens(itemText);
  if (tokens.length === 0) return false;

  const documentTokens = new Set(extractPlaceholderTokens(originalDocumentText));
  if (documentTokens.size === 0) return false;

  for (const token of tokens) {
    if (REDACTION_TOKEN_RE.test(token.toUpperCase())) return false;
    if (!DEFERRABLE_LABELS.has(token)) return false;
    if (!documentTokens.has(token)) return false;
  }
  return true;
}

/** Видима неутрална бележка за проверки върху отложени полета. */
export const DEFERRED_NOTE = "За попълване преди използване";

export type ReviewCheck = {
  id?: unknown;
  label?: unknown;
  status?: unknown;
  note?: unknown;
  [k: string]: unknown;
};

/**
 * Проверките НИКОГА не се изтриват. Ако "fail" се дължи единствено на
 * отложено локално лично поле, статусът се сваля до "warn" с явна бележка.
 */
export function softenDeferredCheck(
  check: ReviewCheck,
  originalDocumentText: string,
): ReviewCheck {
  if (String(check.status) !== "fail") return check;
  const text = `${check.label ?? ""} ${check.note ?? ""}`;
  if (!isDeferredLocalPlaceholder(text, originalDocumentText)) return check;
  const note = String(check.note ?? "").trim();
  return {
    ...check,
    status: "warn",
    note: note.includes(DEFERRED_NOTE)
      ? note
      : (note ? `${note} — ${DEFERRED_NOTE}.` : `${DEFERRED_NOTE}.`),
  };
}
