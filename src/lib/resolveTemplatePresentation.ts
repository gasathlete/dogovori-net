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
 *  - за защитените видове: ЦЯЛОТО съдържание (`intro`, `usageCases`,
 *    `requirements`, `mistakes`, `faq`) идва от fallback-а; AI intro/usageCases
 *    не се показват никъде — нито във видимия текст, нито в структурираните данни;
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
  /** true когато ЦЯЛОТО съдържание е взето от ревизирания fallback. */
  guarded: boolean;
  /**
   * AI intro — само за НЕзащитените видове. При защитените е винаги undefined:
   * генерираният текст съдържа неревизирани правни твърдения („осигурява
   * валидност и правно значение"), затова страницата ползва само безопасната
   * каталожна цел на документа.
   */
  intro?: string;
  usageCases: string[];
  requirements: string[];
  mistakes: string[];
  faq: FaqItem[];
}

/**
 * Чиста функция — без странични ефекти и без достъп до данни/мрежа.
 * `ai` е заредено генерирано съдържание (или undefined, докато зарежда).
 *
 * ВАЖНО: за НЕзащитените видове се използва точната legacy nullish семантика
 * (`??`), т.е. изрично налична празна стойност се запазва байт-по-байт.
 */
export function resolveTemplatePresentation(
  ai: TemplateContent | undefined,
  fallback: TemplateFallbackContent,
): ResolvedTemplatePresentation {
  const guarded = isProtectedFallback(fallback);

  if (guarded) {
    return {
      guarded: true,
      intro: undefined,
      usageCases: fallback.usageCases,
      requirements: fallback.requirements,
      mistakes: fallback.mistakes,
      faq: fallback.faq,
    };
  }

  const intro = ai?.intro ?? undefined;
  const usageCases = ai?.usageCases ?? fallback.usageCases;



  return {
    guarded: false,
    intro,
    usageCases,
    requirements: ai?.requirements ?? fallback.requirements,
    mistakes: ai?.mistakes ?? fallback.mistakes,
    faq: ai?.faq ?? fallback.faq,
  };
}

export interface TemplatePageDescriptionInput {
  docName: string;
}

/** Максимална дължина на meta description (Unicode кодови точки). */
export const TEMPLATE_META_MAX = 160;

const DESCRIPTION_SUFFIX =
  " — онлайн образец на български. Попълнете и прегледайте без регистрация; PDF/DOCX след вход според плана.";

/** Бюджет за името на документа, така че целият низ да остане ≤ 160 знака. */
const NAME_BUDGET = TEMPLATE_META_MAX - [...DESCRIPTION_SUFFIX].length;

/**
 * Съкращаване по граница на дума (никога в средата на дума), с многоточие само
 * когато реално е отрязано. Работи по Unicode кодови точки.
 */
export function truncateOnWordBoundary(text: string, max: number): string {
  const chars = [...text.trim()];
  if (chars.length <= max) return chars.join("");
  // Оставяме място за многоточието.
  const slice = chars.slice(0, Math.max(1, max - 1)).join("");
  const cut = slice.replace(/[\s—–-]+\S*$/u, "").trimEnd();
  const base = (cut.length > 0 ? cut : slice.trimEnd()).replace(/[\s,.;:—–-]+$/u, "");
  return `${base}…`;
}

/**
 * Meta description + Article JSON-LD description за `/shablon/:slug`.
 *
 * Честност (Organic 2): страницата НЕ обещава безплатно изтегляне и НЕ дава
 * времево обещание — експортът зависи от вход и план. Детерминистичен низ само
 * от каноничното име на документа, без сглобяване на генериран excerpt.
 */
export function buildTemplatePageDescription({ docName }: TemplatePageDescriptionInput): string {
  const name = truncateOnWordBoundary(docName, NAME_BUDGET);
  return `${name}${DESCRIPTION_SUFFIX}`;
}


