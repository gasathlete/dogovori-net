import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";
import { saveAs } from "file-saver";
import { buildDocxWatermarkHeader } from "./watermark";
import {
  dataUrlToUint8,
  fileBase,
  type GeneratedContract,
  type WatermarkOpts,
} from "./exporterTypes";

export type { GeneratedContract, WatermarkOpts };

export async function exportDOCX(c: GeneratedContract, opts?: WatermarkOpts) {
  const children: (Paragraph | Table)[] = [];

  const isBilingual = Boolean(
    c.bilingual && (c.title_en || c.preamble_en || c.clauses.some((cl) => cl.title_en || cl.body_en)),
  );

  // A4 portrait content width ≈ 9026 DXA with default 1" margins.
  const TABLE_W = 9026;
  const COL_W = Math.floor(TABLE_W / 2);
  const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const cellBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

  const paragraphsFromText = (
    text: string,
    runOpts: {
      bold?: boolean;
      italics?: boolean;
      size?: number;
      align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    } = {},
  ) => {
    const lines = (text ?? "").split("\n");
    return lines.map((line) =>
      new Paragraph({
        alignment: runOpts.align ?? AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: line, size: runOpts.size ?? 22, bold: runOpts.bold, italics: runOpts.italics })],
      }),
    );
  };

  const twoColRow = (bg: Paragraph[], en: Paragraph[]) =>
    new Table({
      width: { size: TABLE_W, type: WidthType.DXA },
      columnWidths: [COL_W, COL_W],
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: COL_W, type: WidthType.DXA },
              borders: cellBorders,
              margins: { top: 60, bottom: 60, left: 80, right: 160 },
              children: bg.length ? bg : [new Paragraph({ text: "" })],
            }),
            new TableCell({
              width: { size: COL_W, type: WidthType.DXA },
              borders: cellBorders,
              margins: { top: 60, bottom: 60, left: 160, right: 80 },
              children: en.length ? en : [new Paragraph({ text: "" })],
            }),
          ],
        }),
      ],
    });

  if (isBilingual) {
    children.push(
      twoColRow(
        [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: c.title.toUpperCase(), bold: true, size: 28 })],
        })],
        [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: (c.title_en || c.title).toUpperCase(), bold: true, size: 28 })],
        })],
      ),
    );
    children.push(new Paragraph({ text: "" }));

    children.push(twoColRow(paragraphsFromText(c.preamble), paragraphsFromText(c.preamble_en || "")));
    children.push(new Paragraph({ text: "" }));

    for (const cl of c.clauses) {
      const bgHead = new Paragraph({
        children: [new TextRun({ text: `${cl.number} ${cl.title.toUpperCase()}`, bold: true, size: 24 })],
      });
      const enHead = new Paragraph({
        children: [new TextRun({ text: `${cl.number} ${(cl.title_en || cl.title).toUpperCase()}`, bold: true, size: 24 })],
      });
      children.push(
        twoColRow(
          [bgHead, ...paragraphsFromText(cl.body)],
          [enHead, ...paragraphsFromText(cl.body_en || "")],
        ),
      );
      children.push(new Paragraph({ text: "" }));
    }

    children.push(
      twoColRow(
        paragraphsFromText(c.closing, { italics: true }),
        paragraphsFromText(c.closing_en || "", { italics: true }),
      ),
    );
    children.push(new Paragraph({ text: "" }));
  } else {
    children.push(
      new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: c.title.toUpperCase(), bold: true, size: 32 })],
      }),
    );
    children.push(new Paragraph({ text: "" }));

    for (const line of c.preamble.split("\n")) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          children: [new TextRun({ text: line, size: 22 })],
        }),
      );
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
        }),
      );
      for (const line of cl.body.split("\n")) {
        children.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            children: [new TextRun({ text: line, size: 22 })],
          }),
        );
      }
    }

    children.push(new Paragraph({ text: "" }));
    children.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        children: [new TextRun({ text: c.closing, italics: true, size: 22 })],
      }),
    );
  }
  children.push(new Paragraph({ text: "" }));
  children.push(new Paragraph({ text: "" }));
  const sig = c.signature;
  if (sig?.city || sig?.date) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `гр. ${sig?.city || "_____"}, ${sig?.date || "_____"}`, size: 22 })],
      }),
    );
    children.push(new Paragraph({ text: "" }));
  }

  // Signature images side by side (if any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sigChildren: any[] = [];
  if (sig?.image_a) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sigChildren.push(new ImageRun({ type: "png", data: dataUrlToUint8(sig.image_a), transformation: { width: 180, height: 70 } } as any));
    } catch {}
  }
  if (sigChildren.length || sig?.image_b) {
    if (sig?.image_b) {
      try {
        sigChildren.push(new TextRun({ text: "        " }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    }),
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
