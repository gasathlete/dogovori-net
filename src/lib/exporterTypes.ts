/**
 * Shared types for PDF and DOCX exporters. Lives in its own file so
 * type-only imports never pull the heavy jspdf/docx runtime modules
 * into a consumer's chunk.
 */

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

export interface WatermarkOpts {
  watermark: true;
  userTag?: string;
}

export const fileBase = (title: string): string =>
  title
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60) || "Dogovor";

export const dataUrlToUint8 = (dataUrl: string): Uint8Array => {
  const base64 = dataUrl.split(",")[1] || "";
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
};
