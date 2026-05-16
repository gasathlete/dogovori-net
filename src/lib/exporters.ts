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

function applyWatermark(doc: jsPDF, userTag?: string) {
  const pageCount = (doc as any).internal.getNumberOfPages?.() ?? doc.getNumberOfPages();
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const stamp = new Date().toISOString().slice(0, 19).replace("T", " ");
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    // Diagonal preview stamp
    const gState: any = (doc as any).GState ? new (doc as any).GState({ opacity: 0.18 }) : null;
    if (gState) (doc as any).setGState(gState);
    doc.setTextColor(180, 0, 0);
    doc.setFontSize(72);
    doc.text("ПРЕГЛЕД – не за подпис", pw / 2, ph / 2, { align: "center", angle: 35 });
    // Reset and add footer trace
    if (gState) {
      const reset: any = new (doc as any).GState({ opacity: 1 });
      (doc as any).setGState(reset);
    }
    doc.setTextColor(140, 140, 140);
    doc.setFontSize(7);
    const footer = `Dogovori.net · преглед${userTag ? ` · ${userTag}` : ""} · ${stamp}`;
    doc.text(footer, pw / 2, ph - 16, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }
}

export async function exportPDF(c: GeneratedContract, opts?: WatermarkOpts) {
  const b64 = await loadCyrillicFontB64();

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
  y += 4;
  doc.setTextColor(140, 140, 140);
  writeWrapped("Създадено с изкуствен интелект", 8, { align: "center" });
  doc.setTextColor(0, 0, 0);
  y += 8;
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

  if (opts?.watermark) applyWatermark(doc, opts.userTag);
  doc.save(`${fileBase(c.title)}.pdf`);
}

export async function exportDOCX(c: GeneratedContract, opts?: WatermarkOpts) {
  const children: Paragraph[] = [];

  if (opts?.watermark) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: "ПРЕГЛЕД – не за подпис",
            bold: true,
            color: "B00000",
            size: 36,
          }),
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
      children: [new TextRun({ text: c.title.toUpperCase(), bold: true, size: 32 })],
    })
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Създадено с изкуствен интелект", color: "8C8C8C", size: 16, italics: true })],
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

  const doc = new Document({
    creator: "Dogovori.net",
    title: c.title,
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${fileBase(c.title)}.docx`);
}
