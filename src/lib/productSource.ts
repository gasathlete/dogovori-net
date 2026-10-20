/**
 * Каноничните правила за източника на еднократен продукт — версия за браузъра.
 *
 * Пази СЪЩИТЕ константи и СЪЩАТА нормализация като
 * `supabase/functions/_shared/product-source.ts` (има parity тест).
 */

/** Единственият документиран лимит за източника на еднократен продукт. */
export const PRODUCT_MAX_SOURCE_CHARS = 60000;

/** Минимум знаци, под които не можем да твърдим, че документът е прочетен. */
export const PRODUCT_MIN_SOURCE_CHARS = 80;

/**
 * ЕДИНСТВЕНАТА мерна единица за дължината на източника: Unicode кодови точки.
 *
 * Това е съзнателен избор, за да съвпадат три различни среди:
 *  - PostgreSQL: `length(text)` брои кодови точки;
 *  - Deno/Edge и браузър: итерирането по низ дава кодови точки.
 * Свойството `String.length` в JavaScript брои UTF-16 units и НЕ се използва
 * никъде по продуктовия път — емоджи и други знаци извън BMP биха дали 2.
 */
export const PRODUCT_SOURCE_CHAR_UNIT = "unicode_code_points" as const;
export type ProductSourceCharUnit = typeof PRODUCT_SOURCE_CHAR_UNIT;

/** Каноничният брой знаци на източника (Unicode кодови точки). */
export function countProductSourceChars(text: string): number {
  let count = 0;
  for (const _ch of text) count += 1;
  return count;
}

/** Платеният продукт е обвързан с ФАЙЛ: PDF с четим текст или DOCX. */
export type ProductSourceKind = "pdf" | "docx" | "owner_text";
export type ProductExtractionStatus = "full" | "partial";

export function normalizeProductSourceText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Кратко човешко обяснение какво приемаме за платените продукти. */
export const PRODUCT_ACCEPTED_INPUT =
  "Поставяте пълния текст на документа: от 80 до 60 000 знака. Файлове (PDF/DOCX) и снимки временно не се приемат.";
