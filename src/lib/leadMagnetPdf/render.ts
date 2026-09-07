/**
 * Детерминистичен рендер на PDF наръчниците с jsPDF.
 *
 * - Един и същ вход (съдържание + шрифт) дава байт-идентичен изход:
 *   фиксирани CreationDate и FileID, без случайни стойности.
 * - Кирилицата е чрез вградения DejaVu Sans (същия шрифт, който приложението
 *   използва за договорите). „Удебелен“ текст се симулира с fill+stroke,
 *   за да не се добавя втори шрифтов файл в репото.
 * - Рендерът връща `warnings` за всяко хоризонтално/вертикално препълване
 *   или блок, който не се събира на една страница. Генераторът и тестовете
 *   третират непразен списък като грешка.
 */
import { jsPDF } from "jspdf";
import type { LeadMagnetPdfDocument, PdfBlock, PdfSection } from "./types";
import {
  LEAD_MAGNET_PDF_AUTHOR,
  LEAD_MAGNET_PDF_DISCLAIMER,
  LEAD_MAGNET_PDF_DISCLAIMER_LONG,
  LEAD_MAGNET_PDF_RECAP_HEADING,
  LEAD_MAGNET_PDF_RECAP_INTRO,
  LEAD_MAGNET_PDF_REVIEW_DATE,
  LEAD_MAGNET_PDF_REVIEWED_LINE,
  LEAD_MAGNET_PDF_SITE_LABEL,
} from "./common";

export interface RenderLeadMagnetOptions {
  /** base64 на DejaVuSans.ttf (файлът в `public/fonts/`). */
  fontBase64: string;
}

export interface RenderLeadMagnetResult {
  bytes: Uint8Array;
  pageCount: number;
  warnings: string[];
}

type RGB = readonly [number, number, number];

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MX = 52;
const CONTENT_W = PAGE_W - MX * 2;
const TOP_Y = 70; // начало на съдържанието на страници >= 2 (под колонтитула)
const BOTTOM_Y = PAGE_H - 66; // край на съдържанието (над долния колонтитул)

const C = {
  navy: [10, 15, 26] as RGB,
  navy2: [28, 38, 58] as RGB,
  ink: [30, 36, 48] as RGB,
  muted: [96, 104, 118] as RGB,
  gold: [202, 166, 73] as RGB,
  goldInk: [138, 104, 28] as RGB,
  goldPale: [251, 246, 232] as RGB,
  warnBar: [196, 86, 54] as RGB,
  warnInk: [140, 52, 28] as RGB,
  warnPale: [253, 242, 237] as RGB,
  tipBar: [58, 92, 140] as RGB,
  tipInk: [40, 62, 96] as RGB,
  tipPale: [237, 243, 250] as RGB,
  rule: [214, 219, 226] as RGB,
  boxBg: [247, 248, 250] as RGB,
  white: [255, 255, 255] as RGB,
  light: [206, 214, 228] as RGB,
} as const;

const T = {
  body: 10.2,
  small: 8.8,
  tiny: 7.8,
  label: 8.6,
  h2: 13,
  h1: 15.5,
  cover: 24,
  lh: 1.46 as number,
} as const;

interface TextStyle {
  size: number;
  color: RGB;
  bold?: boolean;
  charSpace?: number;
}

