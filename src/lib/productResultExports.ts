/**
 * Файлове от платения резултат — чисти функции без мрежа и без модел.
 *
 * Всичко се строи от вече проверения сървърен резултат, точния платен текст и
 * записания избор. В файловете няма технически идентификатори, хешове, имена на
 * модели или указания — само това, което човек ще чете.
 */
import { jsPDF } from "jspdf";
import { saveAs } from "file-saver";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
} from "docx";
import { loadCyrillicFontB64 } from "@/lib/pdfFont";
import { SEVERITY_LABELS_BG, STRATEGY_LABELS_BG } from "@/lib/productResults";
import { ECONOMIC_KIND_LABELS_BG, PARTY_LABELS_BG, TONE_LABELS_BG } from "@/lib/productResultLabels";
import type {
  ContractCheckResult,
  ContractImproveResult,
  NegotiationPackageResult,
  ReadyProductResult,
} from "../../supabase/functions/_shared/product-result-contract";
import type { AppliedCorrection } from "../../supabase/functions/_shared/product-patch";

export const NOT_LEGAL_ADVICE =
  "Този документ е автоматично изготвен анализ по Вашия текст. Не е правен съвет и не заменя консултация с адвокат. Проверете внимателно преди подписване.";

/** Безопасно име на файл: без пътища, кавички и служебни знаци. */
export function safeFileName(title: string, suffix: string, ext: string): string {
  const base = title
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60) || "Dokument";
  return `${base}_${suffix}.${ext}`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  saveAs(blob, filename);
}

/* --------------------------------- PDF слой -------------------------------- */

interface Pdf {
  readonly doc: jsPDF;
  heading: (text: string, size?: number) => void;
  para: (text: string, opts?: { size?: number; muted?: boolean; indent?: number }) => void;
  quote: (text: string) => void;
  gap: (h?: number) => void;
  finish: () => Blob;
}

async function createPdf(title: string, subtitle: string): Promise<Pdf> {
  const b64 = await loadCyrillicFontB64();
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.addFileToVFS("DejaVuSans.ttf", b64);
  doc.addFont("DejaVuSans.ttf", "DejaVu", "normal");
  doc.setFont("DejaVu", "normal");

  const M = 48;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const maxWidth = pw - M * 2;
  let y = M + 10;

  const ensure = (needed: number) => {
    if (y + needed <= ph - M - 24) return;
    doc.addPage();
    doc.setFont("DejaVu", "normal");
    y = M + 10;
  };

  const write = (text: string, size: number, indent: number, muted: boolean) => {
    doc.setFontSize(size);
    doc.setTextColor(muted ? 110 : 25);
    const lines = doc.splitTextToSize(text, maxWidth - indent) as string[];
    for (const line of lines) {
      ensure(size + 6);
      doc.text(line, M + indent, y);
      y += size + 5;
    }
  };

  write(title, 20, 0, false);
  y += 4;
  write(subtitle, 10, 0, true);
  y += 10;

  return {
    doc,
    heading(text, size = 14) {
      y += 10;
      ensure(size + 14);
      write(text, size, 0, false);
      y += 2;
    },
    para(text, opts = {}) {
      write(text, opts.size ?? 11, opts.indent ?? 0, opts.muted ?? false);
    },
    quote(text) {
      write(`„${text}“`, 10, 14, true);
    },
    gap(h = 8) {
      y += h;
    },
    finish() {
      const pages = doc.getNumberOfPages();
      for (let p = 1; p <= pages; p += 1) {
        doc.setPage(p);
        doc.setFont("DejaVu", "normal");
        doc.setFontSize(8);
        doc.setTextColor(130);
        doc.text(NOT_LEGAL_ADVICE, M, ph - M + 10, { maxWidth: maxWidth - 40 });
        doc.text(`${p} / ${pages}`, pw - M, ph - M + 14, { align: "right" });
      }
      return doc.output("blob");
    },
  };
}

