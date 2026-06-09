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
import { inferPartyRolesGenitive } from "@/data/partyRoles";

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
  // ── Signature block ─────────────────────────────────────────────────────
  // Always append a clear signature area at the very end. Uses role-specific
  // parties from c.signature when available (Наемодател/Наемател, Възложител/
  // Изпълнител, …), with a sensible fallback otherwise.
  const sig = c.signature;
  const parties: { role: string; name: string; type?: string; image?: string }[] = (() => {
    const inferred = inferPartyRolesGenitive(c.title);
    const normalize = (s: string) => (s || "").toLowerCase().replace(/[^a-zа-я]+/gi, "");
    const looksLike = (have: string, want: string) => {
      const x = normalize(have), y = normalize(want);
      if (!x || !y) return false;
      return x.startsWith(y.slice(0, Math.min(6, y.length))) ||
             y.startsWith(x.slice(0, Math.min(6, x.length)));
    };
    const isGeneric = (role: string) => !role || /^страна\s*[аб]$/i.test(role.trim());
    const fixRole = (role: string, idx: number): string => {
      if (!inferred) return role || `Страна ${idx % 2 === 0 ? "А" : "Б"}`;
      const want = idx % 2 === 0 ? inferred.a : inferred.b;
      if (isGeneric(role)) return want;
      if (!looksLike(role, inferred.a) && !looksLike(role, inferred.b)) return want;
      return role;
    };
    if (sig?.parties && sig.parties.length) {
      return sig.parties.map((p, idx) => ({ ...p, role: fixRole(p.role, idx) }));
    }
    if (sig?.name_a || sig?.name_b) {
      return [
        { role: inferred?.a ?? "Страна А", name: sig?.name_a ?? "", image: sig?.image_a },
        { role: inferred?.b ?? "Страна Б", name: sig?.name_b ?? "", image: sig?.image_b },
      ];
    }
    return [
      { role: inferred?.a ?? "Страна А", name: "" },
      { role: inferred?.b ?? "Страна Б", name: "" },
    ];
  })();


  children.push(new Paragraph({ text: "" }));
  if (sig?.city || sig?.date) {
    children.push(new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [new TextRun({
        text: `Гр. ${sig?.city || "________________"}, дата: ${sig?.date || "____________"}`,
        size: 22,
      })],
    }));
  }
  children.push(new Paragraph({ text: "" }));

  const SIG_COL = Math.floor(TABLE_W / 2);
  const buildPartyCell = (p: { role: string; name: string; type?: string; image?: string }) => {
    const cellChildren: Paragraph[] = [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [new TextRun({ text: (p.role || "").toUpperCase(), bold: true, size: 22 })],
      }),
    ];
    if (p.image) {
      try {
        cellChildren.push(new Paragraph({
          alignment: AlignmentType.LEFT,
          children: [new ImageRun({
            type: "png",
            data: dataUrlToUint8(p.image),
            transformation: { width: 160, height: 50 },
          } as any)],
        }));
      } catch { /* ignore */ }
    } else {
      cellChildren.push(new Paragraph({ text: "" }));
      cellChildren.push(new Paragraph({ text: "" }));
    }
    cellChildren.push(new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text: "____________________________", size: 22 })],
    }));
    cellChildren.push(new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [new TextRun({
        text: p.name?.trim() ? p.name : "(подпис и имена)",
        size: 20,
      })],
    }));
    if (p.type) {
      cellChildren.push(new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [new TextRun({ text: p.type, size: 20, italics: true })],
      }));
    }
    return new TableCell({
      borders: cellBorders,
      width: { size: SIG_COL, type: WidthType.DXA },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: cellChildren,
    });
  };

  for (let i = 0; i < parties.length; i += 2) {
    const left = buildPartyCell(parties[i]);
    const right = parties[i + 1]
      ? buildPartyCell(parties[i + 1])
      : new TableCell({
          borders: cellBorders,
          width: { size: SIG_COL, type: WidthType.DXA },
          children: [new Paragraph({ text: "" })],
        });
    children.push(new Table({
      width: { size: TABLE_W, type: WidthType.DXA },
      columnWidths: [SIG_COL, SIG_COL],
      rows: [new TableRow({ children: [left, right] })],
    }));
    children.push(new Paragraph({ text: "" }));
  }



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
