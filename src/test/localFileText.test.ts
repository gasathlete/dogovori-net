// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { vi } from "vitest";
import { pathToFileURL } from "node:url";
// Real parsers; only module resolution is adapted to Node: pdfjs worker URL and
// the browser build of mammoth (the one the app ships), which accepts arrayBuffer.
vi.mock("pdfjs-dist/legacy/build/pdf.worker.mjs?url", () => ({
  default: pathToFileURL(resolve(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")).href,
}));
vi.mock("mammoth", async () => {
  const m = await import("mammoth/mammoth.browser.js");
  return { default: (m as { default?: unknown }).default ?? m, ...(m as object) };
});
import { extractLocalFileText, truncationNotice } from "@/lib/localFileText";

const fx = (n: string, type: string) =>
  new File([readFileSync(resolve(__dirname, "fixtures", n))], n, { type });
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("локално извличане с истинския parser", () => {
  it("DOCX: mammoth връща текста", async () => {
    const r = await extractLocalFileText(fx("minimal.docx", DOCX), { maxChars: 60000 });
    expect(r.text).toContain("Договор за услуга.");
    expect(r.truncated).toBe(false);
  });
  it("PDF: pdfjs връща текстовия слой", async () => {
    const r = await extractLocalFileText(fx("minimal.pdf", "application/pdf"), { maxChars: 60000 });
    expect(r.text).toContain("Догов");
  });
  it("над лимита: видимо съкращаване с точни бройки", async () => {
    const r = await extractLocalFileText(fx("minimal.docx", DOCX), { maxChars: 100 });
    expect(r.truncated).toBe(true);
    expect(Array.from(r.text)).toHaveLength(100);
    expect(truncationNotice(r, 100)).toContain(`${r.totalChars}`);
  });
  it("отказва друг тип файл", async () => {
    await expect(extractLocalFileText(new File(["hello"], "a.txt", { type: "text/plain" }), { maxChars: 10 })).rejects.toThrow(/PDF или Word/);
  });
});
