/**
 * Извличане на текст САМО за платените еднократни продукти.
 *
 * Разликата спрямо общото извличане за анализ е нарочна:
 *  - приемаме само ФАЙЛ: PDF с четим текст или DOCX (без поставен текст);
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
  readonly sourceKind: ProductSourceKind | null;
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
  | "page_without_text"
  | "low_text_quality"
  | "too_short"
  | "file_required"
  | "unreadable";

const BLOCK_MESSAGES: Record<ProductExtractionBlock, string> = {
  too_long: `Документът е по-дълъг от ${PRODUCT_MAX_SOURCE_CHARS.toLocaleString("bg-BG")} знака. За да не Ви продадем частичен резултат, не приемаме плащане за него.`,
  no_text_layer:
    "Този PDF е сканиран — буквите са изображение, не текст. Приемаме PDF с четим текст или DOCX.",
  page_without_text:
    "Една или повече страници в този PDF нямат четим текст. За да не Ви продадем частичен резултат, не го приемаме. Приемаме PDF с четим текст или DOCX.",
  low_text_quality:
    "Текстът в този PDF се чете нечетливо. Опитайте с DOCX или с PDF, чийто текст може да се маркира и копира.",
  too_short: "Прочетеният текст е твърде кратък, за да е целият документ.",
  file_required: "Приемаме файл: PDF с четим текст или DOCX.",
  unreadable:
    "Не успяхме да отворим файла на това устройство. Приемаме PDF с четим текст или DOCX.",
};

function blocked(
  sourceKind: ProductSourceKind | null,
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

/**
 * Пълно извличане за продуктовия път. Никога не отрязва и никога не пуска OCR.
 * Приема само файл — поставеният текст не е обвързан с документ.
 */
export async function extractProductSource(
  input: { file?: File | null },
  onPhase?: (phase: string) => void,
): Promise<ProductExtractionResult> {
  if (!input.file) return blocked(null, "file_required", null);

  const { detectFileKind } = await import("@/lib/fileValidation");
  const kind = detectFileKind(input.file);
  if (kind === "docx") return extractDocxSource(input.file, onPhase);
  if (kind === "pdf") return extractPdfSource(input.file, onPhase);
  return blocked(null, "file_required", null);
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

/** Под този праг една страница се брои за „без четим текст“. */
const MIN_PDF_CHARS_PER_PAGE = 40;

/**
 * Езиково неутрална проверка на качеството на текстовия слой: гледаме дали
 * прочетеното изобщо изглежда като текст (букви, разумни думи), а не на кой
 * език е. Отказът е ясен и кратък — по-добре, отколкото частичен резултат.
 */
function looksLikeReadableText(text: string): boolean {
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  if (letters === 0) return false;
  const meaningful = (text.match(/[\p{L}\p{N}\p{P}\s]/gu) ?? []).length;
  // Много знаци извън букви/цифри/пунктуация/интервали = повреден текстов слой.
  if (meaningful / text.length < 0.9) return false;
  // Твърде малко букви спрямо общата дължина също е признак за шум.
  if (letters / text.length < 0.5) return false;
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length < 20) return false;
  const wordLike = words.filter((w) => /\p{L}{2,}/u.test(w)).length;
  return wordLike / words.length >= 0.6;
}

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
    const workerSrc = (await import("pdfjs-dist/legacy/build/pdf.worker.mjs?url")).default as string;
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
    const arrayBuffer = await file.arrayBuffer();
    pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    pageCount = pdf.numPages;
  } catch {
    return blocked("pdf", "unreadable", pageCount);
  }

  if (!pageCount || pageCount < 1) return blocked("pdf", "unreadable", pageCount);

  const parts: string[] = [];
  let emptyPages = 0;
  try {
    // Четем ВСЯКА страница: само така знаем дали документът е прочетен цял.
    for (let i = 1; i <= pageCount; i += 1) {
      onPhase?.(`Прочитаме страница ${i} от ${pageCount}…`);
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = normalizeProductSourceText(
        content.items.map((it) => it.str ?? "").join(" "),
      );
      if (pageText.length < MIN_PDF_CHARS_PER_PAGE) emptyPages += 1;
      parts.push(pageText);
    }
  } catch {
    // Частичното прочитане не се продава.
    return blocked("pdf", "unreadable", pageCount);
  }

  const text = normalizeProductSourceText(parts.join("\n\n"));

  // Изцяло сканиран документ.
  if (emptyPages === pageCount) return blocked("pdf", "no_text_layer", pageCount, text.length);
  // Частично сканиран: една липсваща страница прави резултата непълен.
  if (emptyPages > 0) return blocked("pdf", "page_without_text", pageCount, text.length);
  if (text.length < PRODUCT_MIN_SOURCE_CHARS) {
    return blocked("pdf", "too_short", pageCount, text.length);
  }
  if (!looksLikeReadableText(text)) {
    return blocked("pdf", "low_text_quality", pageCount, text.length);
  }
  if (text.length > PRODUCT_MAX_SOURCE_CHARS) {
    return blocked("pdf", "too_long", pageCount, text.length);
  }
  return complete("pdf", text, pageCount);
}
