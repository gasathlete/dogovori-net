import type { jsPDF } from "jspdf";
import { Header, Paragraph, TextRun, ImageRun, AlignmentType, type IImageOptions } from "docx";
const logoUrl = "/brand-mark.svg";

export interface WatermarkOpts {
  watermark: true;
  userTag?: string;
}

let cachedPngDataUrl: string | null = null;
let cachedPngBytes: Uint8Array | null = null;

/**
 * Loads the brand logo and converts it (webp → PNG dataURL) once.
 * jsPDF + docx ImageRun both need PNG/JPEG; webp is not supported.
 */
async function loadLogoPng(): Promise<{ dataUrl: string; bytes: Uint8Array }> {
  if (cachedPngDataUrl && cachedPngBytes) {
    return { dataUrl: cachedPngDataUrl, bytes: cachedPngBytes };
  }
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = logoUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("logo load failed"));
  });
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  // Preserve aspect ratio, centered
  const scale = Math.min(size / img.width, size / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1] || "";
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  cachedPngDataUrl = dataUrl;
  cachedPngBytes = bytes;
  return { dataUrl, bytes };
}

/**
 * Brand watermark — intentionally disabled.
 * Downloaded documents (contracts and templates) should look clean for all
 * users, with no "безплатна версия" wording or page-center watermark.
 * Kept as a no-op so existing callers continue to compile.
 */
export async function applyPdfWatermark(_doc: jsPDF, _opts?: { userTag?: string }) {
  // no-op
}

/**
 * Returns `undefined` so docx exporters skip attaching a watermark header.
 * Callers already guard with `opts?.watermark ? await buildDocxWatermarkHeader() : undefined`.
 */
export async function buildDocxWatermarkHeader(): Promise<Header | undefined> {
  return undefined;
}

