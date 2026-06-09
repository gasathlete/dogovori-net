// Файлова валидация: MIME whitelist + magic-bytes проверка.
// Защитава от качване на изпълними файлове, маскирани с .pdf/.docx разширение.

export type AllowedFileKind = "pdf" | "docx";

const MAGIC_PDF = [0x25, 0x50, 0x44, 0x46]; // %PDF
const MAGIC_ZIP = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04 (DOCX = ZIP)
const MAGIC_ZIP_EMPTY = [0x50, 0x4b, 0x05, 0x06];
const MAGIC_ZIP_SPANNED = [0x50, 0x4b, 0x07, 0x08];

const ALLOWED_MIME: Record<AllowedFileKind, string[]> = {
  pdf: ["application/pdf"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream", // някои браузъри не разпознават DOCX правилно
    "application/zip",
  ],
};

export interface FileValidationResult {
  ok: boolean;
  error?: string;
}

function matchMagic(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (bytes[i] !== signature[i]) return false;
  }
  return true;
}

/**
 * Проверява MIME type, разширението и magic bytes на файла.
 * Връща детайлно съобщение за грешка ако не съвпада.
 */
export async function validateUploadedFile(
  file: File,
  kind: AllowedFileKind,
  maxBytes = 10 * 1024 * 1024,
): Promise<FileValidationResult> {
  if (file.size === 0) {
    return { ok: false, error: "Файлът е празен." };
  }
  if (file.size > maxBytes) {
    return { ok: false, error: `Файлът е твърде голям (макс. ${Math.round(maxBytes / 1024 / 1024)} MB).` };
  }

  // MIME проверка (приемаме празно за DOCX поради браузърски несъответствия)
  const allowedMimes = ALLOWED_MIME[kind];
  if (file.type && !allowedMimes.includes(file.type)) {
    return { ok: false, error: `Невалиден тип файл. Очаквахме ${kind.toUpperCase()}.` };
  }

  // Разширение
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (ext !== kind) {
    return { ok: false, error: `Файлът трябва да е с разширение .${kind}.` };
  }

  // Magic bytes — четем първите 8 байта
  const headerBuf = await file.slice(0, 8).arrayBuffer();
  const header = new Uint8Array(headerBuf);

  if (kind === "pdf") {
    if (!matchMagic(header, MAGIC_PDF)) {
      return { ok: false, error: "Файлът не е валиден PDF (повредени или маскирани байтове)." };
    }
  } else if (kind === "docx") {
    const isZip =
      matchMagic(header, MAGIC_ZIP) ||
      matchMagic(header, MAGIC_ZIP_EMPTY) ||
      matchMagic(header, MAGIC_ZIP_SPANNED);
    if (!isZip) {
      return { ok: false, error: "Файлът не е валиден DOCX (липсва ZIP сигнатура)." };
    }
  }

  return { ok: true };
}

/** Detect kind from File. */
export function detectFileKind(file: File): AllowedFileKind | null {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  return null;
}