function spanPlace(span: { page?: number | null; section?: string | null }): string {
  const parts: string[] = [];
  if (span.section) parts.push(span.section);
  if (typeof span.page === "number") parts.push(`стр. ${span.page}`);
  return parts.length > 0 ? parts.join(", ") : "в текста на документа";
}

/** Пълният доклад от проверката: заключение, находки с извадки и раздели. */
export async function buildReviewReportPdf(
  result: ContractCheckResult | ContractImproveResult | NegotiationPackageResult,
): Promise<Blob> {
  const p = result.payload;
  const pdf = await createPdf(p.passport.title, `${p.passport.document_type} — подробна проверка`);

  pdf.heading("Заключение");
  pdf.para(p.executive_summary);

  pdf.heading("Данни за документа");
  for (const party of p.passport.parties) {
    pdf.para(`${party.role}: ${party.name ?? "не е посочено в текста"}`);
  }
  if (p.passport.governing_law) pdf.para(`Приложимо право: ${p.passport.governing_law}`);
  if (p.passport.signature_state) pdf.para(`Подписи: ${p.passport.signature_state}`);

  if (p.priority_summary.length > 0) {
    pdf.heading("Най-важното");
    for (const item of [...p.priority_summary].sort((a, b) => a.rank - b.rank)) {
      pdf.para(`${item.rank}. ${item.reason}`);
    }
  }

  pdf.heading(`Находки (${p.findings.length})`);
  if (p.findings.length === 0) {
    pdf.para("Не са открити проблеми в проверените части на документа.");
  }
  for (const f of p.findings) {
    pdf.gap(4);
    pdf.para(`${SEVERITY_LABELS_BG[f.severity]} — ${f.title}`, { size: 12 });
    pdf.para(f.explanation);
    pdf.para(`Какво следва: ${f.consequence}`);
    pdf.para(`Какво да направите: ${f.next_step}`);
    pdf.para(`Място: ${spanPlace(f.span)}`, { muted: true });
    pdf.quote(f.span.excerpt);
  }

  if (p.obligations.length > 0) {
    pdf.heading("Задължения");
    for (const o of p.obligations) {
      pdf.para(`${PARTY_LABELS_BG[o.party]}: ${o.summary}${o.deadline ? ` (срок: ${o.deadline})` : ""}`);
    }
  }

  if (p.economic_terms.length > 0) {
    pdf.heading("Пари, срокове и неустойки");
    for (const t of p.economic_terms) {
      pdf.para(`${ECONOMIC_KIND_LABELS_BG[t.kind]} — ${t.label}: ${t.value_text}`);
    }
  }

  pdf.heading("Прекратяване");
  pdf.para(p.termination.summary);
  pdf.heading("Спорове");
  pdf.para(p.disputes.summary);

  if (p.contradictions.length > 0) {
    pdf.heading("Противоречия в текста");
    for (const c of p.contradictions) pdf.para(c.summary);
  }

  if (p.missing_protections.length > 0) {
    pdf.heading("Липсващи защити");
    for (const m of p.missing_protections) {
      pdf.para(`${m.title} — ${m.why_it_matters}`);
      pdf.para(`Какво следва: ${m.consequence}`, { muted: true });
    }
  }

  if (p.questions.length > 0) {
    pdf.heading("Въпроси преди подпис");
    for (const q of p.questions) pdf.para(`${q.question} — ${q.why}`);
  }

  return pdf.finish();
}

/** Поправеният документ като PDF — точният текст, без добавки. */
export async function buildCorrectedPdf(title: string, correctedText: string): Promise<Blob> {
  const pdf = await createPdf(title, "Документ с приетите поправки");
  for (const block of correctedText.split("\n")) {
    if (block.trim().length === 0) {
      pdf.gap(6);
      continue;
    }
    pdf.para(block);
  }
  return pdf.finish();
}