/** FNV-1a върху slug с четири различни seed-а → 32 hex знака (PDF FileID). */
function deterministicFileId(seedText: string): string {
  const parts: string[] = [];
  for (let s = 0; s < 4; s++) {
    let h = (0x811c9dc5 ^ (s * 0x9e3779b9)) >>> 0;
    for (let i = 0; i < seedText.length; i++) {
      h ^= seedText.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    parts.push(h.toString(16).padStart(8, "0"));
  }
  return parts.join("").toUpperCase();
}

class Painter {
  readonly doc: jsPDF;
  readonly warnings: string[] = [];
  y = 0;
  page = 1;
  private readonly links: { page: number; x: number; y: number; w: number; h: number; url: string }[] = [];

  constructor(fontBase64: string) {
    this.doc = new jsPDF({ unit: "pt", format: "a4", compress: true, putOnlyUsedFonts: true });
    this.doc.addFileToVFS("DejaVuSans.ttf", fontBase64);
    this.doc.addFont("DejaVuSans.ttf", "DejaVu", "normal");
    this.doc.setFont("DejaVu", "normal");
    this.doc.setLineJoin("round");
  }

  // ── Примитиви ────────────────────────────────────────────────────────────

  private applyStyle(st: TextStyle) {
    this.doc.setFontSize(st.size);
    this.doc.setTextColor(st.color[0], st.color[1], st.color[2]);
    if (st.charSpace !== undefined) this.doc.setCharSpace(st.charSpace);
    else this.doc.setCharSpace(0);
  }

  /** Ширина на низ при даден стил (вкл. добавката от stroke при удебеляване). */
  width(str: string, st: TextStyle): number {
    this.applyStyle(st);
    const base = this.doc.getTextWidth(str);
    const spacing = (st.charSpace ?? 0) * Math.max(0, str.length - 1);
    return base + spacing + (st.bold ? st.size * 0.03 : 0);
  }

  wrap(text: string, maxWidth: number, st: TextStyle): string[] {
    this.applyStyle(st);
    const safe = st.bold ? maxWidth - st.size * 0.06 : maxWidth;
    const out: string[] = [];
    for (const para of text.split("\n")) {
      const lines = this.doc.splitTextToSize(para, safe) as string[];
      out.push(...(lines.length ? lines : [""]));
    }
    return out;
  }

  /** Рисува един ред с baseline `y`. Проверява хоризонтално препълване. */
  line(
    str: string,
    x: number,
    y: number,
    st: TextStyle,
    opts: { align?: "left" | "center" | "right"; maxWidth?: number; link?: string } = {},
  ) {
    this.applyStyle(st);
    const w = this.width(str, st);
    if (opts.maxWidth !== undefined && w > opts.maxWidth + 0.75) {
      this.warnings.push(
        `Хоризонтално препълване на стр. ${this.page}: „${str.slice(0, 48)}…“ (${w.toFixed(1)} > ${opts.maxWidth.toFixed(1)} pt)`,
      );
    }
    if (y > PAGE_H - 20 || y < 10) {
      this.warnings.push(`Вертикално препълване на стр. ${this.page}: „${str.slice(0, 48)}…“ (y=${y.toFixed(1)})`);
    }
    if (st.bold) {
      this.doc.setDrawColor(st.color[0], st.color[1], st.color[2]);
      this.doc.setLineWidth(st.size * 0.027);
      this.doc.text(str, x, y, { align: opts.align ?? "left", renderingMode: "fillThenStroke" });
    } else {
      this.doc.text(str, x, y, { align: opts.align ?? "left" });
    }
    if (opts.link) {
      const lx = opts.align === "right" ? x - w : opts.align === "center" ? x - w / 2 : x;
      this.links.push({ page: this.page, x: lx, y: y - st.size * 0.95, w, h: st.size * 1.25, url: opts.link });
    }
  }

  rect(x: number, y: number, w: number, h: number, fill: RGB, stroke?: RGB, lineWidth = 0.7) {
    this.doc.setFillColor(fill[0], fill[1], fill[2]);
    if (stroke) {
      this.doc.setDrawColor(stroke[0], stroke[1], stroke[2]);
      this.doc.setLineWidth(lineWidth);
      this.doc.rect(x, y, w, h, "FD");
    } else {
      this.doc.rect(x, y, w, h, "F");
    }
  }

  rule(x1: number, y: number, x2: number, color: RGB, lineWidth = 0.6, dash?: number[]) {
    this.doc.setDrawColor(color[0], color[1], color[2]);
    this.doc.setLineWidth(lineWidth);
    if (dash) this.doc.setLineDashPattern(dash, 0);
    this.doc.line(x1, y, x2, y);
    if (dash) this.doc.setLineDashPattern([], 0);
  }

  circle(cx: number, cy: number, r: number, fill: RGB) {
    this.doc.setFillColor(fill[0], fill[1], fill[2]);
    this.doc.circle(cx, cy, r, "F");
  }

  // ── Страници ─────────────────────────────────────────────────────────────

  newPage() {
    this.doc.addPage();
    this.page += 1;
    this.y = TOP_Y;
  }

  /** Гарантира, че блок с височина `h` се събира; иначе нова страница. */
  ensure(h: number, label: string) {
    if (this.y + h <= BOTTOM_Y) return;
    if (h > BOTTOM_Y - TOP_Y) {
      this.warnings.push(`Блокът „${label}“ (${h.toFixed(0)} pt) е по-висок от една страница`);
    }
    this.newPage();
  }

  get remaining(): number {
    return BOTTOM_Y - this.y;
  }

  /** Финален пас: колонтитули и линкове на всички страници. */
  finalize(docTitle: string) {
    const total = this.doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      this.doc.setPage(p);
      this.page = p;
      if (p > 1) {
        this.line(docTitle, MX, 38, { size: 8, color: C.muted }, { maxWidth: CONTENT_W - 90 });
        this.line(LEAD_MAGNET_PDF_SITE_LABEL, PAGE_W - MX, 38, { size: 8, color: C.goldInk, bold: true }, { align: "right" });
        this.rule(MX, 45, PAGE_W - MX, C.rule, 0.6);
        this.rule(MX, 45, MX + 36, C.gold, 1.4);
      }
      const fy = PAGE_H - 44;
      this.rule(MX, fy, PAGE_W - MX, C.rule, 0.6);
      this.line(
        `${LEAD_MAGNET_PDF_AUTHOR} · ${LEAD_MAGNET_PDF_DISCLAIMER}`,
        MX,
        fy + 14,
        { size: T.tiny, color: C.muted },
        { maxWidth: CONTENT_W - 80 },
      );
      this.line(`Стр. ${p} от ${total}`, PAGE_W - MX, fy + 14, { size: T.tiny, color: C.muted }, { align: "right" });
    }
    for (const l of this.links) {
      this.doc.setPage(l.page);
      this.doc.link(l.x, l.y, l.w, l.h, { url: l.url });
    }
    this.doc.setPage(total);
    return total;
  }
}

