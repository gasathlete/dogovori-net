// Build a single merged PDF for a user kit. Walks kit items in order:
//   - uploaded_id  → fetch file from `user-contracts` storage; PDF → append, image → embed, other → separator with note
//   - saved_id     → load `saved_documents.payload`, render via exportPDF, append
//   - planned only → separator page "Очаква попълване"
// Returns Uint8Array of the merged PDF.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";
import { getKitWithItems, type UserKitItem, type UserKitWithItems } from "@/lib/kits";
import type { GeneratedContract } from "@/lib/exporterTypes";

async function coverPage(doc: PDFDocument, kit: UserKitWithItems) {
  const page = doc.addPage();
  const { width, height } = page.getSize();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({ x: 0, y: height - 110, width, height: 110, color: rgb(0.05, 0.07, 0.13) });
  page.drawText("KIT / КОМПЛЕКТ", { x: 60, y: height - 50, size: 12, font: bold, color: rgb(0.83, 0.7, 0.36) });
  page.drawText(kit.title.slice(0, 80), { x: 60, y: height - 80, size: 20, font: bold, color: rgb(1, 1, 1) });

  let y = height - 160;
  page.drawText("Съдържание:", { x: 60, y, size: 13, font: bold, color: rgb(0.1, 0.1, 0.1) });
  y -= 24;
  kit.items.forEach((it, idx) => {
    if (y < 80) return;
    const status = it.saved_id || it.uploaded_id ? "✓" : "•";
    const label = `${status}  ${idx + 1}. ${(it.planned_doc_name || it.ref_label).slice(0, 70)}  (${it.role})`;
    page.drawText(label, { x: 60, y, size: 11, font: reg, color: rgb(0.15, 0.15, 0.15) });
    y -= 18;
  });
}

async function separatorPage(doc: PDFDocument, label: string, sub?: string) {
  const page = doc.addPage();
  const { width, height } = page.getSize();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({ x: 0, y: height - 90, width, height: 90, color: rgb(0.05, 0.07, 0.13) });
  page.drawText(label.slice(0, 80), { x: 60, y: height - 55, size: 20, font: bold, color: rgb(0.83, 0.7, 0.36) });
  if (sub) {
    page.drawText(sub.slice(0, 100), { x: 60, y: height / 2, size: 12, font: reg, color: rgb(0.3, 0.3, 0.3) });
  }
}

async function fetchUploaded(uploadedId: string): Promise<{ bytes: Uint8Array; mime: string; name: string } | null> {
  const { data: row } = await supabase
    .from("uploaded_contracts")
    .select("storage_path, mime_type, original_filename, title")
    .eq("id", uploadedId)
    .maybeSingle();
  if (!row?.storage_path) return null;
  const { data: file } = await supabase.storage.from("user-contracts").download(row.storage_path);
  if (!file) return null;
  const ab = await file.arrayBuffer();
  return {
    bytes: new Uint8Array(ab),
    mime: row.mime_type || "application/octet-stream",
    name: row.title || row.original_filename || "файл",
  };
}

async function fetchSaved(savedId: string): Promise<{ payload: GeneratedContract; title: string } | null> {
  const { data: row } = await supabase
    .from("saved_documents")
    .select("payload, title")
    .eq("id", savedId)
    .maybeSingle();
  if (!row?.payload) return null;
  return { payload: row.payload as unknown as GeneratedContract, title: row.title || "Документ" };
}

async function appendPdfBytes(merged: PDFDocument, bytes: Uint8Array) {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = await merged.copyPages(src, src.getPageIndices());
  pages.forEach((p) => merged.addPage(p));
}

export interface KitExportResult {
  bytes: Uint8Array;
  appended: number;
  skipped: number;
  total: number;
}

export async function exportKitMergedPdf(kitId: string): Promise<KitExportResult> {
  const kit = await getKitWithItems(kitId);
  if (!kit) throw new Error("kit_not_found");

  const merged = await PDFDocument.create();
  await coverPage(merged, kit);

  let appended = 0;
  let skipped = 0;
  const ordered: UserKitItem[] = [...kit.items].sort((a, b) => a.position - b.position);

  // Lazy-load PDF exporter only if we have saved_documents to render.
  let exportPDF: ((c: GeneratedContract, opts?: { returnBytes?: boolean }) => Promise<Uint8Array | void>) | null = null;
  const needsExporter = ordered.some((i) => i.saved_id);
  if (needsExporter) {
    const mod = await import("@/lib/exporters.pdf");
    exportPDF = mod.exportPDF;
  }

  for (const item of ordered) {
    const label = `${item.role.toUpperCase()} · ${item.planned_doc_name || item.ref_label}`;
    try {
      if (item.uploaded_id) {
        const got = await fetchUploaded(item.uploaded_id);
        if (!got) { await separatorPage(merged, label, "Файлът не е достъпен"); skipped++; continue; }
        await separatorPage(merged, label, got.name);
        if (got.mime === "application/pdf" || /pdf$/i.test(got.mime)) {
          await appendPdfBytes(merged, got.bytes);
          appended++;
        } else if (got.mime.startsWith("image/")) {
          const img = got.mime.includes("png") ? await merged.embedPng(got.bytes) : await merged.embedJpg(got.bytes);
          const page = merged.addPage();
          const { width, height } = page.getSize();
          const scale = Math.min((width - 80) / img.width, (height - 120) / img.height, 1);
          page.drawImage(img, {
            x: (width - img.width * scale) / 2,
            y: (height - img.height * scale) / 2,
            width: img.width * scale,
            height: img.height * scale,
          });
          appended++;
        } else {
          await separatorPage(merged, label, "Файлът не е PDF/изображение — отворете оригинала от профила.");
          skipped++;
        }
      } else if (item.saved_id && exportPDF) {
        const got = await fetchSaved(item.saved_id);
        if (!got) { await separatorPage(merged, label, "Документът не е достъпен"); skipped++; continue; }
        await separatorPage(merged, label, got.title);
        const bytes = await exportPDF(got.payload, { returnBytes: true });
        if (bytes instanceof Uint8Array) {
          await appendPdfBytes(merged, bytes);
          appended++;
        } else {
          skipped++;
        }
      } else {
        await separatorPage(merged, label, "Очаква попълване");
        skipped++;
      }
    } catch (e) {
      console.error("kit item merge failed:", e);
      await separatorPage(merged, label, "Грешка при обработка");
      skipped++;
    }
  }

  const bytes = await merged.save();
  return { bytes, appended, skipped, total: ordered.length };
}

export function triggerPdfDownload(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
