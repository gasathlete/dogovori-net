/**
 * Local PDF/DOCX text extraction. The original file never leaves the device:
 * it is validated (magic bytes + MIME + size), parsed in the browser, and only
 * the resulting text is returned for the person to review and submit through
 * the existing text intake. Scanned PDFs are rejected by extractTextFromFile.
 */
import { extractTextFromFile } from "@/lib/extractContractText";

export const LOCAL_FILE_MAX_BYTES = 10 * 1024 * 1024;

export interface LocalFileText {
  /** Text actually placed in the text field (≤ maxChars code points). */
  text: string;
  /** Code points of the full extracted text. */
  totalChars: number;
  truncated: boolean;
}

export class LocalFileTextError extends Error {}

const cp = (s: string) => Array.from(s).length;

export async function extractLocalFileText(
  file: File,
  opts: { maxChars: number; minChars?: number; onPhase?: (p: string) => void },
): Promise<LocalFileText> {
  const { validateUploadedFile, detectFileKind } = await import("@/lib/fileValidation");
  const kind = detectFileKind(file);
  if (kind !== "pdf" && kind !== "docx") throw new LocalFileTextError("Поддържаме само PDF или Word (.docx) файлове.");
  const v = await validateUploadedFile(file, kind, LOCAL_FILE_MAX_BYTES);
  if (!v.ok) throw new LocalFileTextError(v.error ?? "Невалиден файл.");
  const full = (await extractTextFromFile(file, kind, opts.onPhase)).trim();
  const totalChars = cp(full);
  if (totalChars < (opts.minChars ?? 80)) {
    throw new LocalFileTextError("Не успяхме да извлечем достатъчно текст от файла. Поставете текста ръчно.");
  }
  if (totalChars <= opts.maxChars) return { text: full, totalChars, truncated: false };
  return { text: Array.from(full).slice(0, opts.maxChars).join(""), totalChars, truncated: true };
}

export function truncationNotice(r: LocalFileText, maxChars: number): string | null {
  if (!r.truncated) return null;
  return `Файлът съдържа ${r.totalChars.toLocaleString("bg-BG")} знака. В полето са първите ${maxChars.toLocaleString("bg-BG")} — само те ще бъдат обработени.`;
}