// ── Блокове ────────────────────────────────────────────────────────────────

const lineH = (size: number, lh: number = T.lh) => size * lh;

/** Абзац с контрол на „сираци“ (поне 2 реда преди/след разкъсване). */
function paragraph(
  P: Painter,
  text: string,
  st: TextStyle,
  opts: { x?: number; width?: number; after?: number; lh?: number; link?: string } = {},
) {
  const x = opts.x ?? MX;
  const width = opts.width ?? CONTENT_W;
  const lh = lineH(st.size, opts.lh);
  const lines = P.wrap(text, width, st);
  const minKeep = Math.min(2, lines.length);
  if (P.remaining < lh * minKeep) P.newPage();
  for (let i = 0; i < lines.length; i++) {
    if (P.y + lh > BOTTOM_Y) {
      P.newPage();
    } else if (i === lines.length - 2 && P.remaining < lh * 2 && lines.length > 2) {
      // не оставяме един-единствен ред на следващата страница
      P.newPage();
    }
    P.line(lines[i], x, P.y + st.size, st, { maxWidth: width, link: opts.link });
    P.y += lh;
  }
  P.y += opts.after ?? 6;
}

function smallLabel(P: Painter, text: string, color: RGB, x = MX, after = 6) {
  const st: TextStyle = { size: T.label, color, bold: true, charSpace: 0.5 };
  P.line(text.toUpperCase(), x, P.y + T.label, st, { maxWidth: CONTENT_W });
  P.y += lineH(T.label, 1.25) + after;
}

function checklist(P: Painter, title: string | undefined, items: string[], marker: "box" | "dot") {
  const st: TextStyle = { size: 10, color: C.ink };
  const indent = 18;
  const lh = lineH(st.size, 1.42);
  const itemHeights = items.map((it) => P.wrap(it, CONTENT_W - indent, st).length * lh + 4);
  const headH = title ? lineH(T.label, 1.25) + 6 : 0;
  P.ensure(headH + itemHeights[0], title ?? items[0]);
  if (title) smallLabel(P, title, marker === "box" ? C.goldInk : C.navy2);
  items.forEach((it, idx) => {
    P.ensure(itemHeights[idx], it);
    const lines = P.wrap(it, CONTENT_W - indent, st);
    const top = P.y;
    if (marker === "box") {
      P.rect(MX + 1, top + 2.2, 8.6, 8.6, C.white, C.navy2, 0.8);
    } else {
      P.circle(MX + 5, top + 6.4, 1.9, C.gold);
    }
    for (const ln of lines) {
      P.line(ln, MX + indent, P.y + st.size, st, { maxWidth: CONTENT_W - indent });
      P.y += lh;
    }
    P.y += 4;
  });
  P.y += 6;
}

