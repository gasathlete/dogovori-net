import { jsPDF } from "jspdf";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { saveAs } from "file-saver";
import type { CompanionTemplate } from "@/data/companionTemplates";
import { applyPdfWatermark, buildDocxWatermarkHeader, type WatermarkOpts } from "./watermark";
import { loadCyrillicFontB64 } from "./pdfFont";

export type { WatermarkOpts };

const fileBase = (title: string) =>
  title
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60) || "Blanka";


export async function exportTemplatePDF(t: CompanionTemplate, opts?: WatermarkOpts) {
  const b64 = await loadCyrillicFontB64();

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.addFileToVFS("DejaVuSans.ttf", b64);
  doc.addFont("DejaVuSans.ttf", "DejaVu", "normal");
  doc.setFont("DejaVu", "normal");

  const M = 56;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  let y = M;

  const write = (text: string, size: number, align: "left" | "center" | "justify" = "left") => {
    doc.setFontSize(size);
    const maxWidth = pw - M * 2;
    for (const para of text.split("\n")) {
      const lines: string[] = doc.splitTextToSize(para, maxWidth);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (y > ph - M) {
          doc.addPage();
          y = M;
        }
        const isLast = i === lines.length - 1;
        if (align === "center") {
          doc.text(line, pw / 2, y, { align: "center" });
        } else if (align === "justify" && !isLast) {
          const words = line.split(/\s+/).filter(Boolean);
          if (words.length > 1) {
            const wordsW = words.reduce((s, w) => s + doc.getTextWidth(w), 0);
            const gap = (maxWidth - wordsW) / (words.length - 1);
            let x = M;
            for (let w = 0; w < words.length; w++) {
              doc.text(words[w], x, y);
              x += doc.getTextWidth(words[w]) + gap;
            }
          } else {
            doc.text(line, M, y);
          }
        } else {
          doc.text(line, M, y);
        }
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
    write(t.intro, 11, "justify");
    y += 8;
  }
  for (const s of t.sections) {
    y += 6;
    if (s.heading) write(s.heading, 12);
    write(s.body, 11, "justify");
  }
  if (t.closing) {
    y += 16;
    doc.line(M, y, pw - M, y);
    y += 12;
    write(t.closing, 11, "justify");
  }

  if (opts?.watermark) await applyPdfWatermark(doc, { userTag: opts.userTag });
  doc.save(`${fileBase(t.title)}.pdf`);
}

export async function exportTemplateDOCX(t: CompanionTemplate, opts?: WatermarkOpts) {
  const children: Paragraph[] = [];


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
      children.push(new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: line, size: 22 })],
      }));
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
      children.push(new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: line, size: 22 })],
      }));
    }
    children.push(new Paragraph({ text: "" }));
  }

  if (t.closing) {
    children.push(new Paragraph({ text: "" }));
    for (const line of t.closing.split("\n")) {
      children.push(new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: line, size: 22 })],
      }));
    }
  }

  const header = opts?.watermark ? await buildDocxWatermarkHeader() : undefined;
  const doc = new Document({
    creator: "Dogovori.net",
    title: t.title,
    sections: [{
      headers: header ? { default: header } : undefined,
      children,
    }],
  });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${fileBase(t.title)}.docx`);
}
