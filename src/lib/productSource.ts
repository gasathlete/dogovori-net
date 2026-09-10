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

/** Платеният продукт е обвързан с ФАЙЛ: PDF с четим текст или DOCX. */
export type ProductSourceKind = "pdf" | "docx";
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
  "Приемаме PDF с четим текст или DOCX, до 60 000 знака. Сканирани документи и снимки още не се приемат.";
