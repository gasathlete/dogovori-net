import { useEffect } from "react";
import { prefetchCyrillicFont } from "@/lib/pdfFont";

/**
 * Warm the PDF/DOCX export chunks and the embedded Cyrillic font during
 * idle time, so the first click on "Download" feels instant. Safe to call
 * from any preview / finalize screen — the imports are deduplicated by
 * the browser and the font is cached in IndexedDB across sessions.
 */
export function usePrefetchExporters(opts: { pdf?: boolean; docx?: boolean; template?: boolean } = {}) {
  const { pdf = true, docx = true, template = false } = opts;
  useEffect(() => {
    const run = () => {
      if (pdf) {
        void import("@/lib/exporters.pdf").catch(() => null);
        prefetchCyrillicFont();
      }
      if (docx) {
        void import("@/lib/exporters.docx").catch(() => null);
      }
      if (template) {
        void import("@/lib/templateExporter").catch(() => null);
        prefetchCyrillicFont();
      }
    };
    const w = globalThis as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number };
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(run, { timeout: 2500 });
      return () => {
        const cancel = (globalThis as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
        if (typeof cancel === "function") cancel(id);
      };
    }
    const id = setTimeout(run, 400);
    return () => clearTimeout(id);
  }, [pdf, docx, template]);
}
