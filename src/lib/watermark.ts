import type { jsPDF } from "jspdf";
import { Header, Paragraph, TextRun, ImageRun, AlignmentType, type IImageOptions } from "docx";
import logoUrl from "@/assets/logo-dogovori.webp";

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
 * Applies a discrete brand watermark (logo + "dogovori.net" wordmark) to every
 * page of a jsPDF document. Low opacity (~8%) so it does not impair readability
 * but is visible enough to indicate the source.
 */
export async function applyPdfWatermark(doc: jsPDF, _opts?: { userTag?: string }) {
  let logo: { dataUrl: string } | null = null;
  try {
    logo = await loadLogoPng();
  } catch {
    // Continue without logo if asset fails to load – text watermark still applied.
  }

  const pageCount = (doc as any).internal.getNumberOfPages?.() ?? doc.getNumberOfPages();
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    const gState: any = (doc as any).GState ? new (doc as any).GState({ opacity: 0.08 }) : null;
    if (gState) (doc as any).setGState(gState);

    // Central logo
    const logoSize = 180;
    if (logo?.dataUrl) {
      try {
        doc.addImage(
          logo.dataUrl,
          "PNG",
          (pw - logoSize) / 2,
          (ph - logoSize) / 2 - 30,
          logoSize,
          logoSize,
        );
      } catch {
        // ignore image failure
      }
    }

    // Wordmark under logo
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(28);
    doc.text("dogovori.net", pw / 2, ph / 2 + logoSize / 2, {
      align: "center",
      angle: 0,
    });

    // Reset opacity
    if (gState) {
      const reset: any = new (doc as any).GState({ opacity: 1 });
      (doc as any).setGState(reset);
    }

    // Subtle footer trace
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(7);
    doc.text("dogovori.net · безплатна версия", pw / 2, ph - 18, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }
}

/**
 * Returns a DOCX header that contains the discrete watermark logo + wordmark.
 * Word renders the header on every page automatically.
 */
export async function buildDocxWatermarkHeader(): Promise<Header> {
  let imageRun: ImageRun | null = null;
  try {
    const { bytes } = await loadLogoPng();
    // floating image positioned centered on page, behind text, low contrast.
    imageRun = new ImageRun({
      type: "png",
      data: bytes,
      transformation: { width: 220, height: 220 },
      floating: {
        horizontalPosition: {
          relative: "page" as any,
          align: "center" as any,
        },
        verticalPosition: {
          relative: "page" as any,
          align: "center" as any,
        },
        behindDocument: true,
        allowOverlap: true,
      },
    } as unknown as IImageOptions);
  } catch {
    imageRun = null;
  }

  const children: Paragraph[] = [];
  if (imageRun) {
    children.push(new Paragraph({ children: [imageRun] }));
  }
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: "dogovori.net · безплатна версия",
          color: "B0B0B0",
          size: 14,
        }),
      ],
    }),
  );

  return new Header({ children });
}
