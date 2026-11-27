import type { DocumentTypeId } from "@/lib/documentReferences";
import topData from "./catalog.top.json";
import catData from "./catalog.categories.json";

export interface CatalogDocument {
  name: string;
  purpose: string;
  keyClause: string;
  badge?: "NEW" | "TOP" | "ПРО";
  /** Optional override; when missing, inferred from name via inferDocumentType. */
  documentType?: DocumentTypeId;
  /** When true, the document is generated in two languages (BG + EN). */
  bilingual?: boolean;
}

export interface CatalogCategory {
  id: string;
  number: string;
  title: string;
  icon: string;
  intro: string;
  sectorId: string;
  documents: CatalogDocument[];
  companions?: string[];
}

// Data lives in JSON to keep this TS surface small. Public API is unchanged.
export const TOP_DOCUMENTS: { name: string; description: string; categoryId: string; sectorId: string }[] =
  topData as { name: string; description: string; categoryId: string; sectorId: string }[];

export const CATALOG: CatalogCategory[] = catData as CatalogCategory[];

export function getCategory(id: string) {
  return CATALOG.find((c) => c.id === id);
}

// Merge programmatically-generated templates into the static CATALOG.
// Keeps the static section human-editable while new bulk additions live in
// src/data/newTemplates.ts.
import { NEW_TEMPLATES } from "./newTemplates";
for (const { categoryId, doc } of NEW_TEMPLATES) {
  const cat = CATALOG.find((c) => c.id === categoryId);
  if (cat) cat.documents.push(doc);
}