/** Отчет за промените: прието, отказано, подход, преди и след, място. */
export async function buildChangeReportPdf(input: {
  readonly title: string;
  readonly applied: readonly AppliedCorrection[];
  readonly rejected: readonly { readonly id: string; readonly title: string }[];
  readonly corrections: readonly { readonly id: string; readonly title: string; readonly span: { page?: number | null; section?: string | null } }[];
}): Promise<Blob> {
  const pdf = await createPdf(input.title, "Отчет за приетите и отказаните поправки");
  const byId = new Map(input.corrections.map((c) => [c.id, c]));

  pdf.heading(`Приети поправки (${input.applied.length})`);
  if (input.applied.length === 0) pdf.para("Няма приети поправки.");
  for (const a of input.applied) {
    const meta = byId.get(a.correction_id);
    pdf.gap(4);
    pdf.para(`${meta?.title ?? "Поправка"} — подход: ${STRATEGY_LABELS_BG[a.strategy]}`, { size: 12 });
    pdf.para(`Място: ${meta ? spanPlace(meta.span) : "в текста на документа"}`, { muted: true });
    pdf.para("Преди:");
    pdf.quote(a.original_text);
    pdf.para("След:");
    pdf.quote(a.replacement_text);
  }

  pdf.heading(`Отказани поправки (${input.rejected.length})`);
  if (input.rejected.length === 0) pdf.para("Няма отказани поправки.");
  for (const r of input.rejected) pdf.para(r.title);

  pdf.heading("Забележка за оформлението");
  pdf.para(
    "Поправеният файл съдържа текста на документа. Оригиналното оформление, таблици и стилове от Вашия файл не се пренасят.",
  );
  return pdf.finish();
}

/** Записка за преговори: цели, червени линии, действия и двете писма. */
export async function buildNegotiationBriefPdf(result: NegotiationPackageResult): Promise<Blob> {
  const p = result.payload;
  const pdf = await createPdf(p.passport.title, "Записка за преговори");

  const list = (heading: string, items: readonly string[]) => {
    if (items.length === 0) return;
    pdf.heading(heading);
    for (const item of items) pdf.para(`• ${item}`);
  };

  pdf.heading("Какво целим");
  pdf.para(p.executive_summary);
  list("Цели", p.objectives);
  list("Червени линии", p.red_lines);
  list("Приемливи отстъпки", p.acceptable_concessions);
  list("Резервни варианти", p.fallbacks);
  list("Въпроси към отсрещната страна", p.negotiation_questions);

  if (p.actions.length > 0) {
    pdf.heading("Действия и срокове");
    for (const a of p.actions) {
      pdf.para(
        `${a.action} — отговорник: ${a.owner}${a.due ? `, срок: ${a.due}` : ""} (${SEVERITY_LABELS_BG[a.priority]})`,
      );
    }
  }

  pdf.heading("Писма");
  for (const m of p.messages) {
    pdf.gap(4);
    pdf.para(TONE_LABELS_BG[m.tone], { size: 12 });
    pdf.para(`Тема: ${m.subject}`);
    pdf.para(m.body);
  }
  return pdf.finish();
}

/* -------------------------------- DOCX слой -------------------------------- */

/** Поправеният документ като DOCX. Текстът е точно поправеният текст. */
export async function buildCorrectedDocx(title: string, correctedText: string): Promise<Blob> {
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: title, bold: true, size: 30, font: "Arial" })],
      spacing: { after: 240 },
    }),
  ];
  for (const line of correctedText.split("\n")) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: line, size: 24, font: "Arial" })],
        spacing: { after: 120 },
      }),
    );
  }
  children.push(
    new Paragraph({
      children: [new TextRun({ text: NOT_LEGAL_ADVICE, italics: true, size: 18, font: "Arial" })],
      spacing: { before: 360 },
    }),
  );
  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 24 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBlob(doc);
}

/** Проверка, че резултатът е за очаквания продукт, преди да се строи файл. */
export function isProductResult<T extends ReadyProductResult["product_id"]>(
  result: ReadyProductResult,
  productId: T,
): result is Extract<ReadyProductResult, { product_id: T }> {
  return result.product_id === productId;
}
