// Browser-side text extraction from uploaded contract files.
// PDF -> pdfjs-dist, DOCX -> mammoth.

export type ExtractSource = "pdf" | "docx" | "paste";

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
  // pdfjs-dist v5 ships ESM build; we set worker to the bundled module worker.
  const pdfjs: any = await import("pdfjs-dist");
  // @ts-ignore - worker URL import
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const parts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it: any) => ("str" in it ? it.str : "")).join(" ");
    parts.push(text);
    if (parts.join(" ").length > 60000) break; // sanity cap
  }
  return parts.join("\n\n").replace(/[ \t]+/g, " ").trim();
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
