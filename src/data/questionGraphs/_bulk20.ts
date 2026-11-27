/**
 * Bulk migration — 20 шаблона към динамични графи + clause engine.
 *
 * Всеки запис съдържа:
 *   - QuestionGraph (визуално-условна структура на въпросите),
 *   - масив от clause definitions, които се upsert-ват в `template_clauses`.
 *
 * За компактност използваме лек helper DSL — q() за въпрос, cl() за клауза.
 * Семантиката е идентична на ръчно написаните графи от Спринт 1.
 */

import type { QuestionGraph, QuestionNode } from "@/lib/questionGraph";
import type { ClauseDefinition } from "@/lib/clauseEngine";

type Q = Partial<QuestionNode> & { id: string; section: string; label: string; field_type: QuestionNode["field_type"] };
const q = (x: Q): QuestionNode => x as QuestionNode;
const opts = (...pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));

const SIGN_SECTION = { id: "signatures", title: "Подписи" };
const signQuestions = (): QuestionNode[] => [
  q({ id: "place_signed", section: "signatures", label: "Място на подписване", field_type: "text", required_when: "true" }),
  q({ id: "date_signed", section: "signatures", label: "Дата на подписване", field_type: "date", required_when: "true" }),
];

interface BulkSpec {
  graph: QuestionGraph;
  clauses: Omit<ClauseDefinition, "template_slug">[];
}

