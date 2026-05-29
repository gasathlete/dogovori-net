// Infers a DocumentTypeId from a document name when not explicitly tagged.
// Order matters — more specific patterns must come before generic "Договор".

import type { DocumentTypeId } from "@/lib/documentReferences";

const RULES: { type: DocumentTypeId; re: RegExp }[] = [
  { type: "kss",               re: /\bКСС\b|количествено[-\s]стойностна/i },
  { type: "smr",               re: /\bСМР\b|строително[-\s]монтажни|акт\s*обр?\.?\s*1[259]\b/i },
  { type: "notary_invitation", re: /нотариална\s+покана/i },
  { type: "claim",             re: /искова\s+молба|заповед(но|за\s+изпълнение)/i },
  { type: "complaint",         re: /^жалба|\bжалба\b/i },
  { type: "power_of_attorney", re: /пълномощно/i },
  { type: "declaration",       re: /деклараци[яи]/i },
  { type: "receipt",           re: /^разписка|\bразписка\b/i },
  { type: "invoice",           re: /фактура|кредитно\s+известие|дебитно\s+известие/i },
  { type: "offer",             re: /^оферта|\bоферта\b|проформа/i },
  { type: "protocol",          re: /протокол|приемо[-\s]предавателен/i },
  { type: "annex",             re: /^анекс|\bанекс\b/i },
  { type: "appendix",          re: /^приложение|спецификация|техническо\s+задание|ценоразпис|sla/i },
  { type: "agreement",         re: /споразумение|memorandum|меморандум/i },
  { type: "contract",          re: /договор|EULA|лицензионен/i },
];

export function inferDocumentType(name: string): DocumentTypeId {
  for (const r of RULES) if (r.re.test(name)) return r.type;
  return "contract";
}
