/**
 * СИНТЕТИЧНИ примери за схема v2 — само за тестове.
 *
 * Нищо тук не идва от истински документ, от публичните демонстрации или от
 * продукционни данни. Платеният код НИКОГА не внася този модул.
 */
import {
  PRODUCT_SOURCE_CHAR_UNIT,
  countProductSourceChars,
  normalizeProductSourceText,
} from "@/lib/productSource";
import { correctionId } from "../../supabase/functions/_shared/product-corrections";
import type {
  ContractCheckResult,
  ContractImproveResult,
  Correction,
  NegotiationPackageResult,
  ProductSourceBinding,
  ReviewPayload,
  SourceSpan,
} from "../../supabase/functions/_shared/product-result-contract";

/** Синтетичен източник: съдържа кирилица, съчетаващ знак и емоджи. */
export const FIXTURE_SOURCE_TEXT = normalizeProductSourceText(
  [
    "ДОГОВОР ЗА ИЗРАБОТКА",
    "",
    "1. Страни",
    "Изпълнител: Ателие Мостове ЕООД, ЕИК 200200200.",
    "Възложител: Хоризонт Плюс ООД, ЕИК 300300300.",
    "",
    "2. Предмет",
    "Изпълнителят изработва и предава уеб приложение по задание на Възложителя.",
    "",
    "3. Цена и плащане",
    "Възнаграждението е 24 000 € без ДДС и се плаща в срок от 20 дни след приемане.",
    "При забава Възложителят дължи неустойка 0,5% на ден без ограничение в размера.",
    "",
    "4. Срокове",
    "Изпълнителят предава работата до 30 юни 2026 г. Приемането е с протокол ✅.",
    "",
    "5. Прекратяване",
    "Всяка страна може да прекрати договора с едномесечно писмено предизвестие.",
    "",
    "6. Спорове",
    "Споровете се решават от съда по седалището на Възложителя в град Пловди́в.",
  ].join("\n"),
);

const SOURCE_CODE_POINTS = Array.from(FIXTURE_SOURCE_TEXT);