function callout(P: Painter, variant: "law" | "warning" | "tip", title: string | undefined, text: string) {
  const palette =
    variant === "law"
      ? { bar: C.gold, bg: C.goldPale, ink: C.goldInk }
      : variant === "warning"
        ? { bar: C.warnBar, bg: C.warnPale, ink: C.warnInk }
        : { bar: C.tipBar, bg: C.tipPale, ink: C.tipInk };
  const padX = 16;
  const padY = 12;
  const st: TextStyle = { size: 9.6, color: C.ink };
  const innerW = CONTENT_W - padX * 2 - 3;
  const lines = P.wrap(text, innerW, st);
  const lh = lineH(st.size, 1.44);
  const titleH = title ? lineH(T.label, 1.25) + 5 : 0;
  const x = MX + 3 + padX;
  const boxHeight = (n: number, withTitle: boolean) => padY * 2 + (withTitle ? titleH : 0) + n * lh - (lh - st.size) + 2;

  // Дълга карета се разкъсва между страници: остатъкът на текущата страница
  // трябва да побере заглавието и поне 3 реда, иначе цялата отива на следващата.
  let idx = 0;
  let first = true;
  let guard = 0;
  while (idx < lines.length) {
    if (++guard > 50) {
      P.warnings.push(`Каретата „${title ?? text.slice(0, 32)}“ не може да бъде разположена`);
      return;
    }
    const rest = lines.length - idx;
    const fitAll = P.y + boxHeight(rest, first) <= BOTTOM_Y;
    let take = rest;
    if (!fitAll) {
      const canTake = Math.floor((P.remaining - padY * 2 - (first ? titleH : 0) - 2) / lh);
      if (canTake < Math.min(3, rest) || rest - canTake < 2) {
        // не разкъсваме, ако би останал самотен ред или почти нищо не се събира
        if (canTake >= rest) take = rest;
        else {
          P.newPage();
          continue;
        }
      } else {
        take = canTake;
      }
    }
    const h = boxHeight(take, first);
    const top = P.y;
    P.rect(MX, top, CONTENT_W, h, palette.bg);
    P.rect(MX, top, 3, h, palette.bar);
    P.y = top + padY;
    if (first && title) {
      P.line(title.toUpperCase(), x, P.y + T.label, { size: T.label, color: palette.ink, bold: true, charSpace: 0.5 }, { maxWidth: innerW });
      P.y += titleH;
    }
    for (let i = idx; i < idx + take; i++) {
      P.line(lines[i], x, P.y + st.size, st, { maxWidth: innerW });
      P.y += lh;
    }
    idx += take;
    first = false;
    P.y = top + h + 10;
    if (idx < lines.length) P.newPage();
  }
}

function fields(P: Painter, title: string | undefined, items: string[]) {
  const st: TextStyle = { size: 9.4, color: C.muted };
  const rowH = 22;
  const headH = title ? lineH(T.label, 1.25) + 6 : 0;
  P.ensure(headH + rowH * items.length + 4, title ?? "полета");
  if (title) smallLabel(P, title, C.navy2);
  for (const label of items) {
    const text = `${label}:`;
    const w = P.width(text, st);
    const baseline = P.y + st.size + 4;
    P.line(text, MX, baseline, st, { maxWidth: CONTENT_W });
    const lineStart = Math.min(MX + w + 8, MX + CONTENT_W - 120);
    P.rule(lineStart, baseline + 1.5, MX + CONTENT_W, C.navy2, 0.5, [1.1, 1.7]);
    P.y += rowH;
  }
  P.y += 6;
}

