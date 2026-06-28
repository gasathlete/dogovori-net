// Bulk download multiple saved contracts as a single ZIP file.
// Pro feature — caller must gate with isPro.
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import type { GeneratedContract } from "@/lib/exporterTypes";
import type { CompanionTemplate } from "@/data/companionTemplates";
import { fileBase } from "@/lib/exporterTypes";

export type BulkFormat = "pdf" | "docx";

export interface BulkDownloadItem {
  id: string;
  title: string;
  kind: "contract" | "template";
  payload: GeneratedContract | CompanionTemplate;
}

export interface BulkDownloadResult {
  ok: boolean;
  zipped: number;
  failed: number;
  error?: string;
}

export interface BulkDownloadOptions {
  items: BulkDownloadItem[];
  format: BulkFormat;
  zipName?: string;
  onProgress?: (done: number, total: number) => void;
}

export async function bulkDownloadAsZip(opts: BulkDownloadOptions): Promise<BulkDownloadResult> {
  const { items, format, onProgress } = opts;
  if (!items.length) return { ok: false, zipped: 0, failed: 0, error: "no_items" };

  // Auth required
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, zipped: 0, failed: 0, error: "auth_required" };

  const zip = new JSZip();

  // Lazy-load exporters
  const [contractMod, templateMod] = await Promise.all([
    format === "pdf" ? import("@/lib/exporters.pdf") : import("@/lib/exporters.docx"),
    import("@/lib/templateExporter"),
  ]);

  const used = new Set<string>();
  let zipped = 0;
  let failed = 0;
  let i = 0;
  for (const item of items) {
    try {
      let blob: Blob | null = null;
      if (item.kind === "contract") {
        if (format === "pdf") {
          const bytes = await (contractMod as typeof import("@/lib/exporters.pdf")).exportPDF(
            item.payload as GeneratedContract,
            { returnBytes: true },
          );
          if (bytes instanceof Uint8Array) {
            blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
          }
        } else {
          const b = await (contractMod as typeof import("@/lib/exporters.docx")).exportDOCX(
            item.payload as GeneratedContract,
            { returnBlob: true } as any,
          );
          if (b instanceof Blob) blob = b;
        }
      } else {
        const t = item.payload as CompanionTemplate;
        if (format === "pdf") {
          const bytes = await templateMod.exportTemplatePDF(t, { returnBytes: true } as any);
          if (bytes instanceof Uint8Array) {
            blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
          }
        } else {
          const b = await templateMod.exportTemplateDOCX(t, { returnBlob: true } as any);
          if (b instanceof Blob) blob = b;
        }
      }
      if (!blob) {
        failed++;
        continue;
      }
      // Avoid filename collisions
      let base = fileBase(item.title) || `Документ_${i + 1}`;
      let name = `${base}.${format}`;
      let n = 2;
      while (used.has(name)) {
        name = `${base}_${n}.${format}`;
        n++;
      }
      used.add(name);
      zip.file(name, blob);
      zipped++;
    } catch (e) {
      console.error("bulk zip item failed:", item.id, e);
      failed++;
    } finally {
      i++;
      onProgress?.(i, items.length);
    }
  }

  if (zipped === 0) return { ok: false, zipped, failed, error: "no_files_generated" };

  const out = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const url = URL.createObjectURL(out);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${opts.zipName || "Документи_DogovoryAI"}_${stamp}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);

  return { ok: true, zipped, failed };
}