/** Точно място по буквален израз. Изразът трябва да се среща точно веднъж. */
export function fixtureSpan(needle: string, extra: Partial<SourceSpan> = {}): SourceSpan {
  const needleCps = Array.from(needle);
  let found = -1;
  let count = 0;
  for (let i = 0; i + needleCps.length <= SOURCE_CODE_POINTS.length; i += 1) {
    let match = true;
    for (let j = 0; j < needleCps.length; j += 1) {
      if (SOURCE_CODE_POINTS[i + j] !== needleCps[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      count += 1;
      if (found === -1) found = i;
    }
  }
  if (found === -1) throw new Error(`Изразът липсва в синтетичния източник: ${needle}`);
  if (count !== 1) throw new Error(`Изразът се среща ${count} пъти: ${needle}`);
  return {
    start: found,
    end: found + needleCps.length,
    excerpt: SOURCE_CODE_POINTS.slice(found, found + needleCps.length).join(""),
    ...extra,
  };
}

export const FIXTURE_BINDING: ProductSourceBinding = Object.freeze({
  document_id: "3f1c9d64-0f4a-4b7e-9a2c-6d5e8b1a2c34",
  source_hash: "a".repeat(64),
  source_kind: "pdf",
  char_count: countProductSourceChars(FIXTURE_SOURCE_TEXT),
  char_unit: PRODUCT_SOURCE_CHAR_UNIT,
  source_updated_at: "2026-09-12T08:30:00.000Z",
  page_count: 2,
});

const penaltySpan = fixtureSpan(
  "неустойка 0,5% на ден без ограничение в размера",
  { page: 1, paragraph: 9, section: "3. Цена и плащане" },
);
const paymentSpan = fixtureSpan("в срок от 20 дни след приемане");
const forumSpan = fixtureSpan("съда по седалището на Възложителя");
const terminationSpan = fixtureSpan("едномесечно писмено предизвестие");
const contractorSpan = fixtureSpan("Ателие Мостове ЕООД");
const clientSpan = fixtureSpan("Хоризонт Плюс ООД");
const deliverySpan = fixtureSpan("до 30 юни 2026 г.");

const reviewPayload: ReviewPayload = {
  passport: {
    title: "Договор за изработка",
    document_type: "Договор за изработка",
    parties: [
      { role: "Изпълнител", name: "Ателие Мостове ЕООД", span: contractorSpan },
      { role: "Възложител", name: "Хоризонт Плюс ООД", span: clientSpan },
    ],
    governing_law: "Българско право",
    signature_state: "Неподписан",
  },
  executive_summary:
    "Документът е изпълним, но неустойката за забава няма таван и може да надхвърли цената.",
  priority_summary: [
    { finding_id: "f_penalty_cap", rank: 1, reason: "Неограничената неустойка носи най-голям риск." },
  ],
  findings: [
    {
      id: "f_penalty_cap",
      title: "Неустойка без таван",
      severity: "high",
      affected_party: "counterparty",
      explanation:
        "Неустойката е 0,5% на ден и не е ограничена, затова расте без край при продължителна забава.",
      span: penaltySpan,
    },
    {
      id: "f_forum",
      title: "Съд по седалището на другата страна",
      severity: "medium",
      affected_party: "you",
      explanation: "Споровете се гледат по седалището на Възложителя, което оскъпява защитата.",
      span: forumSpan,
    },
  ],
  obligations: [
    {
      id: "o_delivery",
      party: "counterparty",
      summary: "Изпълнителят предава работата до посочения срок.",
      deadline: "30 юни 2026 г.",
      span: deliverySpan,
    },
  ],
  economic_terms: [
    {
      id: "e_payment_term",
      kind: "notice",
      label: "Срок за плащане",
      value_text: "20 дни след приемане",
      span: paymentSpan,
    },
  ],
  termination: {
    summary: "Всяка страна прекратява с едномесечно писмено предизвестие.",
    spans: [terminationSpan],
  },
  disputes: {
    summary: "Спорът е пред съда по седалището на Възложителя.",
    spans: [forumSpan],
  },
  contradictions: [],
  absence_checks: [
    {
      id: "a_penalty_cap",
      concept: "Таван на неустойката",
      searched_terms: ["таван", "не повече от", "общ размер"],
      coverage: "whole_document",
      found: false,
      spans: [],
      note: "Изразите за ограничение на неустойката не се срещат в текста.",
    },
  ],
  questions: [
    {
      id: "q_cap",
      question: "Приемате ли неустойката да е ограничена до 10% от цената?",
      why: "Ограничението прави риска предвидим за двете страни.",
    },
  ],
};

export const CONTRACT_CHECK_FIXTURE: ContractCheckResult = {
  schema_version: 2,
  product_id: "contract_check",
  source: FIXTURE_BINDING,
  generated_at: "2026-09-12T09:00:00.000Z",
  payload: reviewPayload,
};

const penaltyCorrection: Correction = {
  id: correctionId({
    start: penaltySpan.start,
    end: penaltySpan.end,
    mode: "replace",
    original_text: penaltySpan.excerpt,
  }),
  title: "Ограничаване на неустойката",
  mode: "replace",
  span: penaltySpan,
  original_text: penaltySpan.excerpt,
  rationale: "Без таван неустойката може да надхвърли цената на работата.",
  options: [
    {
      stance: "conservative",
      replacement_text: "неустойка 0,5% на ден, но не повече от 20% от възнаграждението",
      trade_off: "Приема се лесно, но защитата е по-слаба.",
    },
    {
      stance: "balanced",
      replacement_text: "неустойка 0,3% на ден, но не повече от 10% от възнаграждението",
      trade_off: "Разумен баланс, който обикновено минава без спор.",
    },
    {
      stance: "assertive",
      replacement_text: "неустойка 0,1% на ден, но не повече от 5% от възнаграждението",
      trade_off: "Най-добра защита, но отсрещната страна може да откаже.",
    },
  ],
};

const forumCorrection: Correction = {
  id: correctionId({
    start: forumSpan.start,
    end: forumSpan.end,
    mode: "replace",
    original_text: forumSpan.excerpt,
  }),
  title: "Неутрална подсъдност",
  mode: "replace",
  span: forumSpan,
  original_text: forumSpan.excerpt,
  rationale: "Съдът по седалището на другата страна оскъпява защитата.",
  options: [
    {
      stance: "conservative",
      replacement_text: "съда по седалището на ответника",
      trade_off: "Малка промяна, лесна за приемане.",
    },
    {
      stance: "balanced",
      replacement_text: "компетентния съд по общите правила на закона",
      trade_off: "Неутрално правило без предимство за никого.",
    },
    {
      stance: "assertive",
      replacement_text: "съда по Вашето седалище",
      trade_off: "Най-удобно за Вас, но вероятно ще срещне съпротива.",
    },
  ],
};

export const CONTRACT_IMPROVE_FIXTURE: ContractImproveResult = {
  schema_version: 2,
  product_id: "contract_improve",
  source: FIXTURE_BINDING,
  generated_at: "2026-09-12T09:05:00.000Z",
  payload: { ...reviewPayload, corrections: [penaltyCorrection, forumCorrection] },
};

export const NEGOTIATION_PACKAGE_FIXTURE: NegotiationPackageResult = {
  schema_version: 2,
  product_id: "negotiation_package",
  source: FIXTURE_BINDING,
  generated_at: "2026-09-12T09:10:00.000Z",
  payload: {
    ...reviewPayload,
    corrections: [penaltyCorrection, forumCorrection],
    objectives: ["Таван на неустойката", "Неутрална подсъдност"],
    red_lines: ["Без неограничена отговорност"],
    acceptable_concessions: ["По-кратък срок за плащане"],
    fallbacks: ["Таван 20% вместо 10%"],
    negotiation_questions: ["Кой поема разходите за приемните тестове?"],
    actions: [
      {
        id: "act_send_redlines",
        action: "Изпращате поправките с кратко обяснение.",
        owner: "Вие",
        due: "до 3 работни дни",
        priority: "high",
      },
    ],
    messages: [
      {
        tone: "neutral",
        subject: "Две уточнения по договора",
        body:
          "Здравейте, прегледахме договора и предлагаме таван на неустойката и неутрална подсъдност.",
      },
      {
        tone: "firm",
        subject: "Условие за подписване",
        body:
          "Здравейте, можем да подпишем при ограничена неустойка и подсъдност по общите правила.",
      },
    ],
    refinement: { included: 1, used: 0 },
  },
};

export const ALL_FIXTURES = [
  CONTRACT_CHECK_FIXTURE,
  CONTRACT_IMPROVE_FIXTURE,
  NEGOTIATION_PACKAGE_FIXTURE,
] as const;

/** Дълбоко копие — тестовете променят копие, не общия пример. */
export function cloneFixture<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Копие без типове — за тестове, които нарочно чупят по едно поле. */
export function cloneRaw(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

/** Промяна по път, например `payload.findings.0.span.excerpt`. */
export function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  let node: Record<string, unknown> = target;
  for (const key of keys.slice(0, -1)) {
    node = node[key] as Record<string, unknown>;
  }
  node[keys[keys.length - 1]] = value;
}

/** Четене по път — за тестове, които четат вложена стойност. */
export function getPath(target: Record<string, unknown>, path: string): unknown {
  let node: unknown = target;
  for (const key of path.split(".")) {
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}