function templateBox(P: Painter, title: string, lines: string[], note?: string) {
  const padX = 16;
  const padY = 13;
  const st: TextStyle = { size: 9.6, color: C.ink };
  const innerW = CONTENT_W - padX * 2;
  const lh = lineH(st.size, 1.46);
  const wrapped = lines.map((l) => (l.trim() === "" ? [] : P.wrap(l, innerW, st)));
  const bodyH = wrapped.reduce((sum, ls) => sum + (ls.length === 0 ? lh * 0.55 : ls.length * lh + 3), 0);
  const h = padY * 2 + lineH(T.label, 1.25) + 8 + bodyH;
  P.ensure(h, title);
  const top = P.y;
  P.rect(MX, top, CONTENT_W, h, C.boxBg, C.rule, 0.7);
  P.y = top + padY;
  P.line(title.toUpperCase(), MX + padX, P.y + T.label, { size: T.label, color: C.navy2, bold: true, charSpace: 0.5 }, { maxWidth: innerW });
  P.y += lineH(T.label, 1.25) + 8;
  for (const ls of wrapped) {
    if (ls.length === 0) {
      P.y += lh * 0.55;
      continue;
    }
    for (const ln of ls) {
      P.line(ln, MX + padX, P.y + st.size, st, { maxWidth: innerW });
      P.y += lh;
    }
    P.y += 3;
  }
  P.y = top + h + 8;
  if (note) paragraph(P, note, { size: T.small, color: C.muted }, { after: 10, lh: 1.4 });
}

function block(P: Painter, b: PdfBlock) {
  switch (b.kind) {
    case "paragraph":
      paragraph(P, b.text, {
        size: b.tone === "muted" ? T.small : T.body,
        color: b.tone === "muted" ? C.muted : C.ink,
        bold: b.tone === "emphasis",
      });
      return;
    case "callout":
      callout(P, b.variant, b.title, b.text);
      return;
    case "checklist":
      checklist(P, b.title, b.items, "box");
      return;
    case "bullets":
      checklist(P, b.title, b.items, "dot");
      return;
    case "fields":
      fields(P, b.title, b.items);
      return;
    case "template":
      templateBox(P, b.title, b.lines, b.note);
      return;
  }
}

function sectionHeading(P: Painter, s: PdfSection) {
  const titleSt: TextStyle = { size: T.h2, color: C.navy, bold: true };
  const titleX = MX + 30;
  const titleLines = P.wrap(s.title, CONTENT_W - 30, titleSt);
  const headH = titleLines.length * lineH(T.h2, 1.25) + 10;
  const leadSt: TextStyle = { size: T.body, color: C.ink };
  const leadLines = P.wrap(s.lead, CONTENT_W, leadSt);
  const keep = headH + Math.min(3, leadLines.length) * lineH(T.body);
  P.ensure(keep, s.title);
  P.y += 4;
  const top = P.y;
  P.circle(MX + 10, top + 9, 10, C.gold);
  P.line(String(s.number), MX + 10, top + 12.6, { size: 9.6, color: C.navy, bold: true }, { align: "center" });
  for (const ln of titleLines) {
    P.line(ln, titleX, P.y + T.h2 * 0.98, titleSt, { maxWidth: CONTENT_W - 30 });
    P.y += lineH(T.h2, 1.25);
  }
  P.y += 8;
  paragraph(P, s.lead, leadSt, { after: 10 });
}

function bigHeading(P: Painter, text: string, keepWith = 60) {
  const st: TextStyle = { size: T.h1, color: C.navy, bold: true };
  const lines = P.wrap(text, CONTENT_W, st);
  const h = lines.length * lineH(T.h1, 1.25) + 16;
  P.ensure(h + keepWith, text);
  P.y += 6;
  for (const ln of lines) {
    P.line(ln, MX, P.y + T.h1, st, { maxWidth: CONTENT_W });
    P.y += lineH(T.h1, 1.25);
  }
  P.rule(MX, P.y + 7, MX + 42, C.gold, 1.6);
  P.y += 20;
}

