/**
 * Едно място за качване на документ, който ще бъде обработен от платен продукт.
 *
 * Ползва СЪЩАТА валидация, извличане на текст, качване на оригинала и запис,
 * както качването за анализ — без по-слаб дубликат. Тук няма плащане, AI
 * извикване или анализ.
 */
import { supabase } from "@/integrations/supabase/client";
import { type ExtractSource } from "@/lib/extractContractText";
import { extractProductSource } from "@/lib/productExtraction";
import { PRODUCT_MIN_SOURCE_CHARS, PRODUCT_SOURCE_CHAR_UNIT, countProductSourceChars } from "@/lib/productSource";

export const MAX_PRODUCT_FILE_BYTES = 10 * 1024 * 1024;
export const MIN_PRODUCT_TEXT_LENGTH = PRODUCT_MIN_SOURCE_CHARS;

export interface PreparedProductDocument {
  readonly uploadedContractId: string;
  readonly title: string;
  readonly source: ExtractSource;
  /** Дължина в каноничната единица (Unicode кодови точки). */
  readonly textLength: number;
  readonly charUnit: typeof PRODUCT_SOURCE_CHAR_UNIT;
  readonly sourceHash: string;
  readonly originalFilename: string | null;
  /** Винаги `full` — частичен източник не стига до тук. */
  readonly extractionStatus: "full";
  readonly pageCount: number | null;
  /** Кратко начало на прочетения текст — за да види човекът, че е верният документ. */
  readonly preview: string;
}


export class ProductUploadError extends Error {}

/** Кратки, човешки съобщения. Никога не показваме технически детайли на клиента. */
export const PRODUCT_SCHEMA_UNAVAILABLE_MESSAGE =
  "Продуктът се включва в момента. Документът не е запазен и плащане не е извършено.";
export const PRODUCT_PERSIST_FAILED_MESSAGE =
  "Не успяхме да запазим документа. Опитайте отново.";

/**
 * Разпознава дали грешката при запис идва от липсваща/още неприложена схема.
 * Класификацията гледа код и текст, но НИКОГА не пренася текста към UI.
 */
export function isSchemaUnavailableError(err: unknown): boolean {
  const anyErr = err as { code?: unknown; message?: unknown } | null;
  const code = typeof anyErr?.code === "string" ? anyErr.code.toUpperCase() : "";
  if (["PGRST204", "PGRST205", "42703", "42P01", "42P10", "42883"].includes(code)) return true;
  const raw = typeof anyErr?.message === "string" ? anyErr.message.toLowerCase() : "";
  if (!raw) return false;
  return (
    raw.includes("schema cache") ||
    raw.includes("could not find the") ||
    (raw.includes("column") && (raw.includes("does not exist") || raw.includes("not find"))) ||
    (raw.includes("relation") && raw.includes("does not exist")) ||
    raw.includes("undefined column") ||
    raw.includes("undefined table")
  );
}

/** Превръща произволна persistence грешка в безопасно човешко съобщение. */
export function productPersistErrorMessage(err: unknown): string {
  return isSchemaUnavailableError(err)
    ? PRODUCT_SCHEMA_UNAVAILABLE_MESSAGE
    : PRODUCT_PERSIST_FAILED_MESSAGE;
}

/** Валидира файла точно както качването за анализ (magic bytes + MIME + размер). */
export async function validateProductFile(file: File): Promise<ExtractSource> {
  const { validateUploadedFile, detectFileKind } = await import("@/lib/fileValidation");
  const kind = detectFileKind(file);
  if (!kind) throw new ProductUploadError("Поддържаме само PDF или DOCX файлове.");
  const check = await validateUploadedFile(file, kind, MAX_PRODUCT_FILE_BYTES);
  if (!check.ok) throw new ProductUploadError(check.error ?? "Невалиден файл.");
  return kind;
}

