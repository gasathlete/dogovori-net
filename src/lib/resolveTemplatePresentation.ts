/**
 * Резолюция на съдържанието на страницата `/shablon/:slug`.
 *
 * ЗАЩО: генерираното (AI) съдържание в `src/data/templateContent/` не е
 * юридически ревизирано. За НЕдоговорните видове документи то често внася
 * договорни или абсолютни правни твърдения (подпис/печат върху фактура,
 * „всяка доставка изисква фактура“, безусловна нотариална заверка, „всички
 * актове се подписват от…“). Ревизираният type-aware fallback
 * (`buildTemplateFallbackContent`) вече дава коректните, условни формулировки.
 *
 * ПРАВИЛО (детерминистична граница, без regex филтри по елементи):
 *  - за защитените видове: `requirements`, `mistakes` и `faq` идват ИЗЦЯЛО от
 *    fallback-а; полезните `intro` и `usageCases` от AI се запазват;
 *  - за договор / споразумение / анекс: поведението остава непроменено —
 *    AI съдържанието има предимство пред fallback-а.
 *
 * Тук НЕ се въвежда нов тип-регистър: класификацията идва от
 * `fallback.documentType` и `fallback.unilateral`.
 */

import type { TemplateContent } from "@/data/templateContentTypes";
import type { DocumentTypeId } from "@/lib/documentReferences";
import type { FaqItem, TemplateFallbackContent } from "@/lib/templateFallbackContent";

/** Видове документи, при които правните раздели НЕ се вземат от AI съдържание. */
export const PROTECTED_DOCUMENT_TYPES: readonly DocumentTypeId[] = [
  "power_of_attorney",
  "receipt",
  "invoice",
  "offer",
  "protocol",
  "appendix",
  "claim",
  "smr",
  "kss",
  "declaration",
  "complaint",
  "notary_invitation",
];

const PROTECTED_SET = new Set<string>(PROTECTED_DOCUMENT_TYPES);

/** true когато правните раздели трябва да идват само от ревизирания fallback. */
export function isProtectedFallback(fallback: TemplateFallbackContent): boolean {
  return fallback.unilateral === true || PROTECTED_SET.has(fallback.documentType);
}

export interface ResolvedTemplatePresentation {
  /** true когато правните раздели са взети от ревизирания fallback. */
  guarded: boolean;
  /** AI intro, когато е налично (иначе undefined — страницата ползва meta excerpt). */
  intro?: string;
  usageCases: string[];
  requirements: string[];
  mistakes: string[];
  faq: FaqItem[];
}

function nonEmpty(v: string | undefined | null): string | undefined {
  const t = v?.trim();
  return t ? v ?? undefined : undefined;
}

function nonEmptyList<T>(v: T[] | undefined | null): T[] | undefined {
  return Array.isArray(v) && v.length > 0 ? v : undefined;
}

/**
 * Чиста функция — без странични ефекти и без достъп до данни/мрежа.
 * `ai` е заредено генерирано съдържание (или undefined, докато зарежда).
 */
export function resolveTemplatePresentation(
  ai: TemplateContent | undefined,
  fallback: TemplateFallbackContent,
): ResolvedTemplatePresentation {
  const guarded = isProtectedFallback(fallback);

  const intro = nonEmpty(ai?.intro);
  const usageCases = nonEmptyList(ai?.usageCases) ?? fallback.usageCases;

  if (guarded) {
    return {
      guarded: true,
      intro,
      usageCases,
      requirements: fallback.requirements,
      mistakes: fallback.mistakes,
      faq: fallback.faq,
    };
  }

  return {
    guarded: false,
    intro,
    usageCases,
    requirements: ai?.requirements ?? fallback.requirements,
    mistakes: ai?.mistakes ?? fallback.mistakes,
    faq: ai?.faq ?? fallback.faq,
  };
}