function cover(P: Painter, d: LeadMagnetPdfDocument) {
  const titleSt: TextStyle = { size: T.cover, color: C.white, bold: true };
  const subSt: TextStyle = { size: 11, color: C.light };
  const titleLines = P.wrap(d.title, CONTENT_W, titleSt);
  const subLines = P.wrap(d.subtitle, CONTENT_W - 40, subSt);
  const bandH =
    58 + lineH(T.label, 1.25) + 18 + titleLines.length * lineH(T.cover, 1.18) + 12 + subLines.length * lineH(11, 1.42) + 44;
  P.rect(0, 0, PAGE_W, bandH, C.navy);
  P.rect(0, bandH - 4, PAGE_W, 4, C.gold);
  let y = 58;
  P.line(d.eyebrow.toUpperCase(), MX, y + T.label, { size: T.label, color: C.gold, bold: true, charSpace: 1.1 }, { maxWidth: CONTENT_W });
  y += lineH(T.label, 1.25) + 18;
  for (const ln of titleLines) {
    P.line(ln, MX, y + T.cover * 0.95, titleSt, { maxWidth: CONTENT_W });
    y += lineH(T.cover, 1.18);
  }
  y += 12;
  for (const ln of subLines) {
    P.line(ln, MX, y + 11, subSt, { maxWidth: CONTENT_W - 40 });
    y += lineH(11, 1.42);
  }
  P.y = bandH + 26;

  // Мета ред: дата на проверка + disclaimer
  P.circle(MX + 3, P.y + 5.4, 2.4, C.gold);
  P.line(LEAD_MAGNET_PDF_REVIEWED_LINE, MX + 12, P.y + T.small, { size: T.small, color: C.navy2, bold: true }, { maxWidth: CONTENT_W - 12 });
  P.y += lineH(T.small, 1.5);
  paragraph(P, LEAD_MAGNET_PDF_DISCLAIMER_LONG, { size: T.small, color: C.muted }, { x: MX + 12, width: CONTENT_W - 12, after: 10, lh: 1.4 });
  P.rule(MX, P.y, PAGE_W - MX, C.rule, 0.6);
  P.y += 16;
}

function sources(P: Painter, d: LeadMagnetPdfDocument) {
  bigHeading(P, d.sources.title, 80);
  paragraph(P, d.sources.intro, { size: T.small, color: C.muted }, { after: 10, lh: 1.4 });
  const labelSt: TextStyle = { size: 9.4, color: C.ink };
  const urlSt: TextStyle = { size: T.small, color: C.goldInk, bold: true };
  for (const src of d.sources.items) {
    const labelLines = P.wrap(src.label, CONTENT_W - 14, labelSt);
    const urlLines = wrapUrl(P, src.url, CONTENT_W - 14, urlSt);
    const h = labelLines.length * lineH(9.4, 1.42) + urlLines.length * lineH(T.small, 1.5) + 12;
    P.ensure(h, src.label);
    P.circle(MX + 3, P.y + 5.2, 1.9, C.gold);
    for (const ln of labelLines) {
      P.line(ln, MX + 14, P.y + 9.4, labelSt, { maxWidth: CONTENT_W - 14 });
      P.y += lineH(9.4, 1.42);
    }
    P.y += 1;
    for (const ln of urlLines) {
      P.line(ln, MX + 14, P.y + T.small, urlSt, { maxWidth: CONTENT_W - 14, link: src.url });
      P.rule(MX + 14, P.y + T.small + 2.8, MX + 14 + P.width(ln, urlSt), C.gold, 0.5);
      P.y += lineH(T.small, 1.5);
    }
    P.y += 10;
  }
}

/** Разбива URL на редове, за предпочитане след „/“. */
function wrapUrl(P: Painter, url: string, maxWidth: number, st: TextStyle): string[] {
  if (P.width(url, st) <= maxWidth) return [url];
  const out: string[] = [];
  let current = "";
  const tokens = url.split(/(?<=\/)/);
  for (const tok of tokens) {
    if (P.width(current + tok, st) <= maxWidth) {
      current += tok;
      continue;
    }
    if (current) out.push(current);
    current = "";
    // Токен, по-дълъг от реда — режем по знаци.
    let piece = "";
    for (const ch of tok) {
      if (P.width(piece + ch, st) > maxWidth) {
        out.push(piece);
        piece = "";
      }
      piece += ch;
    }
    current = piece;
  }
  if (current) out.push(current);
  return out;
}

