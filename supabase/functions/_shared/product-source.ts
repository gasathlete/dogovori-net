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

/** Платеният продукт е обвързан с ФАЙЛ: PDF с четим текст или DOCX. */
export type ProductSourceKind = "pdf" | "docx";

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
  | "source_kind_unsupported"
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
  updated_at?: string | null;
  /** Твърденията на браузъра НЕ са доказателство, но липсата им е отказ. */
  product_extraction_status?: string | null;
  product_extracted_chars?: number | null;
  product_source_pages?: number | null;
  product_source_kind?: string | null;
}

export interface VerifiedProductSource {
  readonly text: string;
  readonly charCount: number;
  readonly sourceHash: string;
  readonly sourceKind: ProductSourceKind;
  /** Измерен брой страници, когато е известен. Не е доказателство за пълнота. */
  readonly pageCount: number | null;
  /** Точната ревизия на реда — платеното право се обвързва с нея. */
  readonly sourceUpdatedAt: string;
}

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * Проверява съхранения източник, без да вярва на браузъра, и се проваля
 * ЗАТВОРЕНО при липсваща истина:
 * 1. текстът трябва да е точно в каноничната нормализирана форма;
 * 2. SHA-256 върху него трябва да съвпада със записания 64-знаков хеш;
 * 3. дължината трябва да е в рамките на единствения продуктов лимит;
 * 4. записаният статус трябва да е ТОЧНО `full`;
 * 5. записаният брой знаци трябва да е ТОЧНО дължината на текста;
 * 6. видът на източника трябва да е PDF или DOCX;
 * 7. редът трябва да има точна ревизия (`updated_at`).
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
  if (!HEX64.test(storedHash)) throw new ProductSourceError("source_hash_mismatch");
  const actual = (await sha256Hex(raw)).toLowerCase();
  if (actual !== storedHash) throw new ProductSourceError("source_hash_mismatch");

  // Липсващото доказателство е отказ, не „вероятно е добре“.
  if (row?.product_extraction_status !== "full") {
    throw new ProductSourceError("source_incomplete");
  }
  if (row?.product_extracted_chars !== raw.length) {
    throw new ProductSourceError("source_incomplete");
  }
  const kind = row?.product_source_kind;
  if (kind !== "pdf" && kind !== "docx") {
    throw new ProductSourceError("source_kind_unsupported");
  }
  const updatedAt = typeof row?.updated_at === "string" ? row.updated_at : "";
  if (!updatedAt) throw new ProductSourceError("source_incomplete");

  const pages = row?.product_source_pages;
  return {
    text: raw,
    charCount: raw.length,
    sourceHash: actual,
    sourceKind: kind,
    pageCount: typeof pages === "number" && pages > 0 ? pages : null,
    sourceUpdatedAt: updatedAt,
  };
}

