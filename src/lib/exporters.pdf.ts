import { jsPDF } from "jspdf";
import { applyPdfWatermark } from "./watermark";
import { loadCyrillicFontB64 } from "./pdfFont";
import {
  fileBase,
  type GeneratedContract,
  type WatermarkOpts,
} from "./exporterTypes";

export type { GeneratedContract, WatermarkOpts };

export async function exportPDF(
  c: GeneratedContract,
  opts?: { watermark?: boolean; userTag?: string; returnBytes?: boolean },
): Promise<Uint8Array | void> {
  const b64 = await loadCyrillicFontB64();

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.addFileToVFS("DejaVuSans.ttf", b64);
  doc.addFont("DejaVuSans.ttf", "DejaVu", "normal");
  doc.setFont("DejaVu", "normal");

  const M = 56;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  let y = M;

  const writeWrappedInBox = (
    text: string,
    size: number,
    box: { x: number; maxWidth: number },
    wOpts: { bold?: boolean; align?: "left" | "center" | "justify" } = {},
  ) => {
    doc.setFontSize(size);
    const { x, maxWidth } = box;
    const paragraphs = text.split("\n");
    for (let p = 0; p < paragraphs.length; p++) {
      const para = paragraphs[p];
      const lines: string[] = doc.splitTextToSize(para, maxWidth);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (y > ph - M) {
          doc.addPage();
          y = M;
        }
        const isLast = i === lines.length - 1;
        if (wOpts.align === "center") {
          doc.text(line, x + maxWidth / 2, y, { align: "center" });
        } else if (wOpts.align === "justify" && !isLast) {
          const words = line.split(/\s+/).filter(Boolean);
          if (words.length > 1) {
            const wordsW = words.reduce((s, w) => s + doc.getTextWidth(w), 0);
            const gap = (maxWidth - wordsW) / (words.length - 1);
            let cx = x;
            for (let w = 0; w < words.length; w++) {
              doc.text(words[w], cx, y);
              cx += doc.getTextWidth(words[w]) + gap;
            }
          } else {
            doc.text(line, x, y);
          }
        } else {
          doc.text(line, x, y);
        }
        y += size * 1.4;
      }
    }
  };

  const writeWrapped = (
    text: string,
    size: number,
    wOpts: { bold?: boolean; align?: "left" | "center" | "justify" } = {},
  ) => writeWrappedInBox(text, size, { x: M, maxWidth: pw - M * 2 }, wOpts);

  const measureBlock = (text: string, size: number, maxWidth: number) => {
    doc.setFontSize(size);
    const paragraphs = text.split("\n");
    let h = 0;
    for (const para of paragraphs) {
      const lines: string[] = doc.splitTextToSize(para, maxWidth);
      h += Math.max(1, lines.length) * size * 1.4;
    }
    return h;
  };

  const renderTwoColRow = (
    bg: { heading?: string; body: string },
    en: { heading?: string; body: string },
    headingSize: number,
    bodySize: number,
  ) => {
    const gutter = 18;
    const colW = (pw - M * 2 - gutter) / 2;
    const leftX = M;
    const rightX = M + colW + gutter;

    const headingH = (txt: string) => (txt ? measureBlock(txt, headingSize, colW) + 4 : 0);
    const totalH = Math.max(
      headingH(bg.heading || "") + measureBlock(bg.body, bodySize, colW),
      headingH(en.heading || "") + measureBlock(en.body, bodySize, colW),
    );
    if (y + totalH > ph - M) { doc.addPage(); y = M; }
    const startY = y;

    if (bg.heading) { writeWrappedInBox(bg.heading.toUpperCase(), headingSize, { x: leftX, maxWidth: colW }); y += 2; }
    writeWrappedInBox(bg.body, bodySize, { x: leftX, maxWidth: colW }, { align: "justify" });
    const leftEndY = y;

    y = startY;
    if (en.heading) { writeWrappedInBox(en.heading.toUpperCase(), headingSize, { x: rightX, maxWidth: colW }); y += 2; }
    writeWrappedInBox(en.body, bodySize, { x: rightX, maxWidth: colW }, { align: "justify" });
    const rightEndY = y;

    y = Math.max(leftEndY, rightEndY) + 6;
  };

  const isBilingual = Boolean(
    c.bilingual && (c.title_en || c.preamble_en || c.clauses.some((cl) => cl.title_en || cl.body_en)),
  );

  if (isBilingual) {
    renderTwoColRow({ body: c.title }, { body: c.title_en || c.title }, 14, 14);
    doc.setDrawColor(201, 168, 76);
    doc.setLineWidth(0.8);
    doc.line(M, y, pw - M, y);
    y += 14;

    renderTwoColRow({ body: c.preamble }, { body: c.preamble_en || "" }, 11, 11);
    y += 6;

    for (const cl of c.clauses) {
      renderTwoColRow(
        { heading: `${cl.number} ${cl.title}`, body: cl.body },
        { heading: `${cl.number} ${cl.title_en || cl.title}`, body: cl.body_en || "" },
        12,
        11,
      );
    }

    y += 8;
    doc.line(M, y, pw - M, y);
    y += 14;

    renderTwoColRow({ body: c.closing }, { body: c.closing_en || "" }, 11, 11);
    y += 30;
  } else {
    writeWrapped(c.title.toUpperCase(), 16, { align: "center" });
    y += 8;
    doc.setDrawColor(201, 168, 76);
    doc.setLineWidth(0.8);
    doc.line(M, y, pw - M, y);
    y += 18;

    writeWrapped(c.preamble, 11, { align: "justify" });
    y += 10;

    for (const cl of c.clauses) {
      y += 8;
      writeWrapped(`${cl.number} ${cl.title.toUpperCase()}`, 12);
      y += 4;
      writeWrapped(cl.body, 11, { align: "justify" });
    }

    y += 14;
    doc.line(M, y, pw - M, y);
    y += 14;
    writeWrapped(c.closing, 11, { align: "justify" });
    y += 40;
  }

  // Signature ending is rendered inside the contract body (closing/clauses)
  // with role labels specific to the document (Наемодател/Наемател, Възложител/
  // Изпълнител, etc.), so we intentionally do NOT append a generic
  // "СТРАНИ ПО ДОГОВОРА / ЗА СТРАНА А" block here.


  if (opts?.watermark) await applyPdfWatermark(doc, { userTag: opts.userTag });
  if (opts?.returnBytes) {
    const ab = doc.output("arraybuffer");
    return new Uint8Array(ab);
  }
  doc.save(`${fileBase(c.title)}.pdf`);
}
