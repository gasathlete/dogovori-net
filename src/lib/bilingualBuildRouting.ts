import type { DocumentTypeId } from "@/lib/documentReferences";

interface ResolveBuildSectorInput {
  bilingual?: boolean;
  docName?: string | null;
  sectorId?: string | null;
  documentType?: DocumentTypeId | string | null;
}

export function resolveBuildSectorId({ bilingual, docName, sectorId, documentType }: ResolveBuildSectorInput): string {
  if (!bilingual) return sectorId || "services";

  const source = `${docName ?? ""} ${documentType ?? ""}`.toLowerCase();

  if (/трудов|employment offer|служител|работодател|кт\b/.test(source)) return "employment";
  if (/наем|lease|tenant|landlord|commercial lease|жилище|офис/.test(source)) return "real-estate";
  if (/nda|confidential|non-disclosure|gdpr|data processing|dpa/.test(source)) return "ip";
  if (/пълномощ|power of attorney/.test(source)) return "power-of-attorney";
  if (/заем|loan|term sheet|invoice|pro forma/.test(source)) return "finance";
  if (/share purchase|spa|shareholders|sha|съдруж|акци/.test(source)) return "corporate";
  if (/saas|software license|master services|sow|api|source code|software/.test(source)) return "digital";
  if (/дистрибутор|distribution|agency|agent|cisg|продажба на стоки/.test(source)) return "trade";
  if (/консулт|consulting|service agreement|изработка/.test(source)) return "services";

  return sectorId || "services";
}

export function isBilingualDocumentName(docName?: string | null): boolean {
  const value = (docName ?? "").toLowerCase();
  return value.includes("двуезич") || value.includes("bg/en");
}