async function ensureFreshSession() {
  const refreshed = await supabase.auth.refreshSession();
  const active = refreshed.data.session ?? (await supabase.auth.getSession()).data.session;
  if (!active) {
    throw new ProductUploadError("Сесията Ви изтече. Влезте отново и опитайте пак.");
  }
  return active;
}

async function uploadOriginal(path: string, file: File, source: ExtractSource) {
  const contentType = file.type || (source === "pdf"
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) await ensureFreshSession();
    const upload = await supabase.storage
      .from("user-contracts")
      .upload(path, file, { contentType, upsert: false });
    if (!upload.error) return;
    const message = upload.error.message?.toLowerCase() ?? "";
    const rls = message.includes("row-level security") || message.includes("permission denied");
    if (attempt === 0 && rls) continue;
    throw new ProductUploadError(
      rls
        ? "Сесията за качване изтече. Опреснете страницата и опитайте пак."
        : "Не успяхме да качим файла. Опитайте отново.",
    );
  }
}

export interface PrepareProductDocumentInput {
  userId: string;
  title: string;
  /** Само файл: PDF с четим текст или DOCX. Поставен текст не се приема. */
  file: File;
  onPhase?: (phase: string) => void;
}

/**
 * Подготвя документа за продукта: прочита ЦЕЛИЯ текст, качва оригинала и
 * записва реда в `uploaded_contracts`. Ако записът се провали, изтриваме само
 * току-що качения обект — заварени файлове не се пипат.
 */
export async function prepareProductDocument(
  input: PrepareProductDocumentInput,
): Promise<PreparedProductDocument> {
  const title = input.title.trim();
  if (!title) throw new ProductUploadError("Добавете заглавие на документа.");
  if (!input.file) throw new ProductUploadError("Приемаме файл: PDF с четим текст или DOCX.");
  const phase = input.onPhase ?? (() => {});

  const source = await validateProductFile(input.file);
  phase("Прочитаме документа…");
  // Продуктовият път чете целия документ и НЕ ползва OCR/операции.
  const extraction = await extractProductSource({ file: input.file }, phase);
  if (extraction.status !== "full") {
    throw new ProductUploadError(extraction.message ?? "Не можем да приемем този документ.");
  }
  const text = extraction.text;
  const charCount = countProductSourceChars(text);
  const pageCount = extraction.pageCount;
  const sourceHash = extraction.sourceHash;

  phase("Качване на оригинала…");
  await ensureFreshSession();
  const ext = source === "pdf" ? "pdf" : "docx";
  const storagePath = `${input.userId}/${crypto.randomUUID()}.${ext}`;
  await uploadOriginal(storagePath, input.file, source);

  phase("Запис…");
  const payload = {
    user_id: input.userId,
    title,
    source,
    original_filename: input.file.name,
    storage_path: storagePath,
    mime_type: input.file.type || null,
    size_bytes: input.file.size,
    extracted_text: text,
    text_hash: sourceHash,
    product_extraction_status: "full",
    product_extracted_chars: charCount,
    product_source_pages: pageCount,
    product_source_kind: source,
    product_extraction_at: new Date().toISOString(),
  };
  const res = await supabase
    .from("uploaded_contracts")
    .insert(payload as never)
    .select("id")
    .single();
  if (res.error) {
    // Чистим САМО обекта, който създадохме преди миг.
    try {
      await supabase.storage.from("user-contracts").remove([storagePath]);
    } catch {
      // Неуспешното чистене не бива да скрива истинската грешка.
    }
    // Само класификация — никакви имена на таблици, колони или кодове в UI.
    throw new ProductUploadError(productPersistErrorMessage(res.error));
  }

  return {
    uploadedContractId: (res.data as { id: string }).id,
    title,
    source,
    textLength: charCount,
    charUnit: PRODUCT_SOURCE_CHAR_UNIT,
    sourceHash,
    originalFilename: input.file.name,
    extractionStatus: "full",
    pageCount,
    preview: text.slice(0, 240),
  };

}

