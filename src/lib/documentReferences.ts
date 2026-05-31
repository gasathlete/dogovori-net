// Document type registry + reference detection in generated text.

export type DocumentTypeId =
  | "contract"
  | "receipt"           // Разписка
  | "power_of_attorney" // Пълномощно
  | "declaration"       // Декларация
  | "complaint"         // Жалба
  | "claim"             // Искова молба
  | "notary_invitation" // Нотариална покана
  | "offer"             // Оферта
  | "invoice"           // Фактура
  | "protocol"          // Протокол
  | "appendix"          // Приложение
  | "annex"             // Анекс
  | "agreement"         // Споразумение
  | "smr"               // Строително-монтажни работи
  | "kss";              // Количествено стойностна сметка

export interface DocumentTypeDef {
  id: DocumentTypeId;
  label: string;
  shortLabel: string;
  group: "contracts" | "personal" | "legal" | "commercial" | "addons" | "construction";
  description: string;
  needsParties: boolean;
}

export const DOCUMENT_TYPES: DocumentTypeDef[] = [
  { id: "contract",          label: "Договор",                      shortLabel: "Договор",         group: "contracts",    description: "Двустранен договор по ЗЗД/ТЗ",                       needsParties: true  },
  { id: "agreement",         label: "Споразумение",                 shortLabel: "Споразумение",    group: "contracts",    description: "Споразумение между страни",                          needsParties: true  },
  { id: "appendix",          label: "Приложение",                   shortLabel: "Приложение",      group: "addons",       description: "Приложение към основен договор",                     needsParties: true  },
  { id: "annex",             label: "Анекс",                        shortLabel: "Анекс",           group: "addons",       description: "Анекс/изменение към договор",                        needsParties: true  },
  { id: "protocol",          label: "Протокол",                     shortLabel: "Протокол",        group: "addons",       description: "Приемо-предавателен или констативен протокол",       needsParties: true  },
  { id: "receipt",           label: "Разписка",                     shortLabel: "Разписка",        group: "personal",     description: "Разписка за получена сума/вещ",                      needsParties: true  },
  { id: "power_of_attorney", label: "Пълномощно",                   shortLabel: "Пълномощно",      group: "personal",     description: "Пълномощно (обикновено/нотариално)",                 needsParties: true  },
  { id: "declaration",       label: "Декларация",                   shortLabel: "Декларация",      group: "personal",     description: "Декларация по образец/свободен текст",               needsParties: false },
  { id: "complaint",         label: "Жалба",                        shortLabel: "Жалба",           group: "legal",        description: "Жалба до институция/съд",                            needsParties: false },
  { id: "claim",             label: "Искова молба",                 shortLabel: "Искова молба",    group: "legal",        description: "Искова молба по ГПК",                                needsParties: true  },
  { id: "notary_invitation", label: "Нотариална покана",            shortLabel: "Нот. покана",     group: "legal",        description: "Нотариална покана по чл. 50 ЗННД",                   needsParties: true  },
  { id: "offer",             label: "Оферта",                       shortLabel: "Оферта",          group: "commercial",   description: "Търговска оферта",                                   needsParties: true  },
  { id: "invoice",           label: "Фактура",                      shortLabel: "Фактура",         group: "commercial",   description: "Данъчна/проформа фактура",                            needsParties: true  },
  { id: "smr",               label: "СМР — Строително-монтажни работи", shortLabel: "СМР",         group: "construction", description: "Описание/протокол за СМР",                            needsParties: true  },
  { id: "kss",               label: "КСС — Количествено-стойностна сметка", shortLabel: "КСС",     group: "construction", description: "Количествено-стойностна сметка по ЗУТ",              needsParties: true  },
];

export const DOCUMENT_TYPE_GROUPS: { id: DocumentTypeDef["group"]; label: string }[] = [
  { id: "contracts",    label: "Договори и споразумения" },
  { id: "addons",       label: "Приложения, анекси, протоколи" },
  { id: "personal",     label: "Лични документи (разписки, пълномощни, декларации)" },
  { id: "legal",        label: "Жалби, искови молби, нотариални покани" },
  { id: "commercial",   label: "Търговски (оферти, фактури)" },
  { id: "construction", label: "Строителство (СМР, КСС)" },
];

