import { jsPDF } from "jspdf";
import { saveAs } from "file-saver";
import { applyPdfWatermark } from "./watermark";
import { loadCyrillicFontB64 } from "./pdfFont";
import {
  fileBase,
  type GeneratedContract,
  type WatermarkOpts,
} from "./exporterTypes";
import { inferPartyRolesGenitive } from "@/data/partyRoles";
import type { ResolvedBranding } from "./branding/types";
import { brandingLayout, headerTextLines, footerTextLines } from "./branding/apply";

export type { GeneratedContract, WatermarkOpts };


export async function exportPDF(
  c: GeneratedContract,
  opts?: {
    watermark?: boolean;
    userTag?: string;
    returnBytes?: boolean;
    branding?: ResolvedBranding | null;
  },
): Promise<Uint8Array | void> {
  const b64 = await loadCyrillicFontB64();

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.addFileToVFS("DejaVuSans.ttf", b64);
  doc.addFont("DejaVuSans.ttf", "DejaVu", "normal");
  doc.setFont("DejaVu", "normal");

  const brand = opts?.branding ?? undefined;
  const L = brandingLayout(brand);

  const M = L.margin;
  const TOP = M + L.topPad;
  const BOTTOM = M + L.bottomPad;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  let y = TOP;
  doc.setTextColor(L.text[0], L.text[1], L.text[2]);

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
        if (y > ph - BOTTOM) {
          doc.addPage();
          y = TOP;
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
        y += size * L.lineHeight;
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
      h += Math.max(1, lines.length) * size * L.lineHeight;
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
    if (y + totalH > ph - BOTTOM) { doc.addPage(); y = TOP; }
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

  const headingText = (t: string) => (L.uppercaseHeadings ? t.toUpperCase() : t);

  if (isBilingual) {
    renderTwoColRow({ body: c.title }, { body: c.title_en || c.title }, L.headingSize, L.headingSize);
    doc.setDrawColor(L.accent[0], L.accent[1], L.accent[2]);
    doc.setLineWidth(0.8);
    doc.line(M, y, pw - M, y);
    y += 14;

    renderTwoColRow({ body: c.preamble }, { body: c.preamble_en || "" }, L.bodySize, L.bodySize);
    y += 6;

    for (const cl of c.clauses) {
      renderTwoColRow(
        { heading: `${cl.number} ${cl.title}`, body: cl.body },
        { heading: `${cl.number} ${cl.title_en || cl.title}`, body: cl.body_en || "" },
        L.headingSize - 2,
        L.bodySize,
      );
    }

    y += 8;
    doc.line(M, y, pw - M, y);
    y += 14;

    renderTwoColRow({ body: c.closing }, { body: c.closing_en || "" }, L.bodySize, L.bodySize);
    y += 30;
  } else {
    writeWrapped(headingText(c.title), L.titleSize, { align: "center" });
    y += 8;
    doc.setDrawColor(L.accent[0], L.accent[1], L.accent[2]);
    doc.setLineWidth(0.8);
    doc.line(M, y, pw - M, y);
    y += 18;

    writeWrapped(c.preamble, L.bodySize, { align: L.bodyAlign });
    y += 10;

    for (const cl of c.clauses) {
      y += L.paragraphSpacing;
      writeWrapped(`${cl.number} ${headingText(cl.title)}`, L.headingSize, {
        align: L.headingAlign === "center" ? "center" : "left",
      });
      y += 4;
      writeWrapped(cl.body, L.bodySize, { align: L.bodyAlign });
    }

    y += 14;
    doc.line(M, y, pw - M, y);
    y += 14;
    writeWrapped(c.closing, L.bodySize, { align: L.bodyAlign });
    y += 40;
  }


  // ── Signature block ─────────────────────────────────────────────────────
  // Always append a clear signature area. Uses role-specific parties from
  // c.signature when available (e.g. Наемодател/Наемател, Възложител/
  // Изпълнител), with a sensible fallback otherwise.
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



  if (y + 140 > ph - BOTTOM) { doc.addPage(); y = TOP; }
  y += 10;

  const showCityDate = brand ? brand.signature.showCityDate : true;
  if (showCityDate && (sig?.city || sig?.date)) {
    doc.setFontSize(L.bodySize);
    const line = `Гр. ${sig?.city || "________________"}, дата: ${sig?.date || "____________"}`;
    doc.text(line, M, y);
    y += 22;
  }

  const caption = brand?.signature.caption || "(подпис и имена)";

  const drawPartyAt = (
    p: { role: string; name: string; type?: string; image?: string },
    x: number,
    colW: number,
    ownAsset?: string | null,
  ) => {
    const top = y;
    doc.setFontSize(L.bodySize);
    doc.text((p.role || "").toUpperCase(), x, top);
    const lineY = top + 56;
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.6);
    doc.line(x, lineY, x + colW - 10, lineY);
    doc.setFontSize(Math.max(9, L.bodySize - 1));
    const nameLabel = p.name?.trim() ? p.name : caption;
    doc.text(nameLabel, x, lineY + 14);
    if (p.type) doc.text(p.type, x, lineY + 28);
    const asset = p.image || ownAsset || null;
    if (asset) {
      try {
        doc.addImage(asset, "PNG", x, top + 14, Math.min(L.assetWidth, colW - 20), 38);
      } catch { /* ignore */ }
    }
  };

  const gutter = 24;
  const colW = (pw - M * 2 - gutter) / 2;
  // Собственият подпис/печат от брандинга се слага само на страната, която
  // потребителят е избрал в настройките (по подразбиране — първата колона).
  const ownerIndex = brand?.signature.layout === "right" ? 1 : 0;
  const ownerAsset = brand?.signatureDataUrl ?? null;
  for (let i = 0; i < parties.length; i += 2) {
    if (y + 100 > ph - BOTTOM) { doc.addPage(); y = TOP; }
    const startY = y;
    drawPartyAt(parties[i], M, colW, i === ownerIndex ? ownerAsset : null);
    if (parties[i + 1]) {
      y = startY;
      drawPartyAt(parties[i + 1], M + colW + gutter, colW, i + 1 === ownerIndex ? ownerAsset : null);
    }
    y = startY + 100;
  }

  if (brand?.stampDataUrl) {
    try {
      doc.addImage(brand.stampDataUrl, "PNG", pw - M - 90, y - 70, 80, 80);
    } catch { /* ignore */ }
  }

  // ── Хедър и футър от брандинга (пост-минаване по всички страници) ────────
  if (brand && (brand.header.enabled || brand.footer.enabled)) {
    const pages = doc.getNumberOfPages();
    const hLines = headerTextLines(brand);
    const fLines = footerTextLines(brand);
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      const drawHeader = brand.header.enabled && (brand.header.repeat === "all" || p === 1);
      if (drawHeader) {
        let hy = M - L.topPad + 12;
        const logoW = brand.header.logoHeight * 3;
        if (brand.logoDataUrl) {
          try {
            const lx = brand.header.align === "center" ? (pw - logoW) / 2 : M;
            doc.addImage(brand.logoDataUrl, "PNG", lx, hy - 4, logoW, brand.header.logoHeight);
          } catch { /* ignore */ }
        }
        doc.setFontSize(9);
        doc.setTextColor(L.text[0], L.text[1], L.text[2]);
        const textX =
          brand.header.align === "center"
            ? pw / 2
            : brand.header.align === "split"
              ? pw - M
              : M;
        const align = brand.header.align === "center" ? "center" : brand.header.align === "split" ? "right" : "left";
        let ty = brand.logoDataUrl && brand.header.align === "center" ? hy + brand.header.logoHeight + 10 : hy + 6;
        for (const line of hLines) {
          doc.text(line, textX, ty, { align: align as "left" | "center" | "right" });
          ty += 11;
        }
        if (brand.header.rule !== "none") {
          const ruleY = Math.max(ty, hy + brand.header.logoHeight + 6) + 2;
          if (brand.header.rule === "accent") {
            doc.setDrawColor(L.accent[0], L.accent[1], L.accent[2]);
            doc.setLineWidth(1);
          } else {
            doc.setDrawColor(190, 190, 190);
            doc.setLineWidth(0.5);
          }
          doc.line(M, ruleY, pw - M, ruleY);
        }
      }
      if (brand.footer.enabled) {
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        let fy = ph - M + 14;
        for (const line of fLines) {
          doc.text(line, M, fy);
          fy += 10;
        }
        if (brand.footer.numbering !== "none") {
          const label =
            brand.footer.numbering === "short" ? `${p}` : `Стр. ${p} от ${pages}`;
          doc.text(label, pw - M, ph - M + 14, { align: "right" });
        }
        if (brand.footer.showMadeWith) {
          doc.text("Изготвено с Договори.нет", pw / 2, ph - M + 24, { align: "center" });
        }
        doc.setTextColor(L.text[0], L.text[1], L.text[2]);
      }
    }
    doc.setPage(pages);
  }




  if (opts?.watermark) await applyPdfWatermark(doc, { userTag: opts.userTag });
  if (opts?.returnBytes) {
    const ab = doc.output("arraybuffer");
    return new Uint8Array(ab);
  }
  const blob = doc.output("blob");
  saveAs(blob, `${fileBase(c.title)}.pdf`);
}
