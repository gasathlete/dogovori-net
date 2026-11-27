// Browser-side text extraction from uploaded contract files.
// PDF -> pdfjs-dist (text layer) with OCR fallback via edge function for scanned PDFs.
// DOCX -> mammoth.

import { supabase } from "@/integrations/supabase/client";
import { invokeWithMarketingBonus } from "@/lib/marketingBonus";
import {
  clearDocumentOperation,
  documentOperationScope,
  documentOperationUserKey,
  getOrCreateDocumentOperationId,
} from "@/lib/documentOperationKey";
import { SCANNED_PDF_BLOCKED_MESSAGE } from "@/lib/privacyGate";

/** Локално огледало на преградата: сканирани изображения не се изпращат. */
const RAW_IMAGE_INGRESS_ALLOWED = false;

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
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer, isEvalSupported: false, enableXfa: false });
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
  // ПРЕГРАДА: сканираните страници НЕ се рендират и НЕ се изпращат. Снимката на
  // страница може да съдържа ЕГН/IBAN, а това не може да бъде проверено преди
  // изпращане. Спираме преди да е създадено каквото и да е изображение.
  if (!RAW_IMAGE_INGRESS_ALLOWED) {
    throw new Error(SCANNED_PDF_BLOCKED_MESSAGE);
  }
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

  const extraOps = Math.max(0, images.length - 3);
  const priceNote = extraOps > 0
    ? ` (първите 3 страници са включени, +${extraOps} доп. операции)`
    : " (включено в анализа)";
  onProgress?.(`OCR на ${images.length} страници${priceNote} — може да отнеме до минута...`);

  // Устойчив идентификатор на операцията: същият при двойно натискане, повторно
  // показване, презареждане, временна грешка и загубен отговор. В хранилището
  // влизат САМО отпечатъци — никакви изображения и никакъв текст.
  const { data: sessionData } = await supabase.auth.getSession();
  const uid = sessionData.session?.user?.id;
  if (!uid) {
    throw new Error("Влезте в профила си, за да продължите с разпознаването на сканирания документ.");
  }
  const pageDigests = await Promise.all(images.map((img) => sha256Hex(img)));
  const userKey = await documentOperationUserKey(uid);
  const scope = await documentOperationScope({
    purpose: "ocr_contract",
    userId: uid,
    resourceVersion: await sha256Hex(pageDigests.join("|")),
    options: { page_count: images.length, free_pages: 3 },
  });
  const operationId = getOrCreateDocumentOperationId("ocr_contract", userKey, scope);

  const { data, error } = await invokeWithMarketingBonus("ocr-contract", {
    body: { images, operation_id: operationId },
  });
  if (error) {
    const status = Number((error as { context?: { status?: number } })?.context?.status ?? 0);
    // Доказан конфликт/изтекъл резултат: само тогава ключът се освобождава.
    if (status === 409 || status === 410) {
      clearDocumentOperation("ocr_contract", userKey, scope);
    }
    console.error("ocr-contract invoke error:", error);
    throw new Error("OCR грешка: " + (error.message || "неуспешно разпознаване"));
  }
  clearDocumentOperation("ocr_contract", userKey, scope);
  const ocrText = ((data as any)?.text ?? "").toString().trim();
  if (ocrText.length < 80) {
    throw new Error("OCR не успя да извлече достатъчно текст. Опитайте по-ясно сканиране, Word файл или ръчно поставяне.");
  }
  return ocrText;
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
