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
import { applyPdfWatermark, buildDocxWatermarkHeader, type WatermarkOpts as _WMOpts } from "./watermark";

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

export interface BilingualClause {
  number: string;
  title: string;
  body: string;
  title_en?: string;
  body_en?: string;
}

export interface GeneratedContract {
  title: string;
  preamble: string;
  clauses: BilingualClause[];
  closing: string;
  signature?: SignatureInfo;
  // Bilingual (BG + EN, two-column) support
  bilingual?: boolean;
  title_en?: string;
  preamble_en?: string;
  closing_en?: string;
}

const fileBase = (title: string) =>
  title
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60) || "Dogovor";

// Cache the Cyrillic-capable font in memory to avoid re-fetching on every export.
let cachedFontB64: string | null = null;

async function loadCyrillicFontB64(): Promise<string> {
  if (cachedFontB64) return cachedFontB64;
  const sources = [
    "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.0/ttf/DejaVuSans.ttf",
    "https://unpkg.com/dejavu-fonts-ttf@2.37.0/ttf/DejaVuSans.ttf",
  ];
  let lastErr: unknown;
  for (const url of sources) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buffer = await r.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      // Validate: TTF/OTF must start with 0x00010000 or "OTTO" or "true"
      const sig = bytes[0] << 24 | bytes[1] << 16 | bytes[2] << 8 | bytes[3];
      if (sig !== 0x00010000 && sig !== 0x4f54544f && sig !== 0x74727565) {
        throw new Error("Invalid TTF signature");
      }
      let binary = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as any);
      }
      cachedFontB64 = btoa(binary);
      return cachedFontB64;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Не успяхме да заредим шрифт за PDF: ${String((lastErr as Error)?.message ?? lastErr)}`);
}

export interface WatermarkOpts {
  watermark: true;
  userTag?: string;
}

// Watermark implementation lives in ./watermark to keep brand styling consistent
// across contract and template exports.


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
    opts: { bold?: boolean; align?: "left" | "center" | "justify" } = {},
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
        if (opts.align === "center") {
          doc.text(line, x + maxWidth / 2, y, { align: "center" });
        } else if (opts.align === "justify" && !isLast) {
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
    opts: { bold?: boolean; align?: "left" | "center" | "justify" } = {},
  ) => writeWrappedInBox(text, size, { x: M, maxWidth: pw - M * 2 }, opts);

  // Measure how many y-units a block of text will consume, without drawing.
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

  // Render a single "row" of two columns side by side (BG left, EN right).
  // Both blocks may include a heading line + body. The row advances `y` by
  // the height of the taller column so the next row starts cleanly.
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

    // Left (BG)
    if (bg.heading) { writeWrappedInBox(bg.heading.toUpperCase(), headingSize, { x: leftX, maxWidth: colW }); y += 2; }
    writeWrappedInBox(bg.body, bodySize, { x: leftX, maxWidth: colW }, { align: "justify" });
    const leftEndY = y;

    // Right (EN)
    y = startY;
    if (en.heading) { writeWrappedInBox(en.heading.toUpperCase(), headingSize, { x: rightX, maxWidth: colW }); y += 2; }
    writeWrappedInBox(en.body, bodySize, { x: rightX, maxWidth: colW }, { align: "justify" });
    const rightEndY = y;

    y = Math.max(leftEndY, rightEndY) + 6;
  };

  const isBilingual = Boolean(c.bilingual && (c.title_en || c.preamble_en || c.clauses.some((cl) => cl.title_en || cl.body_en)));

  if (isBilingual) {
    // Title row
    renderTwoColRow(
      { body: c.title },
      { body: c.title_en || c.title },
      14,
      14,
    );
    doc.setDrawColor(201, 168, 76);
    doc.setLineWidth(0.8);
    doc.line(M, y, pw - M, y);
    y += 14;

    // Preamble row
    renderTwoColRow(
      { body: c.preamble },
      { body: c.preamble_en || "" },
      11,
      11,
    );
    y += 6;

    // Clauses
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

    // Closing row
    renderTwoColRow(
      { body: c.closing },
      { body: c.closing_en || "" },
      11,
      11,
    );
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
  const yB = y - 14;
  doc.text(`Страна Б: ${sig?.name_b || "______________________"}`, M + colW + 20, yB);

  if (opts?.watermark) await applyPdfWatermark(doc, { userTag: opts.userTag });
  if (opts?.returnBytes) {
    const ab = doc.output("arraybuffer");
    return new Uint8Array(ab);
  }
  doc.save(`${fileBase(c.title)}.pdf`);
}

export async function exportDOCX(c: GeneratedContract, opts?: WatermarkOpts) {
  const children: Paragraph[] = [];

  // Watermark is rendered as a page header (applied below via section headers),
  // so it appears discreetly on every page instead of only on the first one.


  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: c.title.toUpperCase(), bold: true, size: 32 })],
    })
  );
  children.push(new Paragraph({ text: "" }));

  for (const line of c.preamble.split("\n")) {
    children.push(new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      children: [new TextRun({ text: line, size: 22 })],
    }));
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
      children.push(new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: line, size: 22 })],
      }));
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
  const sig = c.signature;
  if (sig?.city || sig?.date) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `гр. ${sig?.city || "_____"}, ${sig?.date || "_____"}`, size: 22 })],
      })
    );
    children.push(new Paragraph({ text: "" }));
  }

  // Signature images side by side (if any)
  const sigChildren: any[] = [];
  if (sig?.image_a) {
    try {
      sigChildren.push(new ImageRun({ type: "png", data: dataUrlToUint8(sig.image_a), transformation: { width: 180, height: 70 } } as any));
    } catch {}
  }
  if (sigChildren.length || sig?.image_b) {
    if (sig?.image_b) {
      try {
        sigChildren.push(new TextRun({ text: "        " }));
        sigChildren.push(new ImageRun({ type: "png", data: dataUrlToUint8(sig.image_b), transformation: { width: 180, height: 70 } } as any));
      } catch {}
    }
    children.push(new Paragraph({ children: sigChildren }));
  }

  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: `Страна А: ${sig?.name_a || "__________________________"}            `, size: 22 }),
        new TextRun({ text: `Страна Б: ${sig?.name_b || "__________________________"}`, size: 22 }),
      ],
    })
  );

  const header = opts?.watermark ? await buildDocxWatermarkHeader() : undefined;
  const doc = new Document({
    creator: "Dogovori.net",
    title: c.title,
    sections: [{
      headers: header ? { default: header } : undefined,
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${fileBase(c.title)}.docx`);
}
