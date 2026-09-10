/**
 * Каноничната истина за ИЗТОЧНИКА на един платен продукт (сървърна страна).
 *
 * Продуктът обещава подробен резултат за ЦЕЛИЯ документ. Затова приемаме само
 * пълно прочетен текст: без тихо отрязване, без частичен OCR.
 *
 * Модулът е чист (без Deno/DB/Stripe API), за да е напълно тестваем и да има
 * parity тест със същите правила в браузъра (`src/lib/productSource.ts`).
 */

/** Единственият документиран лимит за източника на еднократен продукт. */
export const PRODUCT_MAX_SOURCE_CHARS = 60000;

/** Минимум знаци, под които не можем да твърдим, че документът е прочетен. */
export const PRODUCT_MIN_SOURCE_CHARS = 80;

export type ProductSourceKind = "pdf" | "docx" | "paste";
export type ProductExtractionStatus = "full" | "partial";

/**
 * Единствената нормализация на текста на източника. Хешът SHA-256 се смята
 * върху ТОЧНО този резултат — и в браузъра, и на сървъра.
 */
export function normalizeProductSourceText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type ProductSourceProblem =
  | "source_missing"
  | "source_too_short"
  | "source_not_normalized"
  | "source_too_long"
  | "source_hash_mismatch"
  | "source_incomplete";

export class ProductSourceError extends Error {
  readonly reason: ProductSourceProblem;
  constructor(reason: ProductSourceProblem) {
    super(reason);
    this.reason = reason;
    this.name = "ProductSourceError";
  }
}

export interface StoredProductSource {
  extracted_text?: string | null;
  text_hash?: string | null;
  /** Метаданните от браузъра са НЕДОВЕРЕНИ — служат само за допълнителен отказ. */
  product_extraction_status?: string | null;
  product_extracted_chars?: number | null;
  product_source_pages?: number | null;
}

export interface VerifiedProductSource {
  readonly text: string;
  readonly charCount: number;
  readonly sourceHash: string;
  /** Информативно. Никога не е доказателство за пълнота. */
  readonly pageCount: number | null;
}

/**
 * Проверява съхранения източник, без да вярва на браузъра:
 * 1. текстът трябва да е точно в каноничната нормализирана форма;
 * 2. SHA-256 върху него трябва да съвпада със записания хеш;
 * 3. дължината трябва да е в рамките на единствения продуктов лимит;
 * 4. ако има записан статус на извличането, той трябва да е `full`.
 */
export async function verifyStoredProductSource(
  row: StoredProductSource | null | undefined,
  sha256Hex: (value: string) => Promise<string>,
): Promise<VerifiedProductSource> {
  const raw = typeof row?.extracted_text === "string" ? row.extracted_text : "";
  if (!raw.trim()) throw new ProductSourceError("source_missing");
  if (raw !== normalizeProductSourceText(raw)) {
    throw new ProductSourceError("source_not_normalized");
  }
  if (raw.length < PRODUCT_MIN_SOURCE_CHARS) throw new ProductSourceError("source_too_short");
  if (raw.length > PRODUCT_MAX_SOURCE_CHARS) throw new ProductSourceError("source_too_long");

  const storedHash = typeof row?.text_hash === "string" ? row.text_hash.toLowerCase() : "";
  if (!storedHash) throw new ProductSourceError("source_hash_mismatch");
  const actual = (await sha256Hex(raw)).toLowerCase();
  if (actual !== storedHash) throw new ProductSourceError("source_hash_mismatch");

  const status = row?.product_extraction_status;
  if (typeof status === "string" && status && status !== "full") {
    throw new ProductSourceError("source_incomplete");
  }
  const claimedChars = row?.product_extracted_chars;
  if (typeof claimedChars === "number" && claimedChars !== raw.length) {
    throw new ProductSourceError("source_incomplete");
  }

  const pages = row?.product_source_pages;
  return {
    text: raw,
    charCount: raw.length,
    sourceHash: actual,
    pageCount: typeof pages === "number" && pages > 0 ? pages : null,
  };
}
