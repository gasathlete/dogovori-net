// Browser-side text extraction from uploaded contract files.
// PDF -> pdfjs-dist (text layer) with OCR fallback via edge function for scanned PDFs.
// DOCX -> mammoth.

import { supabase } from "@/integrations/supabase/client";

export type ExtractSource = "pdf" | "docx" | "paste";

function ensurePdfJsSafariCompat() {
  const asyncIterator = Symbol.asyncIterator;
  const ReadableStreamCtor = globalThis.ReadableStream as
    | ({ prototype?: Record<PropertyKey, unknown> } & typeof ReadableStream)
    | undefined;

  if (ReadableStreamCtor?.prototype && !(asyncIterator in ReadableStreamCtor.prototype)) {
    Object.defineProperty(ReadableStreamCtor.prototype, asyncIterator, {
      configurable: true,
      writable: true,
      value: async function* (this: ReadableStream<Uint8Array>) {
        const reader = this.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) return;
            yield value;
          }
        } finally {
          reader.releaseLock();
        }
      },
    });
  }
}

export type ExtractProgress = (phase: string) => void;

export async function extractTextFromFile(
  file: File,
  source: ExtractSource,
  onProgress?: ExtractProgress,
): Promise<string> {
  if (source === "pdf") return extractPdf(file, onProgress);
  if (source === "docx") return extractDocx(file);
  return await file.text();
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return (result.value || "").trim();
}

// Minimum characters of text-layer content per page below which we treat the PDF
// as scanned and trigger OCR fallback.
const MIN_TEXT_PER_PAGE = 40;
const MIN_TOTAL_TEXT = 200;

async function extractPdf(file: File, onProgress?: ExtractProgress): Promise<string> {
  ensurePdfJsSafariCompat();

  // Use legacy build for broader browser compatibility (older iOS Safari etc.)
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // @ts-ignore - worker URL import
  const workerSrc = (await import("pdfjs-dist/legacy/build/pdf.worker.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  let pdf: any;
  try {
    onProgress?.("Отваряне на PDF...");
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    pdf = await loadingTask.promise;
  } catch (e) {
    console.error("PDF load failed:", e);
    throw new Error("Не успяхме да отворим PDF на това устройство. Опитайте Word (.docx) или поставете текста ръчно.");
  }

  const totalPages = pdf.numPages as number;
  const parts: string[] = [];
  let extractionFailed = false;

  try {
    for (let i = 1; i <= totalPages; i++) {
      onProgress?.(`Извличане на текст ${i}/${totalPages}...`);
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((it: any) => ("str" in it ? it.str : "")).join(" ");
      parts.push(text);
      if (parts.join(" ").length > 60000) break;
    }
  } catch (e) {
    console.warn("PDF text-layer extraction failed, will try OCR:", e);
    extractionFailed = true;
  }

  const cleanText = parts.join("\n\n").replace(/[ \t]+/g, " ").trim();

  // Cyrillic-ratio heuristic: Bulgarian contracts must contain mostly Cyrillic.
  // Some PDFs have a broken text layer (CID-mapped glyphs) that produces long
  // garbage strings of Latin letters — long enough to pass length thresholds
  // but unusable. If <30% of the letters are Cyrillic, treat as garbled.
  const letters = cleanText.match(/\p{L}/gu) ?? [];
  const cyrillic = cleanText.match(/[\u0400-\u04FF]/g) ?? [];
  const cyrillicRatio = letters.length > 0 ? cyrillic.length / letters.length : 0;
  const looksGarbled = letters.length > 200 && cyrillicRatio < 0.3;

  const looksScanned =
    extractionFailed ||
    cleanText.length < MIN_TOTAL_TEXT ||
    (totalPages > 0 && cleanText.length / totalPages < MIN_TEXT_PER_PAGE) ||
    looksGarbled;

  if (looksGarbled) {
    console.warn(`PDF text layer looks garbled (Cyrillic ratio ${(cyrillicRatio * 100).toFixed(1)}%), falling back to OCR.`);
  }

  if (!looksScanned) return cleanText;

  // ---------- OCR fallback ----------
  // Render each page to a JPEG data URL and send to edge function for AI OCR.
  onProgress?.("PDF изглежда сканиран — стартирам OCR...");

  const maxOcrPages = Math.min(totalPages, 12);
  const images: string[] = [];

  for (let i = 1; i <= maxOcrPages; i++) {
    onProgress?.(`Подготовка на страница ${i}/${maxOcrPages} за OCR...`);
    try {
      const page = await pdf.getPage(i);
      // Aim for ~2000px on the long edge — needed for legible OCR of small/noisy
      // Cyrillic text. Lower-resolution renders cause the model to hallucinate.
      const baseViewport = page.getViewport({ scale: 1 });
      const targetLong = 2000;
      const scale = Math.min(3, targetLong / Math.max(baseViewport.width, baseViewport.height));
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D context недостъпен");

      // Paint white background — some PDFs have transparent canvas which can
      // leave the rendered image effectively blank for OCR.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport }).promise;
      // PNG (lossless) keeps small Cyrillic glyphs sharp.
      const dataUrl = canvas.toDataURL("image/png");
      images.push(dataUrl);

      // Free memory.
      canvas.width = 0;
      canvas.height = 0;
    } catch (e) {
      console.warn(`Render page ${i} failed:`, e);
    }
  }

  if (!images.length) {
    throw new Error("Не успяхме да рендираме PDF страниците за OCR. Опитайте Word файл или поставете текста ръчно.");
  }

  onProgress?.(`OCR на ${images.length} страници (може да отнеме до минута)...`);

  const { data, error } = await supabase.functions.invoke("ocr-contract", {
    body: { images },
  });
  if (error) {
    console.error("ocr-contract invoke error:", error);
    throw new Error("OCR грешка: " + (error.message || "неуспешно разпознаване"));
  }
  const ocrText = ((data as any)?.text ?? "").toString().trim();
  const unreadable = Number((data as any)?.unreadablePages ?? 0);
  const totalOcr = Number((data as any)?.pages ?? images.length);
  if (ocrText.length < 80) {
    if (unreadable >= totalOcr) {
      throw new Error(
        `OCR не успя да разчете нито една от ${totalOcr} страници — сканът е твърде размазан или с нисък контраст. Опитайте по-ясно сканиране (300+ DPI), Word файл или поставете текста ръчно.`,
      );
    }
    throw new Error(
      `OCR извлече твърде малко текст (${ocrText.length} знака от ${totalOcr - unreadable}/${totalOcr} страници). Опитайте по-ясно сканиране, Word файл или ръчно поставяне.`,
    );
  }
  return ocrText;
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
