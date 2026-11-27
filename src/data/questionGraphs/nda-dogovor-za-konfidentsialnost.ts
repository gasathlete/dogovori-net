/**
 * Question graph — NDA (Договор за конфиденциалност).
 *
 * Branches by:
 *   - direction (unilateral vs mutual) — drives кой е "Разкриваща" и "Получаваща" страна,
 *   - type of confidential info (technical / commercial / personal data),
 *   - whether GDPR clauses are needed,
 *   - penalty / liquidated damages availability,
 *   - jurisdiction (court vs arbitration).
 */

import type { QuestionGraph } from "@/lib/questionGraph";

export const ndaGraph: QuestionGraph = {
  template_slug: "nda-dogovor-za-konfidentsialnost",
  title: "NDA — Договор за конфиденциалност",
  sections: [
    { id: "parties", title: "Страни" },
    { id: "scope", title: "Обхват на информацията" },
    { id: "obligations", title: "Задължения и срок" },
    { id: "remedies", title: "Санкции при нарушение" },
    { id: "jurisdiction", title: "Право и спорове" },
    { id: "signatures", title: "Подписи" },
  ],
  questions: [
    // Parties --------------------------------------------------------------
    { id: "direction", section: "parties", label: "Тип на NDA",
      help: "Едностранен — само едната страна разкрива. Двустранен — и двете страни.",
      field_type: "select", required_when: "true",
      options: [
        { value: "unilateral", label: "Едностранен (една страна разкрива)" },
        { value: "mutual", label: "Двустранен (взаимен)" },
      ],
      affects_clauses: ["unilateral_obligation", "mutual_obligation"] },
    { id: "disclosing_party", section: "parties", label: "Разкриваща страна",
      field_type: "party_list",
      visible_when: "direction == 'unilateral'",
      required_when: "direction == 'unilateral'" },
    { id: "receiving_party", section: "parties", label: "Получаваща страна",
      field_type: "party_list",
      visible_when: "direction == 'unilateral'",
      required_when: "direction == 'unilateral'" },
    { id: "party_a", section: "parties", label: "Страна А",
      field_type: "party_list",
      visible_when: "direction == 'mutual'",
      required_when: "direction == 'mutual'" },
    { id: "party_b", section: "parties", label: "Страна Б",
      field_type: "party_list",
      visible_when: "direction == 'mutual'",
      required_when: "direction == 'mutual'" },

    // Scope ----------------------------------------------------------------
    { id: "purpose", section: "scope", label: "Цел на разкриването",
      help: "Например: преговори за партньорство, оценка на инвестиция, оutsourcing на разработка.",
      field_type: "longtext", required_when: "true" },
    { id: "info_categories", section: "scope", label: "Категории конфиденциална информация",
      field_type: "multiselect", required_when: "true",
      options: [
        { value: "technical", label: "Техническа (know-how, изходен код, прототипи)" },
        { value: "commercial", label: "Търговска (клиенти, цени, стратегия)" },
        { value: "financial", label: "Финансова (отчети, прогнози)" },
        { value: "personal_data", label: "Лични данни (GDPR)" },
        { value: "other", label: "Друго" },
      ],
      affects_clauses: ["info_technical", "info_commercial", "info_financial", "gdpr_addendum"] },
    { id: "info_other_description", section: "scope",
      label: "Опишете другата категория информация",
      field_type: "longtext",
      visible_when: "'other' in info_categories",
      required_when: "'other' in info_categories" },
    { id: "exclusions_standard", section: "scope",
      label: "Прилагат ли се стандартните изключения?",
      help: "Публично известна информация, независимо разработена, получена законно от трето лице.",
      field_type: "boolean", required_when: "true", default: true,
      affects_clauses: ["standard_exclusions"] },

    // Obligations ----------------------------------------------------------
    { id: "confidentiality_years", section: "obligations",
      label: "Срок на конфиденциалност след прекратяване (години)",
      field_type: "number", required_when: "true", default: 3 },
    { id: "return_obligation", section: "obligations",
      label: "Задължение за връщане/унищожаване на материалите?",
      field_type: "boolean", required_when: "true", default: true,
      affects_clauses: ["return_materials"] },
    { id: "return_days", section: "obligations",
      label: "Срок за връщане (дни от прекратяване)",
      field_type: "number",
      visible_when: "return_obligation == true",
      required_when: "return_obligation == true", default: 14 },
    { id: "permitted_recipients", section: "obligations",
      label: "На кого може да се разкрива информацията?",
      field_type: "multiselect",
      options: [
        { value: "employees", label: "Служители на need-to-know база" },
        { value: "advisors", label: "Юристи, счетоводители, одитори" },
        { value: "affiliates", label: "Свързани дружества" },
        { value: "subcontractors", label: "Подизпълнители" },
      ],
      affects_clauses: ["permitted_recipients"] },

    // Remedies -------------------------------------------------------------
    { id: "has_penalty", section: "remedies", label: "Договаряте ли неустойка?",
      help: "Неустойка по чл. 92 ЗЗД — фиксирана сума при доказано нарушение.",
      field_type: "boolean", required_when: "true",
      affects_clauses: ["penalty_clause"] },
    { id: "penalty_amount", section: "remedies", label: "Размер на неустойката (EUR)",
      field_type: "money",
      visible_when: "has_penalty == true",
      required_when: "has_penalty == true" },
    { id: "injunctive_relief", section: "remedies",
      label: "Право на обезпечителни мерки (injunction)?",
      field_type: "boolean", default: true,
      affects_clauses: ["injunctive_relief"] },

    // Jurisdiction ---------------------------------------------------------
    { id: "dispute_forum", section: "jurisdiction", label: "Разрешаване на спорове",
      field_type: "select", required_when: "true",
      options: [
        { value: "court", label: "Български съд" },
        { value: "arbitration", label: "Арбитраж" },
      ],
      affects_clauses: ["forum_court", "forum_arbitration"] },
    { id: "arbitration_court", section: "jurisdiction",
      label: "Арбитражен съд",
      field_type: "text",
      visible_when: "dispute_forum == 'arbitration'",
      required_when: "dispute_forum == 'arbitration'",
      default: "Арбитражен съд при БТПП, гр. София" },

    // Signatures -----------------------------------------------------------
    { id: "place_signed", section: "signatures", label: "Място на подписване",
      field_type: "text", required_when: "true" },
    { id: "date_signed", section: "signatures", label: "Дата на подписване",
      field_type: "date", required_when: "true" },
  ],
};
