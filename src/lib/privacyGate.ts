/**
 * Преграда за ограничени идентификатори (privacy gate).
 *
 * Условията за ползване на Lovable забраняват държавни идентификатори (ЕГН,
 * лична карта, паспорт) и номера на финансови сметки (IBAN, банкова сметка) да
 * бъдат обработвани в средата. Докато не е конфигуриран отделен контролиран
 * бекенд, тази преграда работи ПРЕДИ всяка мрежова заявка и е fail-closed:
 *
 *  - Суров файл (PDF/DOCX) не се качва. Текстовата проверка не може да докаже,
 *    че двоичното съдържание е чисто (метаданни, вградени изображения, следи от
 *    редакция), затова качването е спряно изцяло.
 *  - Сканиран PDF не се разпознава — изображенията на страниците не могат да
 *    бъдат проверени преди изпращане.
 *  - Поставен текст и отговори във въпросника се проверяват локално и се спират,
 *    ако съдържат ограничен идентификатор.
 *
 * Не пазим съответствие между истинска и заместена стойност и не възстановяваме
 * ограничени идентификатори тук. Заместването се прави от потребителя локално.
 */
import { isValidEGN } from "@/lib/bgValidation";

export type RestrictedIdentifierKind = "egn" | "iban" | "bank_account" | "id_document";

export const RESTRICTED_IDENTIFIER_LABELS: Record<RestrictedIdentifierKind, string> = {
  egn: "ЕГН",
  iban: "IBAN",
  bank_account: "номер на банкова сметка",
  id_document: "номер на лична карта или паспорт",
};

/** Суровите файлове са спрени, докато няма отделен контролиран бекенд. */
export const RAW_FILE_INGRESS_ALLOWED = false;

/** Локално извличане: файлът остава на устройството, изпраща се само прегледаният текст. */
export const LOCAL_FILE_MAX_CHARS = 60_000;
export const LOCAL_FILE_EXTRACTION_NOTE =
  "Изберете файл в раздел „Текст“. Текстът се извлича в браузъра Ви, а самият файл не се качва. Сканирани PDF файлове не се разпознават. Преди изпращане прегледайте текста и заменете ЕГН, IBAN и номера на документи с [ЕГН], [IBAN] и подобни.";

export const RAW_FILE_BLOCKED_TITLE = "Качването на файлове е временно спряно";
export const RAW_FILE_BLOCKED_MESSAGE =
  "В момента не приемаме PDF и Word файлове. Файлът може да съдържа ЕГН, номер на лична карта или банкова сметка, а от текста не може да се докаже, че самият файл е чист. Докато не включим отделно защитено хранилище, поставете текста на документа в полето „Текст“ и заменете личните данни с думи в скоби, например [ЕГН] и [IBAN].";

export const SCANNED_PDF_BLOCKED_MESSAGE =
  "Този PDF е сканиран — буквите са изображение. Разпознаването на изображения е временно спряно, защото снимката на страницата може да съдържа ЕГН или банкова сметка. Поставете текста ръчно и заменете личните данни с [ЕГН], [IBAN] и подобни.";

/** Едно човешко съобщение за всички текстови входове. */
export function restrictedIdentifierMessage(kinds: readonly RestrictedIdentifierKind[]): string {
  const found = kinds.map((k) => RESTRICTED_IDENTIFIER_LABELS[k]).join(", ");
  return `Открихме ограничени лични данни в текста (${found}). Не можем да ги обработваме. Заменете ги в текста при Вас — например [ЕГН], [IBAN], [номер на лична карта] — и изпратете отново. Попълнете истинските данни в готовия документ на Вашето устройство.`;
}

export class RestrictedIdentifierError extends Error {
  readonly kinds: readonly RestrictedIdentifierKind[];
  constructor(kinds: readonly RestrictedIdentifierKind[]) {
    super(restrictedIdentifierMessage(kinds));
    this.name = "RestrictedIdentifierError";
    this.kinds = kinds;
  }
}

const EGN_BARE_RE = /\d{10}/g;
const EGN_LABELLED_RE =
  /(?:ЕГН|егн|Егн|E\.?G\.?N|ЛНЧ|лнч)\s*(?:№|:|\.|-)?\s*([\d\s-]{6,})/g;
const IBAN_RE = /\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]){10,26}\b/g;
const IBAN_LABELLED_RE = /(?:IBAN|ИБАН)\s*(?:№|:|-)?\s*([A-Z0-9 -]{8,})/gi;
const BANK_ACCOUNT_RE =
  /(?:банкова\s*сметка|разплащателна\s*сметка|сметка|account\s*number|acc\.?\s*no)\s*(?:№|:|-)?\s*([A-Z0-9][A-Z0-9 -]{7,})/gi;
