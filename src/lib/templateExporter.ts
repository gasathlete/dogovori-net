import { jsPDF } from "jspdf";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { saveAs } from "file-saver";
import type { CompanionTemplate } from "@/data/companionTemplates";

const fileBase = (title: string) =>
  title
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60) || "Blanka";

export interface WatermarkOpts {
  watermark: true;
  userTag?: string;
}

function applyWatermark(doc: jsPDF, userTag?: string) {
  const pageCount = (doc as any).internal.getNumberOfPages?.() ?? doc.getNumberOfPages();
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const stamp = new Date().toISOString().slice(0, 19).replace("T", " ");
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const gState: any = (doc as any).GState ? new (doc as any).GState({ opacity: 0.18 }) : null;
    if (gState) (doc as any).setGState(gState);
    doc.setTextColor(180, 0, 0);
    doc.setFontSize(72);
    doc.text("ПРЕГЛЕД – не за подпис", pw / 2, ph / 2, { align: "center", angle: 35 });
    if (gState) {
      const reset: any = new (doc as any).GState({ opacity: 1 });
      (doc as any).setGState(reset);
    }
    doc.setTextColor(140, 140, 140);
    doc.setFontSize(7);
    doc.text(
      `Dogovori.net · преглед${userTag ? ` · ${userTag}` : ""} · ${stamp}`,
      pw / 2,
      ph - 16,
      { align: "center" },
    );
    doc.setTextColor(0, 0, 0);
  }
}

export async function exportTemplatePDF(t: CompanionTemplate, opts?: WatermarkOpts) {
  const fontUrl =
    "https://cdn.jsdelivr.net/npm/dejavu-sans@1.0.3/fonts/dejavu-sans.normal.ttf";
  const buffer = await fetch(fontUrl).then((r) => r.arrayBuffer());
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.addFileToVFS("DejaVuSans.ttf", b64);
  doc.addFont("DejaVuSans.ttf", "DejaVu", "normal");
  doc.setFont("DejaVu", "normal");

  const M = 56;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  let y = M;

  const write = (text: string, size: number, align: "left" | "center" = "left") => {
    doc.setFontSize(size);
    for (const para of text.split("\n")) {
      const lines = doc.splitTextToSize(para, pw - M * 2);
      for (const line of lines) {
        if (y > ph - M) {
          doc.addPage();
          y = M;
        }
        const x = align === "center" ? pw / 2 : M;
        doc.text(line, x, y, { align });
        y += size * 1.4;
      }
    }
  };

  write(t.title.toUpperCase(), 15, "center");
  y += 8;
  doc.setDrawColor(201, 168, 76);
  doc.setLineWidth(0.8);
  doc.line(M, y, pw - M, y);
  y += 14;

  if (t.intro) {
    write(t.intro, 11);
    y += 8;
  }
  for (const s of t.sections) {
    y += 6;
    if (s.heading) write(s.heading, 12);
    write(s.body, 11);
  }
  if (t.closing) {
    y += 16;
    doc.line(M, y, pw - M, y);
    y += 12;
    write(t.closing, 11);
  }

  if (opts?.watermark) applyWatermark(doc, opts.userTag);
  doc.save(`${fileBase(t.title)}.pdf`);
}

export async function exportTemplateDOCX(t: CompanionTemplate, opts?: WatermarkOpts) {
  const children: Paragraph[] = [];

  if (opts?.watermark) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "ПРЕГЛЕД – не за подпис", bold: true, color: "B00000", size: 36 }),
        ],
      }),
    );
    const stamp = new Date().toISOString().slice(0, 19).replace("T", " ");
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `Dogovori.net · преглед${opts.userTag ? ` · ${opts.userTag}` : ""} · ${stamp}`,
            color: "8C8C8C",
            size: 14,
          }),
        ],
      }),
    );
    children.push(new Paragraph({ text: "" }));
  }

  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: t.title.toUpperCase(), bold: true, size: 30 })],
    }),
  );
  children.push(new Paragraph({ text: "" }));

  if (t.intro) {
    for (const line of t.intro.split("\n")) {
      children.push(new Paragraph({ children: [new TextRun({ text: line, size: 22 })] }));
    }
    children.push(new Paragraph({ text: "" }));
  }

  for (const s of t.sections) {
    if (s.heading) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: s.heading, bold: true, size: 24 })],
        }),
      );
    }
    for (const line of s.body.split("\n")) {
      children.push(new Paragraph({ children: [new TextRun({ text: line, size: 22 })] }));
    }
    children.push(new Paragraph({ text: "" }));
  }

  if (t.closing) {
    children.push(new Paragraph({ text: "" }));
    for (const line of t.closing.split("\n")) {
      children.push(new Paragraph({ children: [new TextRun({ text: line, size: 22 })] }));
    }
  }

  const doc = new Document({
    creator: "Dogovori.net",
    title: t.title,
    sections: [{ children }],
  });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${fileBase(t.title)}.docx`);
}
