/**
 * Pilot question graph — договор за наем на жилище.
 *
 * Demonstrates the dynamic decision tree:
 *   - branches by property type (apartment vs house) and lease term,
 *   - conditionally requires deposit fields, pet clause, utilities split,
 *   - drives the conditional clause engine via `affects_clauses`.
 */

import type { QuestionGraph } from "@/lib/questionGraph";

export const dogovorZaNaemGraph: QuestionGraph = {
  template_slug: "dogovor-za-naem-na-zhilishte",
  title: "Договор за наем на жилище",
  sections: [
    { id: "parties", title: "Страни по договора" },
    { id: "property", title: "Имот" },
    { id: "terms", title: "Срок и плащане" },
    { id: "deposit", title: "Депозит и гаранции" },
    { id: "rules", title: "Условия и ограничения" },
    { id: "signatures", title: "Подписи" },
  ],
  questions: [
    // Parties --------------------------------------------------------------
    { id: "landlord", section: "parties", label: "Наемодател",
      help: "Лицето или фирмата, която отдава имота под наем.",
      field_type: "party_list", required_when: "true" },
    { id: "tenant", section: "parties", label: "Наемател",
      field_type: "party_list", required_when: "true" },

    // Property -------------------------------------------------------------
    { id: "property_type", section: "property", label: "Тип имот",
      field_type: "select", required_when: "true",
      options: [
        { value: "apartment", label: "Апартамент" },
        { value: "house", label: "Къща" },
        { value: "room", label: "Стая" },
        { value: "commercial", label: "Търговско помещение" },
      ] },
    { id: "property_address", section: "property", label: "Адрес на имота",
      field_type: "longtext", required_when: "true" },
    { id: "property_area", section: "property", label: "Квадратура (кв.м)",
      field_type: "number", required_when: "true" },
    { id: "has_parking", section: "property", label: "Включва ли паркомясто?",
      field_type: "boolean",
      visible_when: "property_type in ['apartment','house','commercial']",
      affects_clauses: ["parking"] },
    { id: "parking_description", section: "property", label: "Описание на паркомястото",
      field_type: "text", visible_when: "has_parking == true",
      required_when: "has_parking == true" },
    { id: "furniture_included", section: "property", label: "Имотът обзаведен ли е?",
      field_type: "select", required_when: "true",
      options: [
        { value: "none", label: "Не" },
        { value: "partial", label: "Частично" },
        { value: "full", label: "Напълно" },
      ],
      affects_clauses: ["inventory"] },

    // Terms ----------------------------------------------------------------
    { id: "term_type", section: "terms", label: "Срок на договора",
      field_type: "select", required_when: "true",
      options: [
        { value: "fixed", label: "Срочен (с конкретна крайна дата)" },
        { value: "indefinite", label: "Безсрочен" },
      ],
      affects_clauses: ["fixed_term", "indefinite_term"] },
    { id: "start_date", section: "terms", label: "Начална дата",
      field_type: "date", required_when: "true" },
    { id: "end_date", section: "terms", label: "Крайна дата",
      field_type: "date", visible_when: "term_type == 'fixed'",
      required_when: "term_type == 'fixed'" },
    { id: "auto_renew", section: "terms", label: "Автоматично продължаване?",
      field_type: "boolean", visible_when: "term_type == 'fixed'",
      affects_clauses: ["auto_renew"] },
    { id: "monthly_rent", section: "terms", label: "Месечен наем (EUR)",
      field_type: "money", required_when: "true" },
    { id: "payment_day", section: "terms", label: "Ден за плащане (1-31)",
      field_type: "number", required_when: "true", default: 5 },
    { id: "payment_method", section: "terms", label: "Начин на плащане",
      field_type: "select", required_when: "true",
      options: [
        { value: "bank_transfer", label: "Банков превод" },
        { value: "cash", label: "В брой срещу разписка" },
      ] },
    { id: "utilities_responsibility", section: "terms", label: "Кой плаща консумативите?",
      help: "Електроенергия, вода, отопление, интернет.",
      field_type: "select", required_when: "true",
      options: [
        { value: "tenant", label: "Наемателят" },
        { value: "landlord", label: "Наемодателят" },
        { value: "split", label: "Разпределени" },
      ],
      affects_clauses: ["utilities_tenant", "utilities_landlord", "utilities_split"] },
    { id: "utilities_split_details", section: "terms",
      label: "Опишете как се разпределят консумативите",
      field_type: "longtext",
      visible_when: "utilities_responsibility == 'split'",
      required_when: "utilities_responsibility == 'split'" },

    // Deposit --------------------------------------------------------------
    { id: "has_deposit", section: "deposit", label: "Изисква ли се депозит?",
      field_type: "boolean", required_when: "true",
      affects_clauses: ["deposit"] },
    { id: "deposit_amount", section: "deposit", label: "Сума на депозита (EUR)",
      field_type: "money", visible_when: "has_deposit == true",
      required_when: "has_deposit == true" },
    { id: "deposit_return_days", section: "deposit",
      label: "Срок за връщане след прекратяване (дни)",
      field_type: "number", visible_when: "has_deposit == true",
      required_when: "has_deposit == true", default: 30 },

    // Rules ----------------------------------------------------------------
    { id: "pets_allowed", section: "rules", label: "Разрешени ли са домашни любимци?",
      field_type: "select", required_when: "true",
      options: [
        { value: "yes", label: "Да" },
        { value: "no", label: "Не" },
        { value: "with_permission", label: "Само с писмено съгласие" },
      ],
      affects_clauses: ["pets_allowed", "pets_forbidden", "pets_conditional"] },
    { id: "smoking_allowed", section: "rules", label: "Разрешено ли е пушенето в имота?",
      field_type: "boolean", required_when: "true",
      affects_clauses: ["smoking_forbidden"] },
    { id: "subletting_allowed", section: "rules", label: "Разрешено ли е пренаемане?",
      field_type: "boolean", required_when: "true",
      affects_clauses: ["subletting"] },
    { id: "max_occupants", section: "rules", label: "Максимален брой обитатели",
      field_type: "number",
      visible_when: "property_type in ['apartment','house','room']" },

    // Signatures -----------------------------------------------------------
    { id: "place_signed", section: "signatures", label: "Място на подписване",
      field_type: "text", required_when: "true" },
    { id: "date_signed", section: "signatures", label: "Дата на подписване",
      field_type: "date", required_when: "true" },
  ],
};

import { ndaGraph } from "./nda-dogovor-za-konfidentsialnost";
import { grazhdanskiDogovorGraph } from "./grazhdanski-dogovor-dogovor-za-uslugi";
import { dogovorZaIzrabotkaGraph } from "./dogovor-za-izrabotka";
import { BULK_GRAPHS } from "./_bulk20";
import { BULK_GRAPHS_PART2 } from "./_bulk20_part2";

/** Registry — extend as more graphs are migrated. */
export const QUESTION_GRAPHS: Record<string, QuestionGraph> = {
  [dogovorZaNaemGraph.template_slug]: dogovorZaNaemGraph,
  [ndaGraph.template_slug]: ndaGraph,
  [grazhdanskiDogovorGraph.template_slug]: grazhdanskiDogovorGraph,
  [dogovorZaIzrabotkaGraph.template_slug]: dogovorZaIzrabotkaGraph,
  ...BULK_GRAPHS,
};

export function getQuestionGraph(slug: string): QuestionGraph | null {
  return QUESTION_GRAPHS[slug] ?? null;
}