const ID_DOCUMENT_RE =
  /(?:лична\s*карта|л\.?\s?к\.?|паспорт|passport|id\s*card)\s*(?:№|:|-)?\s*([A-Z0-9]{5,})/gi;

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Същото правило като сървърната преграда
 * (supabase/functions/_shared/text-identifier-gate.ts): 10 цифри с възможна
 * дата, БЕЗ изискване за вярна контролна сума. Грешна контролна сума не прави
 * стойността безопасна. Обикновени години и суми остават незасегнати, защото
 * се изискват точно 10 последователни цифри с достоверен месец и ден.
 */
export function isPlausibleEgnDigits(value: string): boolean {
  const d = digitsOnly(value);
  if (d.length !== 10) return false;
  if (/^(\d)\1{9}$/.test(d)) return false;
  const month = Number(d.slice(2, 4));
  const day = Number(d.slice(4, 6));
  const monthOk =
    (month >= 1 && month <= 12) ||
    (month >= 21 && month <= 32) ||
    (month >= 41 && month <= 52);
  if (!monthOk) return false;
  return day >= 1 && day <= 31;
}

/**
 * Намира видовете ограничени идентификатори в текст. Празни полета, скоби и
 * черти за ръчно попълване ([ЕГН], ______, ХХХХ) НЕ се засичат — там няма
 * стойност, така че генерирането на бланки остава напълно достъпно.
 */
export function findRestrictedIdentifiers(input: string | null | undefined): RestrictedIdentifierKind[] {
  const text = String(input ?? "");
  if (!text) return [];
  const kinds = new Set<RestrictedIdentifierKind>();

  // ЕГН: достоверна структура (дори при грешна контролна сума) ИЛИ изрично
  // обозначено поле с цифри — същото правило като сървърната преграда.
  for (const m of text.matchAll(EGN_BARE_RE)) {
    if (isValidEGN(m[0]) || isPlausibleEgnDigits(m[0])) {
      kinds.add("egn");
      break;
    }
  }
  if (!kinds.has("egn")) {
    for (const m of text.matchAll(EGN_LABELLED_RE)) {
      if (digitsOnly(m[1]).length >= 6) {
        kinds.add("egn");
        break;
      }
    }
  }

  // IBAN: структурен образец или изрично обозначено поле.
  for (const m of text.matchAll(IBAN_RE)) {
    const compact = m[0].replace(/[ -]/g, "");
    if (compact.length >= 15 && /\d/.test(compact.slice(4))) {
      kinds.add("iban");
      break;
    }
  }
  if (!kinds.has("iban")) {
    for (const m of text.matchAll(IBAN_LABELLED_RE)) {
      if (digitsOnly(m[1]).length >= 6) {
        kinds.add("iban");
        break;
      }
    }
  }

  for (const m of text.matchAll(BANK_ACCOUNT_RE)) {
    if (digitsOnly(m[1]).length >= 6) {
      kinds.add("bank_account");
      break;
    }
  }

  for (const m of text.matchAll(ID_DOCUMENT_RE)) {
    if (digitsOnly(m[1]).length >= 5) {
      kinds.add("id_document");
      break;
    }
  }

  return [...kinds];
}

export function hasRestrictedIdentifiers(input: string | null | undefined): boolean {
  return findRestrictedIdentifiers(input).length > 0;
}

/** Обхожда произволна структура (отговори от въпросника) и събира намереното. */
export function findRestrictedIdentifiersDeep(value: unknown, depth = 0): RestrictedIdentifierKind[] {
  if (depth > 6) return [];
  if (typeof value === "string") return findRestrictedIdentifiers(value);
  if (typeof value === "number") return findRestrictedIdentifiers(String(value));
  if (Array.isArray(value)) {
    const out = new Set<RestrictedIdentifierKind>();
    for (const v of value) for (const k of findRestrictedIdentifiersDeep(v, depth + 1)) out.add(k);
    return [...out];
  }
  if (value && typeof value === "object") {
    const out = new Set<RestrictedIdentifierKind>();
    for (const v of Object.values(value as Record<string, unknown>)) {
      for (const k of findRestrictedIdentifiersDeep(v, depth + 1)) out.add(k);
    }
    return [...out];
  }
  return [];
}

/** Fail-closed проверка: хвърля, преди да е направена мрежова заявка. */
export function assertNoRestrictedIdentifiers(value: unknown): void {
  const kinds = findRestrictedIdentifiersDeep(value);
  if (kinds.length > 0) throw new RestrictedIdentifierError(kinds);
}

/**
 * Клиентски запис на НОВ суров текст в uploaded_contracts е забранен от
 * миграция 0044 (enforce_no_client_document_text_write), докато няма отделен
 * контролиран бекенд. Затова интерфейсът не предлага „само запис“ за нов текст.
 */
export const CLIENT_RAW_TEXT_WRITE_ALLOWED = false;
export const CLIENT_RAW_TEXT_WRITE_BLOCKED_MESSAGE =
  "Запазването на нов текст още не е отворено. Нищо не е изпратено. Вече запазените документи остават достъпни.";