const SPECS: Record<string, BulkSpec> = {
  // 1. Покупко-продажба на движима вещ ----------------------------------
  "dogovor-za-pokupko-prodazhba-na-dvizhima-vesht": {
    graph: {
      template_slug: "dogovor-za-pokupko-prodazhba-na-dvizhima-vesht",
      title: "Договор за покупко-продажба на движима вещ",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "subject", title: "Предмет" },
        { id: "price", title: "Цена и плащане" },
        { id: "delivery", title: "Предаване и собственост" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "seller", section: "parties", label: "Продавач", field_type: "party_list", required_when: "true" }),
        q({ id: "buyer", section: "parties", label: "Купувач", field_type: "party_list", required_when: "true" }),
        q({ id: "item_description", section: "subject", label: "Описание на вещта", field_type: "longtext", required_when: "true" }),
        q({ id: "item_identifiers", section: "subject", label: "Сериен номер / идентификатори", field_type: "text" }),
        q({ id: "item_condition", section: "subject", label: "Състояние", field_type: "select", required_when: "true",
          options: opts(["new","Нова"],["used","Употребявана"],["as_is","Във вида, в който е (as-is)"]),
          affects_clauses: ["warranty_new","as_is_disclaimer"] }),
        q({ id: "price_amount", section: "price", label: "Цена (EUR)", field_type: "money", required_when: "true" }),
        q({ id: "vat_included", section: "price", label: "Цената е с включено ДДС", field_type: "boolean" }),
        q({ id: "payment_method", section: "price", label: "Начин на плащане", field_type: "select", required_when: "true",
          options: opts(["cash","В брой"],["bank","Банков превод"],["installments","На вноски"]),
          affects_clauses: ["pay_installments"] }),
        q({ id: "installments_count", section: "price", label: "Брой вноски", field_type: "number",
          visible_when: "payment_method == 'installments'", required_when: "payment_method == 'installments'" }),
        q({ id: "delivery_date", section: "delivery", label: "Дата на предаване", field_type: "date", required_when: "true" }),
        q({ id: "delivery_place", section: "delivery", label: "Място на предаване", field_type: "text", required_when: "true" }),
        q({ id: "ownership_transfer", section: "delivery", label: "Момент на прехвърляне на собствеността", field_type: "select", required_when: "true",
          options: opts(["on_signing","С подписване"],["on_delivery","С предаване"],["on_full_payment","С пълно плащане"]),
          affects_clauses: ["ownership_full_pay"] }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "subject", order: 10, title: "Предмет", body_md: "Продавачът продава, а Купувачът купува {{item_description}} {{item_identifiers}}, в състояние „{{item_condition}}“.", severity: "required" },
      { clause_id: "price", order: 20, title: "Цена", body_md: "Цената е {{price_amount}} EUR.", severity: "required" },
      { clause_id: "pay_installments", order: 25, title: "Разсрочено плащане", body_md: "Цената се изплаща на {{installments_count}} равни месечни вноски.", include_when: "payment_method == 'installments'", severity: "recommended" },
      { clause_id: "delivery", order: 30, title: "Предаване", body_md: "Вещта се предава на {{delivery_date}} в {{delivery_place}}.", severity: "required" },
      { clause_id: "ownership_full_pay", order: 35, title: "Запазване на собствеността", body_md: "Собствеността преминава върху Купувача след пълно плащане на цената.", include_when: "ownership_transfer == 'on_full_payment'", severity: "required" },
      { clause_id: "warranty_new", order: 40, title: "Гаранция", body_md: "За нови вещи Продавачът отговаря по реда на ЗЗП за срок от 24 месеца.", include_when: "item_condition == 'new'", severity: "recommended" },
      { clause_id: "as_is_disclaimer", order: 41, title: "Без гаранция (as-is)", body_md: "Купувачът декларира, че е огледал вещта и я приема във вида, в който е, без претенции за скрити недостатъци.", include_when: "item_condition == 'as_is'", severity: "recommended" },
    ],
  },

  // 2. Заем на парични средства ---------------------------------------
  "dogovor-za-zaem-na-parichni-sredstva": {
    graph: {
      template_slug: "dogovor-za-zaem-na-parichni-sredstva",
      title: "Договор за заем на парични средства",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "loan", title: "Заем" },
        { id: "repayment", title: "Връщане и лихва" },
        { id: "security", title: "Обезпечение" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "lender", section: "parties", label: "Заемодател", field_type: "party_list", required_when: "true" }),
        q({ id: "borrower", section: "parties", label: "Заемополучател", field_type: "party_list", required_when: "true" }),
        q({ id: "amount", section: "loan", label: "Сума на заема (EUR)", field_type: "money", required_when: "true" }),
        q({ id: "purpose", section: "loan", label: "Цел на заема", field_type: "text" }),
        q({ id: "disbursement_method", section: "loan", label: "Начин на предоставяне", field_type: "select", required_when: "true",
          options: opts(["cash","В брой срещу разписка"],["bank","Банков превод"]) }),
        q({ id: "repayment_type", section: "repayment", label: "Начин на връщане", field_type: "select", required_when: "true",
          options: opts(["lumpsum","Еднократно на крайна дата"],["installments","На равни вноски"]),
          affects_clauses: ["repay_lump","repay_installments"] }),
        q({ id: "due_date", section: "repayment", label: "Крайна дата за връщане", field_type: "date", required_when: "true" }),
        q({ id: "installments_count", section: "repayment", label: "Брой вноски", field_type: "number",
          visible_when: "repayment_type == 'installments'", required_when: "repayment_type == 'installments'" }),
        q({ id: "has_interest", section: "repayment", label: "Заемът е лихвен", field_type: "boolean", required_when: "true",
          affects_clauses: ["interest","no_interest"] }),
        q({ id: "interest_rate", section: "repayment", label: "Годишен лихвен процент (%)", field_type: "number",
          visible_when: "has_interest == true", required_when: "has_interest == true" }),
        q({ id: "default_penalty", section: "repayment", label: "Неустойка при забава (% на ден)", field_type: "number" }),
        q({ id: "has_collateral", section: "security", label: "Има ли обезпечение?", field_type: "boolean", required_when: "true",
          affects_clauses: ["collateral"] }),
        q({ id: "collateral_description", section: "security", label: "Описание на обезпечението", field_type: "longtext",
          visible_when: "has_collateral == true", required_when: "has_collateral == true" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "loan_grant", order: 10, title: "Предмет", body_md: "Заемодателят предоставя на Заемополучателя сумата {{amount}} EUR{{purpose}}.", severity: "required" },
      { clause_id: "disbursement", order: 15, title: "Предоставяне", body_md: "Сумата се предоставя чрез: {{disbursement_method}}.", severity: "required" },
      { clause_id: "repay_lump", order: 20, title: "Връщане", body_md: "Заемополучателят се задължава да върне цялата сума до {{due_date}}.", include_when: "repayment_type == 'lumpsum'", severity: "required" },
      { clause_id: "repay_installments", order: 21, title: "Връщане на вноски", body_md: "Сумата се връща на {{installments_count}} равни месечни вноски, последна вноска до {{due_date}}.", include_when: "repayment_type == 'installments'", severity: "required" },
      { clause_id: "interest", order: 30, title: "Лихва", body_md: "Заемополучателят дължи годишна лихва от {{interest_rate}}% върху неизплатената главница.", include_when: "has_interest == true", severity: "required" },
      { clause_id: "no_interest", order: 31, title: "Безлихвен заем", body_md: "Заемът е безлихвен.", include_when: "has_interest == false", severity: "recommended" },
      { clause_id: "default", order: 40, title: "Забава", body_md: "При забава Заемополучателят дължи неустойка от {{default_penalty}}% на ден върху забавената сума.", include_when: "default_penalty", severity: "recommended" },
      { clause_id: "collateral", order: 50, title: "Обезпечение", body_md: "Заемът е обезпечен със: {{collateral_description}}.", include_when: "has_collateral == true", severity: "recommended" },
    ],
  },

  // 3. Дарение --------------------------------------------------------
  "dogovor-za-darenie": {
    graph: {
      template_slug: "dogovor-za-darenie",
      title: "Договор за дарение",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "subject", title: "Предмет на дарението" },
        { id: "conditions", title: "Условия и тежести" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "donor", section: "parties", label: "Дарител", field_type: "party_list", required_when: "true" }),
        q({ id: "donee", section: "parties", label: "Надарен", field_type: "party_list", required_when: "true" }),
        q({ id: "gift_type", section: "subject", label: "Вид на дарението", field_type: "select", required_when: "true",
          options: opts(["money","Парична сума"],["movable","Движима вещ"],["immovable","Недвижим имот"]),
          affects_clauses: ["gift_money","gift_movable","gift_immovable","notary_required"] }),
        q({ id: "gift_amount", section: "subject", label: "Сума (EUR)", field_type: "money",
          visible_when: "gift_type == 'money'", required_when: "gift_type == 'money'" }),
        q({ id: "gift_description", section: "subject", label: "Описание на вещта/имота", field_type: "longtext",
          visible_when: "gift_type in ['movable','immovable']", required_when: "gift_type in ['movable','immovable']" }),
        q({ id: "transfer_date", section: "subject", label: "Дата на предаване", field_type: "date", required_when: "true" }),
        q({ id: "has_burden", section: "conditions", label: "Дарението има ли тежест/условие?", field_type: "boolean", required_when: "true",
          affects_clauses: ["burden"] }),
        q({ id: "burden_description", section: "conditions", label: "Описание на тежестта", field_type: "longtext",
          visible_when: "has_burden == true", required_when: "has_burden == true" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "gift_money", order: 10, title: "Предмет", body_md: "Дарителят дарява на Надарения паричната сума от {{gift_amount}} EUR.", include_when: "gift_type == 'money'", severity: "required" },
      { clause_id: "gift_movable", order: 11, title: "Предмет", body_md: "Дарителят дарява: {{gift_description}}.", include_when: "gift_type == 'movable'", severity: "required" },
      { clause_id: "gift_immovable", order: 12, title: "Предмет", body_md: "Дарителят дарява следния недвижим имот: {{gift_description}}.", include_when: "gift_type == 'immovable'", severity: "required" },
      { clause_id: "transfer", order: 20, title: "Предаване", body_md: "Предаването се извършва на {{transfer_date}}.", severity: "required" },
      { clause_id: "burden", order: 30, title: "Тежести", body_md: "Дарението е с тежест: {{burden_description}}.", include_when: "has_burden == true", severity: "recommended" },
      { clause_id: "notary_required", order: 90, title: "Нотариална форма", body_md: "Договорът за дарение на недвижим имот се сключва във форма на нотариален акт. Този документ служи като проект.", include_when: "gift_type == 'immovable'", severity: "required" },
    ],
  },

  // 4. Заем за послужване --------------------------------------------
  "dogovor-za-zaem-za-posluzhvane": {
    graph: {
      template_slug: "dogovor-za-zaem-za-posluzhvane",
      title: "Договор за заем за послужване",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "subject", title: "Вещ" },
        { id: "terms", title: "Срок и ползване" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "lender", section: "parties", label: "Заемодател", field_type: "party_list", required_when: "true" }),
        q({ id: "borrower", section: "parties", label: "Заемополучател", field_type: "party_list", required_when: "true" }),
        q({ id: "item_description", section: "subject", label: "Описание на вещта", field_type: "longtext", required_when: "true" }),
        q({ id: "item_value", section: "subject", label: "Декларирана стойност (EUR)", field_type: "money" }),
        q({ id: "use_purpose", section: "terms", label: "Цел на ползване", field_type: "text", required_when: "true" }),
        q({ id: "term_type", section: "terms", label: "Срок", field_type: "select", required_when: "true",
          options: opts(["fixed","Срочен"],["until_purpose","До постигане на целта"]),
          affects_clauses: ["fixed_term","purpose_term"] }),
        q({ id: "end_date", section: "terms", label: "Крайна дата", field_type: "date",
          visible_when: "term_type == 'fixed'", required_when: "term_type == 'fixed'" }),
        q({ id: "expenses_borrower", section: "terms", label: "Текущите разходи са за сметка на Заемополучателя", field_type: "boolean", required_when: "true" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "subject", order: 10, title: "Предмет", body_md: "Заемодателят предоставя безвъзмездно на Заемополучателя за временно ползване: {{item_description}}.", severity: "required" },
      { clause_id: "purpose", order: 20, title: "Цел", body_md: "Вещта се ползва за: {{use_purpose}}.", severity: "required" },
      { clause_id: "fixed_term", order: 30, title: "Срок", body_md: "Срокът на ползване е до {{end_date}}.", include_when: "term_type == 'fixed'", severity: "required" },
      { clause_id: "purpose_term", order: 31, title: "Срок", body_md: "Срокът на ползване е до постигане на целта по чл. 2.", include_when: "term_type == 'until_purpose'", severity: "required" },
      { clause_id: "care", order: 40, title: "Грижа", body_md: "Заемополучателят е длъжен да полага грижата на добър стопанин и да ползва вещта само по предназначение.", severity: "recommended" },
      { clause_id: "expenses", order: 50, title: "Текущи разходи", body_md: "Обикновените разходи за поддръжката на вещта са за сметка на Заемополучателя.", include_when: "expenses_borrower == true", severity: "recommended" },
    ],
  },

  // 5. Замяна ---------------------------------------------------------
  "dogovor-za-zamyana": {
    graph: {
      template_slug: "dogovor-za-zamyana",
      title: "Договор за замяна",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "items", title: "Заменяеми вещи" },
        { id: "equalization", title: "Доплащане" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "party_a", section: "parties", label: "Първа страна", field_type: "party_list", required_when: "true" }),
        q({ id: "party_b", section: "parties", label: "Втора страна", field_type: "party_list", required_when: "true" }),
        q({ id: "item_a", section: "items", label: "Вещ, предоставяна от Първа страна", field_type: "longtext", required_when: "true" }),
        q({ id: "value_a", section: "items", label: "Стойност на вещта на Първа страна (EUR)", field_type: "money", required_when: "true" }),
        q({ id: "item_b", section: "items", label: "Вещ, предоставяна от Втора страна", field_type: "longtext", required_when: "true" }),
        q({ id: "value_b", section: "items", label: "Стойност на вещта на Втора страна (EUR)", field_type: "money", required_when: "true" }),
        q({ id: "has_equalization", section: "equalization", label: "Има ли доплащане за изравняване?", field_type: "boolean", required_when: "true",
          affects_clauses: ["equalization"] }),
        q({ id: "equalization_amount", section: "equalization", label: "Сума на доплащане (EUR)", field_type: "money",
          visible_when: "has_equalization == true", required_when: "has_equalization == true" }),
        q({ id: "equalization_payer", section: "equalization", label: "Кой доплаща?", field_type: "select",
          visible_when: "has_equalization == true", required_when: "has_equalization == true",
          options: opts(["a","Първа страна"],["b","Втора страна"]) }),
        q({ id: "exchange_date", section: "items", label: "Дата на размяна", field_type: "date", required_when: "true" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "subject", order: 10, title: "Предмет", body_md: "Страните си разменят: Първа страна предава {{item_a}} (стойност {{value_a}} EUR); Втора страна предава {{item_b}} (стойност {{value_b}} EUR).", severity: "required" },
      { clause_id: "equalization", order: 20, title: "Доплащане", body_md: "За изравняване страната „{{equalization_payer}}“ доплаща {{equalization_amount}} EUR.", include_when: "has_equalization == true", severity: "required" },
      { clause_id: "transfer", order: 30, title: "Размяна", body_md: "Размяната се извършва на {{exchange_date}}; собствеността преминава с предаването.", severity: "required" },
      { clause_id: "warranties", order: 40, title: "Гаранции", body_md: "Всяка страна гарантира, че е собственик и че вещта ѝ е свободна от тежести.", severity: "recommended" },
    ],
  },
};

export const BULK_GRAPHS: Record<string, QuestionGraph> = Object.fromEntries(
  Object.entries(SPECS).map(([slug, s]) => [slug, s.graph]),
);

export const BULK_CLAUSES: ClauseDefinition[] = Object.entries(SPECS).flatMap(([slug, s]) =>
  s.clauses.map((c) => ({ ...c, template_slug: slug })),
);
