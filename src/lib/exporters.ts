import { jsPDF } from "jspdf";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";
import { saveAs } from "file-saver";

export interface GeneratedContract {
  title: string;
  preamble: string;
  clauses: { number: string; title: string; body: string }[];
  closing: string;
}

const fileBase = (title: string) =>
  title
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60) || "Dogovor";

export async function exportPDF(c: GeneratedContract) {
  // Fetch a Cyrillic-capable font (DejaVu Sans) so Bulgarian renders properly.
  const fontUrl =
    "https://cdn.jsdelivr.net/npm/dejavu-sans@1.0.3/fonts/dejavu-sans.normal.ttf";
  const buffer = await fetch(fontUrl).then((r) => r.arrayBuffer());
  // base64
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

  const writeWrapped = (text: string, size: number, opts: { bold?: boolean; align?: "left" | "center" } = {}) => {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, pw - M * 2);
    for (const line of lines) {
      if (y > ph - M) {
        doc.addPage();
        y = M;
      }
      const x = opts.align === "center" ? pw / 2 : M;
      doc.text(line, x, y, { align: opts.align ?? "left" });
      y += size * 1.4;
    }
  };

  writeWrapped(c.title.toUpperCase(), 16, { align: "center" });
  y += 12;
  doc.setDrawColor(201, 168, 76);
  doc.setLineWidth(0.8);
  doc.line(M, y, pw - M, y);
  y += 18;

  writeWrapped(c.preamble, 11);
  y += 10;

  for (const cl of c.clauses) {
    y += 8;
    writeWrapped(`${cl.number} ${cl.title.toUpperCase()}`, 12);
    y += 4;
    writeWrapped(cl.body, 11);
  }

  y += 14;
  doc.line(M, y, pw - M, y);
  y += 14;
  writeWrapped(c.closing, 11);
  y += 40;

  if (y > ph - M - 60) {
    doc.addPage();
    y = M;
  }
  const colW = (pw - M * 2) / 2;
  doc.line(M, y, M + colW - 20, y);
  doc.line(M + colW + 20, y, pw - M, y);
  y += 14;
  writeWrapped("Подпис на Страна А", 10);

  doc.save(`${fileBase(c.title)}.pdf`);
}

export async function exportDOCX(c: GeneratedContract) {
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: c.title.toUpperCase(), bold: true, size: 32 })],
    })
  );
  children.push(new Paragraph({ text: "" }));

  for (const line of c.preamble.split("\n")) {
    children.push(new Paragraph({ children: [new TextRun({ text: line, size: 22 })] }));
  }

  for (const cl of c.clauses) {
    children.push(new Paragraph({ text: "" }));
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [
          new TextRun({
            text: `${cl.number} ${cl.title.toUpperCase()}`,
            bold: true,
            size: 26,
          }),
        ],
      })
    );
    for (const line of cl.body.split("\n")) {
      children.push(new Paragraph({ children: [new TextRun({ text: line, size: 22 })] }));
    }
  }

  children.push(new Paragraph({ text: "" }));
  children.push(
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      children: [new TextRun({ text: c.closing, italics: true, size: 22 })],
    })
  );
  children.push(new Paragraph({ text: "" }));
  children.push(new Paragraph({ text: "" }));
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Страна А: __________________________            ", size: 22 }),
        new TextRun({ text: "Страна Б: __________________________", size: 22 }),
      ],
    })
  );

  const doc = new Document({
    creator: "Dogovori.net",
    title: c.title,
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${fileBase(c.title)}.docx`);
}