function cta(P: Painter, d: LeadMagnetPdfDocument) {
  const padX = 20;
  const padY = 18;
  const innerW = CONTENT_W - padX * 2;
  const titleSt: TextStyle = { size: 12.5, color: C.white, bold: true };
  const textSt: TextStyle = { size: 9.8, color: C.light };
  const urlSt: TextStyle = { size: 10, color: C.gold, bold: true };
  const titleLines = P.wrap(d.cta.title, innerW, titleSt);
  const textLines = P.wrap(d.cta.text, innerW, textSt);
  const urlLabel = d.cta.url.replace(/^https?:\/\//, "");
  const urlLines = wrapUrl(P, urlLabel, innerW, urlSt);
  const h =
    padY * 2 +
    titleLines.length * lineH(12.5, 1.25) +
    8 +
    textLines.length * lineH(9.8, 1.46) +
    8 +
    urlLines.length * lineH(10, 1.4);
  const noteSt: TextStyle = { size: T.small, color: C.muted };
  const noteLines = P.wrap(d.cta.note, CONTENT_W, noteSt);
  P.ensure(h + 10 + noteLines.length * lineH(T.small, 1.4) + 8, d.cta.title);
  const top = P.y;
  P.rect(MX, top, CONTENT_W, h, C.navy);
  P.rect(MX, top, 4, h, C.gold);
  P.y = top + padY;
  for (const ln of titleLines) {
    P.line(ln, MX + padX, P.y + 12.5 * 0.95, titleSt, { maxWidth: innerW });
    P.y += lineH(12.5, 1.25);
  }
  P.y += 8;
  for (const ln of textLines) {
    P.line(ln, MX + padX, P.y + 9.8, textSt, { maxWidth: innerW });
    P.y += lineH(9.8, 1.46);
  }
  P.y += 8;
  for (const ln of urlLines) {
    P.line(`→ ${ln}`, MX + padX, P.y + 10, urlSt, { maxWidth: innerW, link: d.cta.url });
    P.y += lineH(10, 1.4);
  }
  P.y = top + h + 10;
  paragraph(P, d.cta.note, noteSt, { after: 0, lh: 1.4 });
}

// ── Публичен API ───────────────────────────────────────────────────────────

export function renderLeadMagnetPdf(d: LeadMagnetPdfDocument, opts: RenderLeadMagnetOptions): RenderLeadMagnetResult {
  const P = new Painter(opts.fontBase64);
  const doc = P.doc;

  // Метаданни — фиксирани, за да е изходът възпроизводим.
  const ymd = LEAD_MAGNET_PDF_REVIEW_DATE.replace(/-/g, "");
  doc.setCreationDate(`D:${ymd}000000+00'00'`);
  doc.setFileId(deterministicFileId(`dogovori.net/lead-magnets/${d.slug}`));
  doc.setLanguage("bg");
  doc.setProperties({
    title: d.title,
    subject: d.metadata.subject,
    author: LEAD_MAGNET_PDF_AUTHOR,
    keywords: d.metadata.keywords.join(", "),
    creator: `${LEAD_MAGNET_PDF_AUTHOR} lead-magnet generator`,
  });

  // Корица + въведение
  cover(P, d);
  for (const para of d.intro) paragraph(P, para, { size: T.body, color: C.ink }, { after: 8 });
  P.y += 2;
  callout(P, "tip", "Как да използвате наръчника", d.howToUse);

  // Основни раздели
  bigHeading(P, d.sectionsHeading, 90);
  for (const s of d.sections) {
    sectionHeading(P, s);
    for (const b of s.blocks) block(P, b);
    P.y += 6;
  }

  // Приложение (напр. образец на имейл)
  if (d.appendix) {
    bigHeading(P, d.appendix.title, 120);
    for (const b of d.appendix.blocks) block(P, b);
  }

  // Кога да потърсите адвокат
  bigHeading(P, d.whenLawyer.title, 90);
  paragraph(P, d.whenLawyer.intro, { size: T.body, color: C.ink }, { after: 8 });
  checklist(P, undefined, d.whenLawyer.items, "dot");
  paragraph(P, d.whenLawyer.outro, { size: T.small, color: C.muted }, { after: 10, lh: 1.4 });

  // Официални източници
  sources(P, d);

  // Последна страница: резюме за разпечатване + CTA
  P.newPage();
  bigHeading(P, LEAD_MAGNET_PDF_RECAP_HEADING, 60);
  paragraph(P, LEAD_MAGNET_PDF_RECAP_INTRO, { size: T.small, color: C.muted }, { after: 10, lh: 1.4 });
  checklist(
    P,
    undefined,
    d.sections.map((s) => `${s.number}. ${s.title}`),
    "box",
  );
  P.y += 6;
  cta(P, d);

  const pageCount = P.finalize(d.title);
  const bytes = new Uint8Array(doc.output("arraybuffer"));
  return { bytes, pageCount, warnings: P.warnings };
}
