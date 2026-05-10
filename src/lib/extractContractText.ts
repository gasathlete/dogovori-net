// Browser-side text extraction from uploaded contract files.
// PDF -> pdfjs-dist, DOCX -> mammoth.

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

export async function extractTextFromFile(file: File, source: ExtractSource): Promise<string> {
  if (source === "pdf") return extractPdf(file);
  if (source === "docx") return extractDocx(file);
  return await file.text();
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return (result.value || "").trim();
}

async function extractPdf(file: File): Promise<string> {
  ensurePdfJsSafariCompat();

  // Use legacy build for broader browser compatibility (older iOS Safari etc.)
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // @ts-ignore - worker URL import
  const workerSrc = (await import("pdfjs-dist/legacy/build/pdf.worker.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    const parts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((it: any) => ("str" in it ? it.str : "")).join(" ");
      parts.push(text);
      if (parts.join(" ").length > 60000) break;
    }
    return parts.join("\n\n").replace(/[ \t]+/g, " ").trim();
  } catch (e) {
    console.error("PDF extraction failed:", e);
    throw new Error("Не успяхме да прочетем PDF на това устройство. Опитайте Word (.docx) файл или поставете текста ръчно.");
  }
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
