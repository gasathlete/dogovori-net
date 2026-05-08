import { jsPDF } from "jspdf";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  ImageRun,
} from "docx";
import { saveAs } from "file-saver";

const dataUrlToUint8 = (dataUrl: string): Uint8Array => {
  const base64 = dataUrl.split(",")[1] || "";
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
};

export interface SignatureInfo {
  name_a: string;
  name_b: string;
  city: string;
  date: string;
  image_a?: string; // data URL (PNG)
  image_b?: string;
}

export interface GeneratedContract {
  title: string;
  preamble: string;
  clauses: { number: string; title: string; body: string }[];
  closing: string;
  signature?: SignatureInfo;
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

  // Signature footer
  y += 14;
  const sig = c.signature;
  if (sig?.city || sig?.date) {
    writeWrapped(`гр. ${sig?.city || "_____"}, ${sig?.date || "_____"}`, 10);
    y += 6;
  }
  if (y > ph - M - 100) { doc.addPage(); y = M; }

  const colW = (pw - M * 2) / 2;
  const sigImgH = 50;
  // Embed signature images if provided
  if (sig?.image_a) {
    try { doc.addImage(sig.image_a, "PNG", M, y, colW - 30, sigImgH); } catch {}
  }
  if (sig?.image_b) {
    try { doc.addImage(sig.image_b, "PNG", M + colW + 20, y, colW - 30, sigImgH); } catch {}
  }
  y += sig?.image_a || sig?.image_b ? sigImgH + 4 : 0;

  doc.line(M, y, M + colW - 20, y);
  doc.line(M + colW + 20, y, pw - M, y);
  y += 14;
  writeWrapped(`Страна А: ${sig?.name_a || "______________________"}`, 10);
  // Right column (party B) – simulate by overprinting on a new line
  const yB = y - 14;
  doc.text(`Страна Б: ${sig?.name_b || "______________________"}`, M + colW + 20, yB);

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
