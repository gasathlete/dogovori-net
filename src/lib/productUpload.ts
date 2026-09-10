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
import { PRODUCT_MIN_SOURCE_CHARS } from "@/lib/productSource";

export const MAX_PRODUCT_FILE_BYTES = 10 * 1024 * 1024;
export const MIN_PRODUCT_TEXT_LENGTH = PRODUCT_MIN_SOURCE_CHARS;

export interface PreparedProductDocument {
  readonly uploadedContractId: string;
  readonly title: string;
  readonly source: ExtractSource;
  readonly textLength: number;
  readonly sourceHash: string;
  readonly originalFilename: string | null;
  /** Винаги `full` — частичен източник не стига до тук. */
  readonly extractionStatus: "full";
  readonly pageCount: number | null;
}

export class ProductUploadError extends Error {}

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
        : `Грешка при качване: ${upload.error.message}`,
    );
  }
}

export interface PrepareProductDocumentInput {
  userId: string;
  title: string;
  /** Файл (PDF/DOCX) или поставен текст — точно едно от двете. */
  file?: File | null;
  pastedText?: string;
  onPhase?: (phase: string) => void;
}

/**
 * Подготвя документа за продукта: извлича текста, качва оригинала и записва
 * реда в `uploaded_contracts`. Връща id, дължина и хеш — истината, която
 * показваме на човека преди плащане.
 */
export async function prepareProductDocument(
  input: PrepareProductDocumentInput,
): Promise<PreparedProductDocument> {
  const title = input.title.trim();
  if (!title) throw new ProductUploadError("Добавете заглавие на документа.");
  const phase = input.onPhase ?? (() => {});

  let text = "";
  let source: ExtractSource = "paste";
  let storagePath: string | null = null;
  let originalName: string | null = null;
  let mime: string | null = null;
  let size: number | null = null;

  let pageCount: number | null = null;
  let sourceHash = "";

  if (input.file) {
    source = await validateProductFile(input.file);
    phase("Прочитаме документа…");
    // Продуктовият път чете целия документ и НЕ ползва OCR/операции.
    const extraction = await extractProductSource({ file: input.file }, phase);
    if (extraction.status !== "full") {
      throw new ProductUploadError(extraction.message ?? "Не можем да приемем този документ.");
    }
    text = extraction.text;
    pageCount = extraction.pageCount;
    sourceHash = extraction.sourceHash;
    phase("Качване на оригинала…");
    await ensureFreshSession();
    const ext = source === "pdf" ? "pdf" : "docx";
    const path = `${input.userId}/${crypto.randomUUID()}.${ext}`;
    await uploadOriginal(path, input.file, source);
    storagePath = path;
    originalName = input.file.name;
    mime = input.file.type || null;
    size = input.file.size;
  } else {
    const extraction = await extractProductSource({ pastedText: input.pastedText ?? "" });
    if (extraction.status !== "full") {
      throw new ProductUploadError(extraction.message ?? "Не можем да приемем този текст.");
    }
    text = extraction.text;
    sourceHash = extraction.sourceHash;
  }

  phase("Запис…");
  // Колоните за пълнотата идват с добавъчната миграция; типовете се
  // регенерират след прилагането ѝ.
  const payload = {
    user_id: input.userId,
    title,
    source,
    original_filename: originalName,
    storage_path: storagePath,
    mime_type: mime,
    size_bytes: size,
    extracted_text: text,
    text_hash: sourceHash,
    product_extraction_status: "full",
    product_extracted_chars: text.length,
    product_source_pages: pageCount,
    product_source_kind: source,
    product_extraction_at: new Date().toISOString(),
  };
  const res = await supabase
    .from("uploaded_contracts")
    .insert(payload as never)
    .select("id")
    .single();
  if (res.error) throw new ProductUploadError(res.error.message);

  return {
    uploadedContractId: (res.data as { id: string }).id,
    title,
    source,
    textLength: text.length,
    sourceHash,
    originalFilename: originalName,
    extractionStatus: "full",
    pageCount,
  };
}
