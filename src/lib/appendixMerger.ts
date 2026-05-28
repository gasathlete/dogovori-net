// Client-side merge of generated parent PDF with attached appendix files.
// Uses pdf-lib. For DOCX/image appendices we wrap them into a separator
// PDF page; binary DOCX merging is non-trivial so DOCX is skipped with a
// notice unless rendered as image.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";
import { listActiveChildren } from "@/lib/documentLinks";

async function downloadAppendixBytes(child: { child_saved_id: string | null; child_uploaded_id: string | null }): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (child.child_uploaded_id) {
    const { data: row } = await supabase
      .from("uploaded_contracts")
      .select("storage_path, mime_type")
      .eq("id", child.child_uploaded_id)
      .maybeSingle();
    if (!row) return null;
    const { data: file } = await supabase.storage.from("user-contracts").download(row.storage_path);
    if (!file) return null;
    const ab = await file.arrayBuffer();
    return { bytes: new Uint8Array(ab), mime: row.mime_type || "application/octet-stream" };
  }
  // saved_documents path: caller is responsible for generating its PDF separately.
  return null;
}

async function makeSeparatorPage(doc: PDFDocument, label: string, title?: string) {
  const page = doc.addPage();
  const { width, height } = page.getSize();
  const helv = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({ x: 0, y: height - 90, width, height: 90, color: rgb(0.05, 0.07, 0.13) });
  page.drawText(label, { x: 60, y: height - 55, size: 24, font: helv, color: rgb(0.83, 0.7, 0.36) });
  if (title) {
    page.drawText(title.slice(0, 80), { x: 60, y: height / 2, size: 14, font: helv, color: rgb(0.2, 0.2, 0.2) });
  }
}

export async function mergeParentWithAppendices(
  parentPdfBytes: Uint8Array,
  parentSavedId: string | null,
  parentUploadedId: string | null,
): Promise<{ bytes: Uint8Array; appended: number; skipped: number }> {
  const children = await listActiveChildren({
    saved_id: parentSavedId ?? undefined,
    uploaded_id: parentUploadedId ?? undefined,
  });
  if (children.length === 0) return { bytes: parentPdfBytes, appended: 0, skipped: 0 };

  const merged = await PDFDocument.load(parentPdfBytes);
  let appended = 0;
  let skipped = 0;

  for (const child of children) {
    try {
      const label = `${child.ref_label}${child.version > 1 ? ` (v${child.version})` : ""}`;
      const fetched = await downloadAppendixBytes(child);
      if (!fetched) { skipped++; continue; }

      await makeSeparatorPage(merged, label);

      if (fetched.mime === "application/pdf" || /\.pdf$/i.test(fetched.mime)) {
        const childPdf = await PDFDocument.load(fetched.bytes);
        const pages = await merged.copyPages(childPdf, childPdf.getPageIndices());
        pages.forEach((p) => merged.addPage(p));
        appended++;
      } else if (fetched.mime.startsWith("image/")) {
        const img = fetched.mime.includes("png")
          ? await merged.embedPng(fetched.bytes)
          : await merged.embedJpg(fetched.bytes);
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
        // DOCX or other — leave only the separator with a note.
        const note = merged.addPage();
        const helv = await merged.embedFont(StandardFonts.Helvetica);
        note.drawText("Прикачен файл (не PDF/изображение) — виж оригиналния файл в профила.", {
          x: 60, y: note.getSize().height / 2, size: 11, font: helv,
        });
        skipped++;
      }
    } catch (e) {
      console.error("appendix merge failed:", e);
      skipped++;
    }
  }

  const out = await merged.save();
  return { bytes: out, appended, skipped };
}
