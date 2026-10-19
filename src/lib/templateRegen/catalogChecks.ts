/**
 * Каталожни проверки върху пълния текст на шаблон. Чисти функции, без I/O.
 *
 * Правилата пренасят общите дефекти от правния доклад 01 (12.10.2026) към
 * целия каталог. Те НЕ доказват правна коректност: всяко позоваване остава
 * „нуждае се от източник“, докато не бъде сверено с прочетен актуален текст.
 */
import type { Finding, FindingCategory, FindingSeverity } from "./types";

interface Rule {
  id: string;
  severity: FindingSeverity;
  category: FindingCategory;
  message: string;
  pattern: RegExp;
  /** Допълнително условие върху изречението, в което е намерено съвпадението. */
  sentenceMust?: RegExp;
  sentenceMustNot?: RegExp;
  /** Условие върху целия документ. */
  documentMust?: RegExp;
}

const LAW = "(?:от\\s+)?(?:Закона\\s+за\\s+задълженията\\s+и\\s+договорите(?:\\s*\\(ЗЗД\\))?|ЗЗД)";
const TZ = "(?:от\\s+)?(?:Търговския\\s+закон(?:\\s*\\(ТЗ\\))?|ТЗ)";

export const CATALOG_RULES: readonly Rule[] = [
  {
    id: "ZZD_228_PARA2",
    severity: "legal_error",
    category: "wrong_citation",
    message: "Позоваване на чл. 228, ал. 2 ЗЗД като основание за прекратяване; според доклада чл. 228 няма ал. 2 и не урежда прекратяване.",
    pattern: new RegExp(`чл(?:ен|\\.)\\s*228,?\\s*ал(?:инея|\\.)\\s*2\\s*${LAW}`, "giu"),
  },
  {
    id: "ZZD_325_TERMINATION",
    severity: "legal_error",
    category: "wrong_citation",
    message: "Чл. 325 ЗЗД е посочен като основание; според доклада разпоредбата е отменена и не урежда прекратяване по взаимно съгласие.",
    pattern: new RegExp(`чл\\.\\s*325(?:,\\s*ал\\.\\s*\\d+)?\\s*${LAW}`, "giu"),
  },
  {
    id: "TZ_154_FOUNDING",
    severity: "legal_error",
    category: "wrong_citation",
    message: "Чл. 154 ТЗ (прекратяване) е посочен като основание за учредяване.",
    pattern: new RegExp(`чл\\.\\s*154\\s*${TZ}`, "giu"),
    sentenceMust: /учред/iu,
    sentenceMustNot: /прекрат/iu,
  },
  {
    id: "TZ_113_PARA2",
    severity: "legal_error",
    category: "wrong_citation",
    message: "Позоваване на чл. 113, ал. 2 ТЗ; според доклада чл. 113 няма ал. 2.",
    pattern: new RegExp(`чл\\.\\s*113,?\\s*ал\\.\\s*2\\s*${TZ}`, "giu"),
  },
  {
    id: "ZZD_232_RETURN",
    severity: "legal_error",
    category: "wrong_citation",
    message: "Връщането на наетата вещ е свързано с чл. 232 ЗЗД; според доклада връщането е в чл. 233.",
    pattern: new RegExp(`чл\\.\\s*232\\s*${LAW}`, "giu"),
    sentenceMust: /(предад|върн|връщ)/iu,
  },
  {
    id: "OWNER_LIABILITY_TO_CAPITAL",
    severity: "legal_error",
    category: "absolute_legal_claim",
    message: "Внушава лична отговорност на собственика към кредиторите до размера на капитала.",
    pattern: /собственик[^.]{0,60}отговаря до размера на внесения/giu,
  },
  {
    id: "AUTOMATIC_PAYMENT_ADMISSION",
    severity: "material_risk",
    category: "automatic_payment_admission",
    message: "Предварително написано признание, че всички дължими суми са платени.",
    pattern: /(са\s+изплатени\s+всички|изплатени\s+са\s+всички|напълно\s+изплатен[аио]?)/giu,
  },
  {
    id: "BLANKET_WAIVER",
    severity: "material_risk",
    category: "blanket_waiver",
    message: "Общо изявление за липса на претенции/отказ от претенции без конкретен обхват.",
    pattern: /(нямат\s+(?:никакви\s+)?(?:други\s+)?(?:взаимни\s+)?претенции|липсата\s+на\s+претенции|отказва(?:т)?\s+се\s+от\s+(?:всички|всякакви)\s+(?:свои\s+)?(?:права|претенции))/giu,
    sentenceMustNot: /не\s+удостоверява\s+обща\s+липса/iu,
  },
  {
    id: "WISH_INSTEAD_OF_DECLARATION",
    severity: "material_risk",
    category: "ambiguous_declaration",
    message: "„Желая да прекратя“ може да се тълкува като предложение, а не окончателно изявление.",
    pattern: /желая\s+да\s+прекратя/giu,
  },
  {
    id: "ROLE_SWAP_RETURN_REQUEST",
    severity: "legal_error",
    category: "role_swap",
    message: "Документът допуска автор наемател, но иска от адресата да „предаде“ имота — роли разменени при автор наемател.",
    pattern: /моля\s+да\s+предадете\s+имота/giu,
    documentMust: /Наемодател\/Наемател/u,
  },
  {
    id: "VAGUE_DEADLINE",
    severity: "conditional_risk",
    category: "vague_deadline",
    message: "Неопределен срок без начало и продължителност.",
    pattern: /(в\s+разумен\s+срок|в\s+кратък\s+срок|възможно\s+най-скоро|в\s+най-кратък\s+срок)/giu,
  },
  {
    id: "MALFORMED_DATE_FIELD",
    severity: "editorial",
    category: "malformed_field",
    message: "Техническа грешка в поле за дата.",
    pattern: /\[ДАТА\s+А-Я[^\]]*\]/gu,
  },
  {
    id: "UNILATERAL_COPIES_PER_PARTY",
    severity: "editorial",
    category: "unilateral_copies",
    message: "Едностранен акт посочва екземпляри „по един за всяка страна“.",
    pattern: /по\s+един\s+за\s+всяка\s+(?:от\s+)?страна/giu,
    documentMust: /^\s*(УЧРЕДИТЕЛЕН\s+АКТ|ДЕКЛАРАЦИЯ|ПЪЛНОМОЩНО|ЗАПОВЕД|ЗАВЕЩАНИЕ)/u,
  },
  {
    id: "EOOD_LATIN_OOD",
    severity: "editorial",
    category: "naming_inconsistency",
    message: "ЕООД е изписано на латиница като „OOD“.",
    pattern: /\]\s+OOD\b/gu,
    documentMust: /ЕООД/u,
  },
  {
    id: "PERSON_COMPANY_MIXED_PARTY",
    severity: "editorial",
    category: "representation_mixing",
    message: "Един ред смесва ЕГН (физическо лице) със седалище и задължителен представител (юридическо лице).",
    pattern: /ЕГН\/ЕИК[^\n]{0,80}седалище и адрес на управление:[^\n]{0,40}\],\s*представляван/gu,
  },
  {
    id: "ABSOLUTE_TEN_YEAR_BAN",
    severity: "conditional_risk",
    category: "absolute_legal_claim",
    message: "Безусловна забрана за наем над десет години; доклада посочва изключения по чл. 229 ЗЗД.",
    pattern: /не\s+(?:може|могат)\s+да\s+(?:бъде|се)\s+сключ\w*\s+за\s+(?:срок\s+)?(?:повече|по-дълъг)\s+от\s+(?:10|десет)\s+години/giu,
  },
  {
    id: "UNIVERSAL_KEP_VALIDITY",
    severity: "conditional_risk",
    category: "absolute_legal_claim",
    message: "Универсално твърдение за правна валидност на КЕП/форма.",
    pattern: /(КЕП|квалифициран\s+електронен\s+подпис)[^.]{0,80}(винаги|във\s+всички\s+случаи|за\s+всички\s+документи)/giu,
  },
  {
    id: "ZZD_228_NOTICE_TERM",
    severity: "legal_error",
    category: "wrong_citation",
    message: "Срокът за предизвестие е приписан на чл. 228 ЗЗД (дефиниция на наема); относим е чл. 238.",
    pattern: /чл\.\s*228\b[^.]{0,160}предизвестие/giu,
  },
  {
    id: "MOVABLE_THREE_DAYS",
    severity: "legal_error",
    category: "absolute_legal_claim",
    message: "Твърдение за тридневен срок за движими вещи без опора в прочетения чл. 238 ЗЗД.",
    pattern: /(движими\s+вещи[^.]{0,60}(три|3)\s+дни|(три|3)\s+дни[^.]{0,60}движими\s+вещи)/giu,
  },
  {
    id: "ZZD_229_AS_FORM_RULE",
    severity: "legal_error",
    category: "wrong_citation",
    message: "Чл. 229 ЗЗД (пределен срок) е представен като правило за форма.",
    pattern: /чл\.\s*229[^.]{0,120}форма|форма[^.]{0,120}чл\.\s*229/giu,
    sentenceMustNot: /а\s+не\s+формата/iu,
  },
  {
    id: "TZ_115_PARA2",
    severity: "legal_error",
    category: "wrong_citation",
    message: "Позоваване на чл. 115, ал. 2 ТЗ (по прочетения текст няма такова изискване).",
    pattern: new RegExp(`чл\\.\\s*115,?\\s*ал\\.\\s*2\\s*${TZ}`, "giu"),
  },
  {
    id: "MIN_CAPITAL_NOT_ONE_EUR",
    severity: "legal_error",
    category: "absolute_legal_claim",
    message: "Минимален капитал, различен от 1 евро (чл. 117, ал. 1 ТЗ; БНБ въпрос 189).",
    pattern: /минимал\w*[^.]{0,40}капитал[^.]{0,40}\b(?!1\s)(\d+)\s*(евро|EUR)/giu,
  },
  {
    id: "COMPANY_ARISES_WITH_ACT",
    severity: "material_risk",
    category: "absolute_legal_claim",
    message: "Внушава, че дружеството възниква със самия акт, а не с вписването.",
    pattern: /акт[^.]{0,30}(официално\s+)?учредява\s+(еднолично\s+)?дружество/giu,
  },
];

