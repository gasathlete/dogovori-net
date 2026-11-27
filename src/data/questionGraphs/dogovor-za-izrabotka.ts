/**
 * Question graph — Договор за изработка (chl. 258 ЗЗД).
 *
 * Branches by:
 *   - кой осигурява материалите (Изпълнител / Възложител / смесено),
 *   - предаване на готовия резултат с протокол vs без,
 *   - гаранционен срок,
 *   - неустойки за забава,
 *   - застраховка и риск преди приемане.
 */

import type { QuestionGraph } from "@/lib/questionGraph";

export const dogovorZaIzrabotkaGraph: QuestionGraph = {
  template_slug: "dogovor-za-izrabotka",
  title: "Договор за изработка",
  sections: [
    { id: "parties", title: "Страни" },
    { id: "object", title: "Предмет на изработката" },
    { id: "materials", title: "Материали и средства" },
    { id: "schedule", title: "Срок и приемане" },
    { id: "payment", title: "Цена и плащане" },
    { id: "warranty", title: "Гаранция и отговорност" },
    { id: "signatures", title: "Подписи" },
  ],
  questions: [
    // Parties --------------------------------------------------------------
    { id: "client", section: "parties", label: "Възложител",
      field_type: "party_list", required_when: "true" },
    { id: "contractor", section: "parties", label: "Изпълнител",
      field_type: "party_list", required_when: "true" },

    // Object ---------------------------------------------------------------
    { id: "work_description", section: "object", label: "Какво се изработва",
      help: "Точно описание на резултата — какво трябва да получи Възложителят.",
      field_type: "longtext", required_when: "true" },
    { id: "technical_spec_attached", section: "object",
      label: "Прилага ли се техническо задание/спецификация?",
      field_type: "boolean", required_when: "true",
      affects_clauses: ["spec_appendix"] },
    { id: "quantity", section: "object", label: "Брой/обем",
      field_type: "text" },
    { id: "delivery_location", section: "object", label: "Място на предаване",
      field_type: "text", required_when: "true" },

    // Materials ------------------------------------------------------------
    { id: "materials_provider", section: "materials", label: "Кой осигурява материалите?",
      field_type: "select", required_when: "true",
      options: [
        { value: "contractor", label: "Изпълнителят" },
        { value: "client", label: "Възложителят" },
        { value: "mixed", label: "Смесено (по списък)" },
      ],
      affects_clauses: ["materials_contractor", "materials_client", "materials_mixed"] },
    { id: "materials_list", section: "materials",
      label: "Списък на материалите, осигурявани от Възложителя",
      field_type: "longtext",
      visible_when: "materials_provider in ['client','mixed']",
      required_when: "materials_provider in ['client','mixed']" },
    { id: "risk_before_acceptance", section: "materials",
      label: "Кой носи риска до приемане на изработеното?",
      field_type: "select", required_when: "true", default: "contractor",
      options: [
        { value: "contractor", label: "Изпълнителят" },
        { value: "client", label: "Възложителят" },
      ],
      affects_clauses: ["risk_contractor", "risk_client"] },

    // Schedule -------------------------------------------------------------
    { id: "start_date", section: "schedule", label: "Начална дата",
      field_type: "date", required_when: "true" },
    { id: "deadline", section: "schedule", label: "Краен срок за изработка",
      field_type: "date", required_when: "true" },
    { id: "acceptance_with_protocol", section: "schedule",
      label: "Приемане с приемно-предавателен протокол?",
      field_type: "boolean", required_when: "true", default: true,
      affects_clauses: ["acceptance_protocol", "acceptance_informal"] },
    { id: "inspection_days", section: "schedule",
      label: "Срок за оглед и възражения (дни)",
      field_type: "number",
      visible_when: "acceptance_with_protocol == true",
      default: 7 },

    // Payment --------------------------------------------------------------
    { id: "price_model", section: "payment", label: "Ценообразуване",
      field_type: "select", required_when: "true",
      options: [
        { value: "fixed", label: "Твърда цена" },
        { value: "estimate", label: "По сметка (количествено-стойностна)" },
      ],
      affects_clauses: ["price_fixed", "price_estimate"] },
    { id: "total_price", section: "payment", label: "Обща цена (EUR, без ДДС)",
      field_type: "money", required_when: "true" },
    { id: "advance_pct", section: "payment", label: "Аванс (% от цената)",
      field_type: "number", default: 30,
      affects_clauses: ["advance_clause"] },
    { id: "payment_on_acceptance_days", section: "payment",
      label: "Срок за окончателно плащане след приемане (дни)",
      field_type: "number", required_when: "true", default: 14 },
    { id: "late_payment_penalty", section: "payment",
      label: "Неустойка за забавено плащане (% на ден)",
      field_type: "number", default: 0.05,
      affects_clauses: ["late_payment_penalty"] },
    { id: "late_delivery_penalty", section: "payment",
      label: "Неустойка за забавено изпълнение (% на ден)",
      field_type: "number", default: 0.05,
      affects_clauses: ["late_delivery_penalty"] },

    // Warranty -------------------------------------------------------------
    { id: "has_warranty", section: "warranty", label: "Договаряте ли гаранционен срок?",
      field_type: "boolean", required_when: "true", default: true,
      affects_clauses: ["warranty_clause"] },
    { id: "warranty_months", section: "warranty", label: "Гаранционен срок (месеци)",
      field_type: "number",
      visible_when: "has_warranty == true",
      required_when: "has_warranty == true", default: 12 },
    { id: "insurance_required", section: "warranty",
      label: "Изисква ли се застраховка професионална отговорност?",
      field_type: "boolean",
      affects_clauses: ["insurance_clause"] },

    // Signatures -----------------------------------------------------------
    { id: "place_signed", section: "signatures", label: "Място на подписване",
      field_type: "text", required_when: "true" },
    { id: "date_signed", section: "signatures", label: "Дата на подписване",
      field_type: "date", required_when: "true" },
  ],
};
