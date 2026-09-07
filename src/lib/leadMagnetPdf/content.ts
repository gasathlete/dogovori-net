import type { LeadMagnetSlug } from "../leadMagnets";
import { LEAD_MAGNETS } from "../leadMagnets";
import type { LeadMagnetPdfDocument, PdfBlock } from "./types";
import { RENT_RED_FLAGS_PDF } from "./content.rent";
import { LABOR_CHECKLIST_2026_PDF } from "./content.labor";
import {
  LEAD_MAGNET_PDF_DISCLAIMER,
  LEAD_MAGNET_PDF_DISCLAIMER_LONG,
  LEAD_MAGNET_PDF_RECAP_HEADING,
  LEAD_MAGNET_PDF_RECAP_INTRO,
  LEAD_MAGNET_PDF_REVIEWED_LINE,
} from "./common";

export { RENT_RED_FLAGS_PDF, LABOR_CHECKLIST_2026_PDF };

/** Всички PDF наръчници по slug (същите slug-ове като в `LEAD_MAGNETS`). */
export const LEAD_MAGNET_PDF_DOCUMENTS: Record<LeadMagnetSlug, LeadMagnetPdfDocument> = {
  "rent-red-flags": RENT_RED_FLAGS_PDF,
  "labor-checklist-2026": LABOR_CHECKLIST_2026_PDF,
};

/** Публичен път на файла (в `public/`) за даден наръчник — взима се от регистъра `LEAD_MAGNETS`. */
export function leadMagnetPublicPath(slug: LeadMagnetSlug): string {
  const entry = Object.values(LEAD_MAGNETS).find((m) => m.slug === slug);
  if (!entry) throw new Error(`Няма lead magnet със slug "${slug}" в LEAD_MAGNETS`);
  return entry.fileUrl;
}

function blockTexts(block: PdfBlock): string[] {
  switch (block.kind) {
    case "paragraph":
      return [block.text];
    case "callout":
      return [block.title ?? "", block.text];
    case "checklist":
    case "bullets":
    case "fields":
      return [block.title ?? "", ...block.items];
    case "template":
      return [block.title, ...block.lines, block.note ?? ""];
  }
}

/**
 * Всички текстови низове на документа в реда на показване — включително
 * общите редове (disclaimer, дата на проверка), които рендерът добавя сам.
 * Използва се за одита в тестовете и за проверката в генератора.
 */
export function collectLeadMagnetTexts(doc: LeadMagnetPdfDocument): string[] {
  const out: string[] = [
    doc.eyebrow,
    doc.title,
    doc.subtitle,
    LEAD_MAGNET_PDF_REVIEWED_LINE,
    LEAD_MAGNET_PDF_DISCLAIMER,
    LEAD_MAGNET_PDF_DISCLAIMER_LONG,
    ...doc.intro,
    doc.howToUse,
    doc.sectionsHeading,
  ];
  for (const s of doc.sections) {
    out.push(`${s.number}. ${s.title}`, s.lead);
    for (const b of s.blocks) out.push(...blockTexts(b));
  }
  if (doc.appendix) {
    out.push(doc.appendix.title);
    for (const b of doc.appendix.blocks) out.push(...blockTexts(b));
  }
  out.push(doc.whenLawyer.title, doc.whenLawyer.intro, ...doc.whenLawyer.items, doc.whenLawyer.outro);
  out.push(LEAD_MAGNET_PDF_RECAP_HEADING, LEAD_MAGNET_PDF_RECAP_INTRO);
  out.push(doc.sources.title, doc.sources.intro);
  for (const s of doc.sources.items) out.push(s.label, s.url);
  out.push(doc.cta.title, doc.cta.text, doc.cta.url, doc.cta.note);
  out.push(doc.metadata.subject, ...doc.metadata.keywords);
  return out.filter((t) => t.length > 0);
}

/** Всички URL адреси, които документът показва (източници + CTA). */
export function collectLeadMagnetUrls(doc: LeadMagnetPdfDocument): string[] {
  return [...doc.sources.items.map((s) => s.url), doc.cta.url];
}
