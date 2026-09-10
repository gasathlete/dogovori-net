/**
 * Извличане на текст САМО за платените еднократни продукти.
 *
 * Разликата спрямо общото извличане за анализ е нарочна:
 *  - четем всяка страница, за да можем да кажем дали документът е прочетен цял;
 *  - никога не отрязваме текста тихо;
 *  - НЕ пускаме разпознаване на изображения и НЕ ползваме операции от плана.
 *
 * Общият път за анализ (`extractContractText.ts`) остава непроменен.
 */
import {
  PRODUCT_MAX_SOURCE_CHARS,
  PRODUCT_MIN_SOURCE_CHARS,
  normalizeProductSourceText,
  type ProductExtractionStatus,
  type ProductSourceKind,
} from "@/lib/productSource";
import { sha256Hex } from "@/lib/extractContractText";

export interface ProductExtractionResult {
  readonly status: ProductExtractionStatus;
  readonly sourceKind: ProductSourceKind;
  /** Пълният нормализиран текст. Празен, когато статусът е `partial`. */
  readonly text: string;
  readonly charCount: number;
  /** Измерен брой страници, когато е известен. */
  readonly pageCount: number | null;
  /** SHA-256 върху ЦЕЛИЯ нормализиран текст. Празен при `partial`. */
  readonly sourceHash: string;
  /** Причина, когато документът не може да се приеме. */
  readonly blockedReason?: ProductExtractionBlock;
  /** Кратко човешко обяснение на български. */
  readonly message?: string;
}

export type ProductExtractionBlock =
  | "too_long"
  | "no_text_layer"
  | "garbled_text"
  | "too_short"
  | "unreadable";

const BLOCK_MESSAGES: Record<ProductExtractionBlock, string> = {
  too_long: `Документът е по-дълъг от ${PRODUCT_MAX_SOURCE_CHARS.toLocaleString("bg-BG")} знака. За да не Ви продадем частичен резултат, не приемаме плащане за него.`,
  no_text_layer:
    "Този PDF е сканиран — буквите са изображение, не текст. Приемаме PDF с четим текст или DOCX.",
  garbled_text:
    "Текстът в този PDF се чете нечетливо. Опитайте с DOCX или с PDF, чийто текст може да се маркира и копира.",
  too_short: "Прочетеният текст е твърде кратък, за да е целият документ.",
  unreadable:
    "Не успяхме да отворим файла на това устройство. Приемаме PDF с четим текст или DOCX.",
};

function blocked(
  sourceKind: ProductSourceKind,
  reason: ProductExtractionBlock,
  pageCount: number | null,
  charCount = 0,
): ProductExtractionResult {
  return {
    status: "partial",
    sourceKind,
    text: "",
    charCount,
    pageCount,
    sourceHash: "",
    blockedReason: reason,
    message: BLOCK_MESSAGES[reason],
  };
}

async function complete(
  sourceKind: ProductSourceKind,
  text: string,
  pageCount: number | null,
): Promise<ProductExtractionResult> {
  return {
    status: "full",
    sourceKind,
    text,
    charCount: text.length,
    pageCount,
    sourceHash: await sha256Hex(text),
  };
}

/** Пълно извличане за продуктовия път. Никога не отрязва и никога не пуска OCR. */
export async function extractProductSource(
  input: { file?: File | null; pastedText?: string },
  onPhase?: (phase: string) => void,
): Promise<ProductExtractionResult> {
  if (!input.file) {
    const text = normalizeProductSourceText(input.pastedText ?? "");
    if (text.length > PRODUCT_MAX_SOURCE_CHARS) return blocked("paste", "too_long", null, text.length);
    if (text.length < PRODUCT_MIN_SOURCE_CHARS) return blocked("paste", "too_short", null, text.length);
    return complete("paste", text, null);
  }

  const { detectFileKind } = await import("@/lib/fileValidation");
  const kind = detectFileKind(input.file);
  if (kind === "docx") return extractDocxSource(input.file, onPhase);
  if (kind === "pdf") return extractPdfSource(input.file, onPhase);
  return blocked("paste", "unreadable", null);
}

async function extractDocxSource(
  file: File,
  onPhase?: (phase: string) => void,
): Promise<ProductExtractionResult> {
  onPhase?.("Прочитаме документа…");
  let raw = "";
  try {
    const mammoth = await import("mammoth");
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    raw = result.value ?? "";
  } catch {
    return blocked("docx", "unreadable", null);
  }
  const text = normalizeProductSourceText(raw);
  if (text.length > PRODUCT_MAX_SOURCE_CHARS) return blocked("docx", "too_long", null, text.length);
  if (text.length < PRODUCT_MIN_SOURCE_CHARS) return blocked("docx", "too_short", null, text.length);
  return complete("docx", text, null);
}

const MIN_PDF_CHARS_PER_PAGE = 40;

async function extractPdfSource(
  file: File,
  onPhase?: (phase: string) => void,
): Promise<ProductExtractionResult> {
  interface PdfPage {
    getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
  }
  interface PdfDocument {
    numPages: number;
    getPage: (index: number) => Promise<PdfPage>;
  }
  interface PdfJsModule {
    GlobalWorkerOptions: { workerSrc: string };
    getDocument: (args: { data: ArrayBuffer }) => { promise: Promise<PdfDocument> };
  }

  let pdf: PdfDocument | null = null;
  let pageCount: number | null = null;
  try {
    onPhase?.("Отваряме PDF…");
    const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJsModule;
    // @ts-expect-error - worker URL import
    const workerSrc = (await import("pdfjs-dist/legacy/build/pdf.worker.mjs?url")).default as string;
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
    const arrayBuffer = await file.arrayBuffer();
    pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    pageCount = pdf.numPages as number;
  } catch {
    return blocked("pdf", "unreadable", pageCount);
  }

  const parts: string[] = [];
  try {
    for (let i = 1; i <= (pageCount ?? 0); i += 1) {
      onPhase?.(`Прочитаме страница ${i} от ${pageCount}…`);
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      parts.push(content.items.map((it: any) => ("str" in it ? it.str : "")).join(" "));
    }
  } catch {
    // Частичното прочитане не се продава.
    return blocked("pdf", "unreadable", pageCount);
  }

  const text = normalizeProductSourceText(parts.join("\n\n"));
  const letters = text.match(/\p{L}/gu) ?? [];
  const cyrillic = text.match(/[\u0400-\u04FF]/g) ?? [];
  const cyrillicRatio = letters.length > 0 ? cyrillic.length / letters.length : 0;

  if (letters.length > 200 && cyrillicRatio < 0.3) {
    return blocked("pdf", "garbled_text", pageCount, text.length);
  }
  if (
    text.length < PRODUCT_MIN_SOURCE_CHARS ||
    (pageCount && text.length / pageCount < MIN_PDF_CHARS_PER_PAGE)
  ) {
    return blocked("pdf", "no_text_layer", pageCount, text.length);
  }
  if (text.length > PRODUCT_MAX_SOURCE_CHARS) {
    return blocked("pdf", "too_long", pageCount, text.length);
  }
  return complete("pdf", text, pageCount);
}