export function getDocumentType(id: string | null | undefined): DocumentTypeDef {
  return DOCUMENT_TYPES.find((d) => d.id === id) ?? DOCUMENT_TYPES[0];
}

// ----------------- Reference detection -----------------

export type RefType = "appendix" | "annex" | "offer" | "protocol" | "specification" | "kss" | "smr";

export interface DetectedReference {
  id: string;               // stable id "type-number"
  type: RefType;
  number: number | null;
  label: string;            // raw match e.g. "Приложение № 1"
  displayLabel: string;     // normalized e.g. "Приложение № 1"
  documentTypeId: DocumentTypeId; // mapping for /build prefill
  contextSentence?: string;
}

// JS \b doesn't recognize Cyrillic letters as word characters even with /u,
// so we use explicit lookarounds that include the Cyrillic range.
const LB = "(?<![A-Za-z\\u0400-\\u04FF])";
const LA = "(?![A-Za-z\\u0400-\\u04FF])";
const PATTERNS: { type: RefType; documentTypeId: DocumentTypeId; regex: RegExp; labelPrefix: string }[] = [
  { type: "appendix",      documentTypeId: "appendix", labelPrefix: "Приложение",   regex: new RegExp(`${LB}Приложени[ея]\\s*(?:№|N|номер)?\\s*(\\d{1,3})${LA}`, "giu") },
  { type: "annex",         documentTypeId: "annex",    labelPrefix: "Анекс",        regex: new RegExp(`${LB}Анекс\\s*(?:№|N|номер)?\\s*(\\d{1,3})${LA}`, "giu") },
  { type: "offer",         documentTypeId: "offer",    labelPrefix: "Оферта",       regex: new RegExp(`${LB}Оферт[аи]\\s*(?:№|N|номер)?\\s*(\\d{1,3})${LA}`, "giu") },
  { type: "protocol",      documentTypeId: "protocol", labelPrefix: "Протокол",     regex: new RegExp(`${LB}Протокол\\s*(?:№|N|номер)?\\s*(\\d{1,3})${LA}`, "giu") },
  { type: "specification", documentTypeId: "appendix", labelPrefix: "Спецификация", regex: new RegExp(`${LB}Спецификаци[яи]\\s*(?:№|N|номер)?\\s*(\\d{1,3})${LA}`, "giu") },
  { type: "kss",           documentTypeId: "kss",      labelPrefix: "КСС",          regex: new RegExp(`${LB}КСС(?:\\s*(?:№|N|номер)?\\s*(\\d{1,3}))?${LA}`, "gu") },
  { type: "smr",           documentTypeId: "smr",      labelPrefix: "СМР",          regex: new RegExp(`${LB}СМР(?:\\s*(?:№|N|номер)?\\s*(\\d{1,3}))?${LA}`, "gu") },
];

function sentenceAround(full: string, idx: number): string {
  const start = Math.max(0, full.lastIndexOf(".", idx - 1) + 1);
  const endIdx = full.indexOf(".", idx);
  const end = endIdx === -1 ? Math.min(full.length, idx + 160) : endIdx + 1;
  return full.slice(start, end).trim().replace(/\s+/g, " ");
}

export function detectReferences(text: string): DetectedReference[] {
  const map = new Map<string, DetectedReference>();
  for (const p of PATTERNS) {
    p.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.regex.exec(text)) !== null) {
      const num = m[1] ? Number(m[1]) : null;
      const id = `${p.type}-${num ?? "x"}`;
      if (map.has(id)) continue;
      const displayLabel = num ? `${p.labelPrefix} № ${num}` : p.labelPrefix;
      map.set(id, {
        id,
        type: p.type,
        number: num,
        label: m[0],
        displayLabel,
        documentTypeId: p.documentTypeId,
        contextSentence: sentenceAround(text, m.index),
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => (a.number ?? 99) - (b.number ?? 99));
}

export function collectContractText(contract: {
  title?: string; preamble?: string;
  clauses?: { number: string; title: string; body: string }[];
  closing?: string;
} | null | undefined): string {
  if (!contract) return "";
  const parts: string[] = [];
  if (contract.title) parts.push(contract.title);
  if (contract.preamble) parts.push(contract.preamble);
  (contract.clauses ?? []).forEach((c) => parts.push(`${c.number} ${c.title}\n${c.body}`));
  if (contract.closing) parts.push(contract.closing);
  return parts.join("\n\n");
}