const CITATION = /чл\.\s*\d+[а-я]?(?:,\s*ал\.\s*\d+)?(?:,\s*т\.\s*\d+)?(?:\s*(?:и\s+сл\.)?)?\s*(?:от\s+)?(?:(?:Закона|Търговския\s+закон|Кодекса)[^()\n]{0,60}\(?([А-ЯA-Z]{2,8})\)?|([А-Я]{2,8}))/gu;

function sentenceAround(text: string, index: number, length: number): string {
  const start = Math.max(text.lastIndexOf(".", index - 1), text.lastIndexOf("\n", index - 1)) + 1;
  const endDot = text.indexOf(".", index + length);
  const endNl = text.indexOf("\n", index + length);
  const ends = [endDot, endNl].filter((n) => n >= 0);
  const end = ends.length ? Math.min(...ends) + 1 : text.length;
  return text.slice(start, end);
}

function excerpt(text: string, index: number, length: number): string {
  const s = Math.max(0, index - 60);
  const e = Math.min(text.length, index + length + 60);
  return text.slice(s, e).replace(/\s+/g, " ").trim();
}

export function scanTemplateText(text: string): Finding[] {
  const out: Finding[] = [];
  for (const rule of CATALOG_RULES) {
    if (rule.documentMust && !rule.documentMust.test(text)) continue;
    rule.pattern.lastIndex = 0;
    for (const m of text.matchAll(rule.pattern)) {
      const idx = m.index ?? 0;
      const sentence = sentenceAround(text, idx, m[0].length);
      if (rule.sentenceMust && !rule.sentenceMust.test(sentence)) continue;
      if (rule.sentenceMustNot && rule.sentenceMustNot.test(sentence)) continue;
      out.push({
        ruleId: rule.id, severity: rule.severity, category: rule.category, message: rule.message,
        excerpt: excerpt(text, idx, m[0].length), offset: idx,
      });
    }
  }
  return out.sort((a, b) => a.offset - b.offset);
}

/** Всички нормативни позовавания — до сверка с прочетен източник те са непроверени. */
export function extractCitations(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(CITATION)) seen.add(m[0].replace(/\s+/g, " ").trim());
  return [...seen];
}

export const PLACEHOLDER = /\[[^[\]]+\]/gu;

/** Брой незатворени/излишни квадратни скоби — сигнал за повредено поле. */
export function bracketImbalance(text: string): number {
  let depth = 0, bad = 0;
  for (const ch of text) {
    if (ch === "[") depth++;
    else if (ch === "]") { if (depth === 0) bad++; else depth--; }
  }
  return bad + depth;
}
