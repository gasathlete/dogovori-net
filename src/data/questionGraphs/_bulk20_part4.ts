/**
 * Bulk migration part 4 — 20 нови dynamic wizards.
 *
 * Подбор: TOP-badge шаблоните (наем, предв. договор, изработка на уебсайт,
 * пътуване на дете, тримата двуезични водачи), най-отваряните шаблони по
 * page_views (ДУК, гл. изпълнител—подизпълнител, Airbnb, CMR, счетоводно
 * обслужване, SLA, наем на МПС) и коверидж на важни HR/финансови образци
 * (допълнително споразумение, молба чл. 325 КТ, проформа фактура, учр. акт
 * ЕООД, консултантски договор).
 *
 * Ползва същия mini-DSL и exports като `_bulk20_part3.ts`.
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

  // 1. Договор за наем на недвижим имот (общ) --------------------------------
  "dogovor-za-naem-na-nedvizhim-imot": {
    graph: {
      template_slug: "dogovor-za-naem-na-nedvizhim-imot",
      title: "Договор за наем на недвижим имот",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "property", title: "Имот" },
        { id: "terms", title: "Срок и наем" },
        { id: "deposit", title: "Депозит" },
        { id: "rules", title: "Условия" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "landlord", section: "parties", label: "Наемодател", field_type: "party_list", required_when: "true" }),
        q({ id: "tenant", section: "parties", label: "Наемател", field_type: "party_list", required_when: "true" }),
        q({ id: "property_type", section: "property", label: "Тип имот", field_type: "select", required_when: "true",
          options: opts(["apartment","Апартамент"],["house","Къща"],["office","Офис"],["shop","Търговски обект"],["warehouse","Склад"],["land","Земя"]),
          affects_clauses: ["property_commercial","property_residential"] }),
        q({ id: "property_address", section: "property", label: "Адрес на имота", field_type: "longtext", required_when: "true" }),
        q({ id: "property_area", section: "property", label: "Площ (кв.м)", field_type: "number", required_when: "true" }),
        q({ id: "property_id_number", section: "property", label: "Идент. номер по КК/АС", field_type: "text" }),
        q({ id: "start_date", section: "terms", label: "Начална дата", field_type: "date", required_when: "true" }),
        q({ id: "term_months", section: "terms", label: "Срок (месеци)", field_type: "number", required_when: "true" }),
        q({ id: "rent_amount", section: "terms", label: "Месечен наем (EUR)", field_type: "money", required_when: "true" }),
        q({ id: "rent_due_day", section: "terms", label: "Ден на плащане (1–31)", field_type: "number", required_when: "true" }),
        q({ id: "vat_included", section: "terms", label: "Наемът включва ДДС", field_type: "boolean",
          affects_clauses: ["vat_included_clause"] }),
        q({ id: "deposit_amount", section: "deposit", label: "Депозит (EUR)", field_type: "money" }),
        q({ id: "utilities_paid_by", section: "rules", label: "Консумативи се плащат от", field_type: "select",
          options: opts(["tenant","Наемател"],["landlord","Наемодател"],["split","Разпределени"]) }),
        q({ id: "sublease_allowed", section: "rules", label: "Разрешено пренаемане", field_type: "boolean",
          affects_clauses: ["sublease_allow","sublease_deny"] }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "subject", order: 10, title: "Предмет", body_md: "Наемодателят предоставя за временно и възмездно ползване на Наемателя следния недвижим имот: {{property_type}} с площ {{property_area}} кв.м, находящ се на адрес: {{property_address}}. Идентификатор по КК/АС: {{property_id_number}}.", severity: "required" },
      { clause_id: "term", order: 20, title: "Срок и цена", body_md: "Договорът се сключва за срок от {{term_months}} месеца, считано от {{start_date}}. Месечният наем е {{rent_amount}} EUR, платим до {{rent_due_day}}-о число на съответния месец.", severity: "required" },
      { clause_id: "vat_included_clause", order: 21, title: "ДДС", body_md: "Наемната цена включва ДДС.", include_when: "vat_included == true", severity: "recommended" },
      { clause_id: "deposit", order: 30, title: "Депозит", body_md: "При подписването Наемателят внася депозит в размер на {{deposit_amount}} EUR, който служи за обезпечение на задълженията му.", include_when: "deposit_amount != null", severity: "recommended" },
      { clause_id: "utilities", order: 40, title: "Консумативи", body_md: "Консумативните разходи (ел. енергия, вода, отопление, интернет и др.) се поемат от: {{utilities_paid_by}}.", severity: "recommended" },
      { clause_id: "sublease_allow", order: 50, title: "Пренаемане", body_md: "Наемателят има право да преотдаде имота с писмено съгласие на Наемодателя.", include_when: "sublease_allowed == true", severity: "optional" },
      { clause_id: "sublease_deny", order: 51, title: "Забрана за пренаемане", body_md: "Пренаемането е забранено без изричното писмено съгласие на Наемодателя.", include_when: "sublease_allowed == false", severity: "recommended" },
    ],
  },

  // 2. Предварителен договор за покупка на имот ------------------------------
  "predvaritelen-dogovor-za-pokupka-na-imot": {
    graph: {
      template_slug: "predvaritelen-dogovor-za-pokupka-na-imot",
      title: "Предварителен договор за покупка на имот",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "property", title: "Имот" },
        { id: "price", title: "Цена и капаро" },
        { id: "deadline", title: "Срокове" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "seller", section: "parties", label: "Продавач", field_type: "party_list", required_when: "true" }),
        q({ id: "buyer", section: "parties", label: "Купувач", field_type: "party_list", required_when: "true" }),
        q({ id: "property_description", section: "property", label: "Описание на имота", field_type: "longtext", required_when: "true" }),
        q({ id: "property_address", section: "property", label: "Адрес", field_type: "text", required_when: "true" }),
        q({ id: "property_area", section: "property", label: "Площ (кв.м)", field_type: "number", required_when: "true" }),
        q({ id: "property_id_number", section: "property", label: "Идентификатор по КК", field_type: "text", required_when: "true" }),
        q({ id: "total_price", section: "price", label: "Продажна цена (EUR)", field_type: "money", required_when: "true" }),
        q({ id: "deposit_amount", section: "price", label: "Капаро (EUR)", field_type: "money", required_when: "true" }),
        q({ id: "deposit_paid_at_signing", section: "price", label: "Капарото се плаща при подписване", field_type: "boolean",
          affects_clauses: ["deposit_now","deposit_bank"] }),
        q({ id: "final_deadline", section: "deadline", label: "Краен срок за нотариален акт", field_type: "date", required_when: "true" }),
        q({ id: "financing_dependent", section: "deadline", label: "Сделката зависи от банков кредит", field_type: "boolean",
          affects_clauses: ["financing_clause","financing_letter"] }),
        q({ id: "financing_letter_days", section: "deadline", label: "Срок за представяне на писмо-ангажимент от банка (дни)", field_type: "number", default: "14",
          visible_when: "financing_dependent == true" }),
        q({ id: "penalty_multiplier", section: "deadline", label: "Неустойка при отказ от продавача (× капаро, по чл. 93, ал. 2 ЗЗД)", field_type: "number", default: "2" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "subject", order: 10, title: "Предмет", body_md: "Страните се задължават да сключат окончателен договор във формата на нотариален акт за покупко-продажба на следния недвижим имот: {{property_description}}, находящ се на адрес {{property_address}}, с площ {{property_area}} кв.м, идентификатор {{property_id_number}}.", severity: "required" },
      { clause_id: "price", order: 20, title: "Цена", body_md: "Продажната цена е в размер на {{total_price}} EUR.", severity: "required" },
      { clause_id: "deposit_now", order: 30, title: "Капаро (задатък по чл. 93 ЗЗД)", body_md: "Купувачът заплаща при подписване на настоящия предварителен договор задатък по смисъла на чл. 93 ЗЗД в размер на {{deposit_amount}} EUR, който се приспада от продажната цена при сключване на окончателния договор.", include_when: "deposit_paid_at_signing == true", severity: "required" },
      { clause_id: "deposit_bank", order: 31, title: "Капаро (банков превод)", body_md: "Купувачът превежда по банков път задатък по смисъла на чл. 93 ЗЗД в размер на {{deposit_amount}} EUR в срок от 3 работни дни от подписване. Задатъкът се приспада от продажната цена при сключване на окончателния договор.", include_when: "deposit_paid_at_signing == false", severity: "required" },
      { clause_id: "financing_clause", order: 40, title: "Финансиране с банков кредит", body_md: "Страните се съгласяват, че изпълнението на договора от страна на Купувача зависи от одобрен ипотечен кредит. При документиран писмен отказ от кредитиращата банка, представен на Продавача в срока по следващата клауза, настоящият договор се прекратява по право и задатъкът се връща на Купувача в пълен размер, без санкция за нито една от страните.", include_when: "financing_dependent == true", severity: "recommended" },
      { clause_id: "financing_letter", order: 41, title: "Писмо-ангажимент от банка", body_md: "Купувачът се задължава в срок от {{financing_letter_days}} дни от подписване на настоящия договор да предостави на Продавача писмо-ангажимент (letter of intent) от кредитираща банка за отпускане на ипотечен кредит, покриващ разликата между продажната цена и задатъка. При непредставяне на писмо-ангажимент в посочения срок и при липса на документиран банков отказ, Продавачът има право да развали договора и да задържи задатъка съгласно чл. 93, ал. 2 ЗЗД.", include_when: "financing_dependent == true", severity: "recommended" },
      { clause_id: "deadline", order: 50, title: "Срок за нотариален акт", body_md: "Окончателният договор ще бъде сключен в срок до {{final_deadline}}. Изправната страна може да иска обявяване на предварителния договор за окончателен по реда на чл. 19, ал. 3 ЗЗД.", severity: "required" },
      { clause_id: "penalty", order: 60, title: "Отговорност при неизпълнение (чл. 93, ал. 2 ЗЗД)", body_md: "(1) При виновно неизпълнение от страна на Купувача, Продавачът задържа задатъка в единичен размер. (2) При виновно неизпълнение от страна на Продавача, той дължи на Купувача връщане на задатъка в размер, равен на {{penalty_multiplier}} пъти получения задатък. (3) Двойният размер по ал. 2 включва обезщетителната функция по чл. 93, ал. 2 ЗЗД и не се кумулира с отделна неустойка за същата вреда. Изправната страна запазва правото си да иска изпълнение на договора вместо задържане/двоен размер.", severity: "required" },
    ],
  },

  // 3. Договор за изработка на уебсайт/мобилно приложение --------------------
  "dogovor-za-izrabotka-na-uebsayt-mobilno-prilozhenie": {
    graph: {
      template_slug: "dogovor-za-izrabotka-na-uebsayt-mobilno-prilozhenie",
      title: "Договор за изработка на уебсайт / мобилно приложение",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "scope", title: "Обхват" },
        { id: "schedule", title: "Срокове" },
        { id: "payment", title: "Възнаграждение" },
        { id: "ip", title: "Авторски права" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "client", section: "parties", label: "Възложител", field_type: "party_list", required_when: "true" }),
        q({ id: "contractor", section: "parties", label: "Изпълнител", field_type: "party_list", required_when: "true" }),
        q({ id: "product_type", section: "scope", label: "Тип продукт", field_type: "select", required_when: "true",
          options: opts(["website","Уебсайт"],["mobile_app","Мобилно приложение"],["both","И двете"]) }),
        q({ id: "scope_description", section: "scope", label: "Кратко описание / техническо задание", field_type: "longtext", required_when: "true" }),
        q({ id: "platforms", section: "scope", label: "Платформи (iOS/Android/Web)", field_type: "text", visible_when: "product_type in ['mobile_app','both']" }),
        q({ id: "milestones_json", section: "schedule", label: "Етапи (JSON или списък)", field_type: "longtext",
          help: "Пример: 1) Дизайн — 2 седмици; 2) Разработка — 6 седмици; 3) Тестове — 2 седмици." }),
        q({ id: "start_date", section: "schedule", label: "Начална дата", field_type: "date", required_when: "true" }),
        q({ id: "delivery_date", section: "schedule", label: "Краен срок за доставка", field_type: "date", required_when: "true" }),
        q({ id: "total_price", section: "payment", label: "Обща цена (EUR)", field_type: "money", required_when: "true" }),
        q({ id: "payment_schedule", section: "payment", label: "График на плащане", field_type: "select", required_when: "true",
          options: opts(["upfront_50_final_50","50% авансово / 50% при приемане"],["milestone","По етапи"],["monthly","Месечно"]) }),
        q({ id: "ip_transfer_on_payment", section: "ip", label: "Прехвърляне на авторски права след пълно плащане", field_type: "boolean", default: "true",
          affects_clauses: ["ip_transfer_clause"] }),
        q({ id: "source_code_delivery", section: "ip", label: "Предаване на изходния код", field_type: "boolean", default: "true",
          affects_clauses: ["source_code_clause"] }),
        q({ id: "warranty_months", section: "ip", label: "Гаранционен период (месеци)", field_type: "number", default: "3" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "subject", order: 10, title: "Предмет", body_md: "Изпълнителят се задължава да изработи за Възложителя {{product_type}} съгласно следното задание: {{scope_description}}.", severity: "required" },
      { clause_id: "platforms", order: 15, title: "Платформи", body_md: "Продуктът се разработва за: {{platforms}}.", include_when: "platforms != ''", severity: "recommended" },
      { clause_id: "schedule", order: 20, title: "Срокове", body_md: "Начало: {{start_date}}. Краен срок за доставка: {{delivery_date}}.\nЕтапи: {{milestones_json}}.", severity: "required" },
      { clause_id: "payment", order: 30, title: "Възнаграждение", body_md: "Общата цена е {{total_price}} EUR. Схема на плащане: {{payment_schedule}}.", severity: "required" },
      { clause_id: "ip_transfer_clause", order: 40, title: "Авторски права", body_md: "След заплащане на пълния размер на възнаграждението, авторските права върху разработения продукт преминават изцяло върху Възложителя.", include_when: "ip_transfer_on_payment == true", severity: "required" },
      { clause_id: "source_code_clause", order: 45, title: "Изходен код", body_md: "Изпълнителят предава на Възложителя пълния изходен код и придружаваща документация в срок до 10 дни след финалното плащане.", include_when: "source_code_delivery == true", severity: "required" },
      { clause_id: "warranty", order: 50, title: "Гаранция", body_md: "Изпълнителят гарантира отстраняване на дефекти в срок от {{warranty_months}} месеца от приемането.", severity: "recommended" },
    ],
  },

  // 4. Декларация за пътуване на дете в чужбина ------------------------------
  "deklaratsiya-za-patuvane-na-dete-v-chuzhbina": {
    graph: {
      template_slug: "deklaratsiya-za-patuvane-na-dete-v-chuzhbina",
      title: "Декларация за пътуване на дете в чужбина",
      sections: [
        { id: "parent", title: "Родител / настойник" },
        { id: "child", title: "Дете" },
        { id: "travel", title: "Пътуване" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "parent_name", section: "parent", label: "Име на родителя/настойника", field_type: "text", required_when: "true" }),
        q({ id: "parent_egn", section: "parent", label: "ЕГН", field_type: "text", required_when: "true" }),
        q({ id: "parent_id_doc", section: "parent", label: "Лична карта № / издадена от", field_type: "text", required_when: "true" }),
        q({ id: "parent_role", section: "parent", label: "Качество", field_type: "select", required_when: "true",
          options: opts(["mother","Майка"],["father","Баща"],["guardian","Настойник"]) }),
        q({ id: "child_name", section: "child", label: "Име на детето", field_type: "text", required_when: "true" }),
        q({ id: "child_egn", section: "child", label: "ЕГН", field_type: "text", required_when: "true" }),
        q({ id: "child_passport", section: "child", label: "Паспорт / лична карта №", field_type: "text" }),
        q({ id: "accompanying", section: "travel", label: "Придружител (име, ЕГН, качество)", field_type: "longtext", required_when: "true" }),
        q({ id: "destinations", section: "travel", label: "Държави на пътуване", field_type: "text", required_when: "true" }),
        q({ id: "travel_from", section: "travel", label: "Период — от", field_type: "date", required_when: "true" }),
        q({ id: "travel_to", section: "travel", label: "Период — до", field_type: "date", required_when: "true" }),
        q({ id: "multiple_trips", section: "travel", label: "Многократни пътувания в периода", field_type: "boolean",
          affects_clauses: ["multi_trip_clause"] }),
        q({ id: "purpose", section: "travel", label: "Цел на пътуването", field_type: "text" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "intro", order: 10, title: "Декларация", body_md: "Долуподписаният/ата {{parent_name}}, ЕГН {{parent_egn}}, л.к. {{parent_id_doc}}, в качеството си на {{parent_role}} на детето {{child_name}}, ЕГН {{child_egn}}, документ {{child_passport}}, декларирам изричното си съгласие детето ми да пътува извън територията на Република България.", severity: "required" },
      { clause_id: "travel", order: 20, title: "Условия", body_md: "Пътуването е до: {{destinations}}, в периода {{travel_from}} — {{travel_to}}, придружено от: {{accompanying}}.", severity: "required" },
      { clause_id: "purpose", order: 25, title: "Цел", body_md: "Цел на пътуването: {{purpose}}.", include_when: "purpose != ''", severity: "optional" },
      { clause_id: "multi_trip_clause", order: 30, title: "Многократни пътувания", body_md: "Съгласието обхваща многократни пътувания в посочения период.", include_when: "multiple_trips == true", severity: "recommended" },
      { clause_id: "notary", order: 40, title: "Нотариална заверка", body_md: "Настоящата декларация се представя с нотариално заверен подпис.", severity: "required" },
    ],
  },

  // 5. Двуезичен трудов договор BG/EN ----------------------------------------
  "dvuezichen-trudov-dogovor-bg-en": {
    graph: {
      template_slug: "dvuezichen-trudov-dogovor-bg-en",
      title: "Двуезичен трудов договор (BG/EN)",
      sections: [
        { id: "parties", title: "Страни / Parties" },
        { id: "job", title: "Длъжност / Position" },
        { id: "terms", title: "Условия / Terms" },
        { id: "compensation", title: "Възнаграждение / Compensation" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "employer", section: "parties", label: "Работодател / Employer", field_type: "party_list", required_when: "true" }),
        q({ id: "employee", section: "parties", label: "Служител / Employee", field_type: "party_list", required_when: "true" }),
        q({ id: "position_bg", section: "job", label: "Длъжност (BG)", field_type: "text", required_when: "true" }),
        q({ id: "position_en", section: "job", label: "Position (EN)", field_type: "text", required_when: "true" }),
        q({ id: "workplace", section: "job", label: "Място на работа / Workplace", field_type: "text", required_when: "true" }),
        q({ id: "contract_basis", section: "terms", label: "Основание", field_type: "select", required_when: "true",
          options: opts(["chl_67","чл. 67 КТ — безсрочен"],["chl_68","чл. 68 КТ — срочен"],["chl_111","чл. 111 КТ — доп. труд"]) }),
        q({ id: "start_date", section: "terms", label: "Начална дата / Start date", field_type: "date", required_when: "true" }),
        q({ id: "end_date", section: "terms", label: "Крайна дата (ако е срочен)", field_type: "date",
          visible_when: "contract_basis == 'chl_68'", required_when: "contract_basis == 'chl_68'" }),
        q({ id: "working_hours", section: "terms", label: "Работно време (часове/седмица)", field_type: "number", default: "40" }),
        q({ id: "probation_months", section: "terms", label: "Изпитателен срок (месеци)", field_type: "number" }),
        q({ id: "gross_salary", section: "compensation", label: "Брутно възнаграждение (EUR)", field_type: "money", required_when: "true" }),
        q({ id: "paid_leave_days", section: "compensation", label: "Платен годишен отпуск (дни)", field_type: "number", default: "20" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "subject_bg", order: 10, title: "Предмет (BG)", body_md: "Работодателят възлага, а Служителят приема да изпълнява длъжността „{{position_bg}}\" на място на работа: {{workplace}}, на основание {{contract_basis}} КТ.", severity: "required" },
      { clause_id: "subject_en", order: 11, title: "Subject (EN)", body_md: "The Employer assigns and the Employee accepts to hold the position of \"{{position_en}}\" at workplace: {{workplace}}, based on {{contract_basis}} of the Bulgarian Labour Code.", severity: "required" },
      { clause_id: "term", order: 20, title: "Срок / Term", body_md: "Начална дата: {{start_date}}. Работно време: {{working_hours}} часа седмично.", severity: "required" },
      { clause_id: "term_fixed", order: 21, title: "Срочен договор", body_md: "Крайна дата: {{end_date}}.", include_when: "contract_basis == 'chl_68'", severity: "required" },
      { clause_id: "probation", order: 25, title: "Изпитателен срок", body_md: "Договорът се сключва с изпитателен срок от {{probation_months}} месеца в полза на Работодателя.", include_when: "probation_months != null", severity: "recommended" },
      { clause_id: "salary", order: 30, title: "Възнаграждение / Salary", body_md: "Брутно месечно възнаграждение: {{gross_salary}} EUR. / Gross monthly salary: {{gross_salary}} EUR.", severity: "required" },
      { clause_id: "leave", order: 40, title: "Отпуск / Leave", body_md: "Платен годишен отпуск: {{paid_leave_days}} работни дни. / Paid annual leave: {{paid_leave_days}} working days.", severity: "recommended" },
    ],
  },

  // 6. Двуезичен NDA BG/EN ---------------------------------------------------
  "dvuezichen-nda-non-disclosure-agreement": {
    graph: {
      template_slug: "dvuezichen-nda-non-disclosure-agreement",
      title: "Двуезичен NDA (BG/EN)",
      sections: [
        { id: "parties", title: "Страни / Parties" },
        { id: "scope", title: "Обхват / Scope" },
        { id: "terms", title: "Срок / Term" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "disclosing_party", section: "parties", label: "Разкриваща страна / Disclosing Party", field_type: "party_list", required_when: "true" }),
        q({ id: "receiving_party", section: "parties", label: "Получаваща страна / Receiving Party", field_type: "party_list", required_when: "true" }),
        q({ id: "mutual", section: "scope", label: "Двустранен NDA (mutual)", field_type: "boolean",
          affects_clauses: ["mutual_clause","oneway_clause"] }),
        q({ id: "purpose_bg", section: "scope", label: "Цел на разкриване (BG)", field_type: "longtext", required_when: "true" }),
        q({ id: "purpose_en", section: "scope", label: "Purpose (EN)", field_type: "longtext", required_when: "true" }),
        q({ id: "confidential_scope", section: "scope", label: "Типове конфиденциална информация", field_type: "multiselect",
          options: opts(["technical","Техническа"],["commercial","Търговска"],["financial","Финансова"],["personal_data","Лични данни"],["source_code","Изходен код"]) }),
        q({ id: "term_years", section: "terms", label: "Срок на задължението (години)", field_type: "number", default: "3", required_when: "true" }),
        q({ id: "governing_law", section: "terms", label: "Приложимо право", field_type: "select", default: "bg",
          options: opts(["bg","България"],["en","Англия и Уелс"],["other","Друго"]) }),
        q({ id: "penalty_amount", section: "terms", label: "Неустойка при нарушение (EUR)", field_type: "money" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "mutual_clause", order: 10, title: "Взаимност / Mutuality", body_md: "Задълженията са взаимни за двете страни. / The obligations are mutual for both parties.", include_when: "mutual == true", severity: "required" },
      { clause_id: "oneway_clause", order: 11, title: "Едностранно / One-way", body_md: "Задълженията са едностранни в полза на Разкриващата страна. / Obligations are one-way in favour of the Disclosing Party.", include_when: "mutual == false", severity: "required" },
      { clause_id: "purpose", order: 20, title: "Цел / Purpose", body_md: "{{purpose_bg}}\n\n---\n\n{{purpose_en}}", severity: "required" },
      { clause_id: "term", order: 30, title: "Срок / Term", body_md: "Задълженията за конфиденциалност се поемат за срок от {{term_years}} години. / The confidentiality obligations shall remain in force for {{term_years}} years.", severity: "required" },
      { clause_id: "penalty", order: 40, title: "Неустойка / Liquidated damages", body_md: "При нарушение нарушилата страна дължи неустойка в размер на {{penalty_amount}} EUR. / In case of breach, the breaching party shall pay liquidated damages of {{penalty_amount}} EUR.", include_when: "penalty_amount != null", severity: "recommended" },
      { clause_id: "law", order: 50, title: "Приложимо право / Governing law", body_md: "Приложимо право: {{governing_law}}. / Governing law: {{governing_law}}.", severity: "required" },
    ],
  },

  // 7. Двуезична DPA (GDPR) BG/EN --------------------------------------------
  "dvuezichna-data-processing-agreement-dpa-gdpr": {
    graph: {
      template_slug: "dvuezichna-data-processing-agreement-dpa-gdpr",
      title: "Двуезична Data Processing Agreement (DPA, GDPR)",
      sections: [
        { id: "parties", title: "Страни / Parties" },
        { id: "processing", title: "Обработване / Processing" },
        { id: "security", title: "Сигурност / Security" },
        { id: "transfers", title: "Международни трансфери" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "controller", section: "parties", label: "Администратор / Controller", field_type: "party_list", required_when: "true" }),
        q({ id: "processor", section: "parties", label: "Обработващ / Processor", field_type: "party_list", required_when: "true" }),
        q({ id: "processing_purpose", section: "processing", label: "Цел на обработване", field_type: "longtext", required_when: "true" }),
        q({ id: "data_categories", section: "processing", label: "Категории лични данни", field_type: "multiselect", required_when: "true",
          options: opts(["identity","Идентификационни"],["contact","Контактни"],["financial","Финансови"],["health","Здравословни"],["special","Специални категории"]) }),
        q({ id: "data_subjects", section: "processing", label: "Категории субекти", field_type: "text", required_when: "true" }),
        q({ id: "retention_period", section: "processing", label: "Период на съхранение", field_type: "text", required_when: "true" }),
        q({ id: "subprocessors_allowed", section: "security", label: "Разрешени подобработващи", field_type: "boolean",
          affects_clauses: ["subprocessors_clause"] }),
        q({ id: "security_measures", section: "security", label: "Технически и организационни мерки", field_type: "longtext",
          default: "Криптиране в покой и при пренос; контрол на достъпа; журнали; периодични одити." }),
        q({ id: "breach_notification_hours", section: "security", label: "Срок за уведомяване при инцидент (часове)", field_type: "number", default: "72" }),
        q({ id: "international_transfers", section: "transfers", label: "Международни трансфери извън ЕИП", field_type: "boolean",
          affects_clauses: ["sccs_clause"] }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "subject", order: 10, title: "Предмет / Subject", body_md: "Обработващият обработва лични данни от името на Администратора за следната цел: {{processing_purpose}}. / The Processor processes personal data on behalf of the Controller for: {{processing_purpose}}.", severity: "required" },
      { clause_id: "scope", order: 20, title: "Обхват / Scope", body_md: "Категории данни: {{data_categories}}. Субекти: {{data_subjects}}. Срок на съхранение: {{retention_period}}.", severity: "required" },
      { clause_id: "security", order: 30, title: "Сигурност / Security", body_md: "Обработващият внедрява следните мерки: {{security_measures}}.", severity: "required" },
      { clause_id: "breach", order: 35, title: "Инциденти / Breach", body_md: "При установяване на инцидент Обработващият уведомява Администратора без ненужно забавяне, но не по-късно от {{breach_notification_hours}} часа. / The Processor shall notify the Controller without undue delay and no later than {{breach_notification_hours}} hours.", severity: "required" },
      { clause_id: "subprocessors_clause", order: 40, title: "Подобработващи", body_md: "Ангажирането на подобработващи е разрешено с общо предварително разрешение и водене на актуален списък.", include_when: "subprocessors_allowed == true", severity: "recommended" },
      { clause_id: "sccs_clause", order: 50, title: "Международни трансфери / International transfers", body_md: "При трансфер извън ЕИП страните прилагат Стандартните договорни клаузи на Комисията (SCCs). / For transfers outside the EEA, the parties apply the EU Standard Contractual Clauses (SCCs).", include_when: "international_transfers == true", severity: "required" },
    ],
  },

  // 8. Договор за консултантски услуги ---------------------------------------
  "dogovor-za-konsultantski-uslugi": {
    graph: {
      template_slug: "dogovor-za-konsultantski-uslugi",
      title: "Договор за консултантски услуги",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "scope", title: "Услуги" },
        { id: "terms", title: "Срок и цена" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "client", section: "parties", label: "Възложител", field_type: "party_list", required_when: "true" }),
        q({ id: "consultant", section: "parties", label: "Консултант", field_type: "party_list", required_when: "true" }),
        q({ id: "services_description", section: "scope", label: "Обхват на консултантските услуги", field_type: "longtext", required_when: "true" }),
        q({ id: "deliverables", section: "scope", label: "Резултати (deliverables)", field_type: "longtext" }),
        q({ id: "engagement_type", section: "terms", label: "Тип ангажимент", field_type: "select", required_when: "true",
          options: opts(["fixed","Фиксирана цена"],["hourly","Почасов"],["retainer","Месечен ритейнър"]) }),
        q({ id: "total_price", section: "terms", label: "Обща цена / ставка (EUR)", field_type: "money", required_when: "true" }),
        q({ id: "start_date", section: "terms", label: "Начална дата", field_type: "date", required_when: "true" }),
        q({ id: "end_date", section: "terms", label: "Крайна дата", field_type: "date" }),
        q({ id: "exclusivity", section: "terms", label: "Ексклузивност", field_type: "boolean",
          affects_clauses: ["exclusivity_clause"] }),
        q({ id: "confidentiality", section: "terms", label: "Клауза за конфиденциалност", field_type: "boolean", default: "true",
          affects_clauses: ["confidentiality_clause"] }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "subject", order: 10, title: "Предмет", body_md: "Консултантът се задължава да предоставя на Възложителя следните консултантски услуги: {{services_description}}.", severity: "required" },
      { clause_id: "deliverables", order: 15, title: "Резултати", body_md: "Очаквани резултати: {{deliverables}}.", include_when: "deliverables != ''", severity: "recommended" },
      { clause_id: "term", order: 20, title: "Срок", body_md: "Начало: {{start_date}}. Край: {{end_date}}.", severity: "required" },
      { clause_id: "price", order: 30, title: "Възнаграждение", body_md: "Тип ангажимент: {{engagement_type}}. Цена/ставка: {{total_price}} EUR.", severity: "required" },
      { clause_id: "exclusivity_clause", order: 40, title: "Ексклузивност", body_md: "За срока на договора Консултантът не може да предоставя аналогични услуги на преки конкуренти на Възложителя без писмено съгласие.", include_when: "exclusivity == true", severity: "optional" },
      { clause_id: "confidentiality_clause", order: 50, title: "Конфиденциалност", body_md: "Консултантът се задължава да пази в тайна цялата информация, до която е получил достъп при изпълнение на услугите.", include_when: "confidentiality == true", severity: "recommended" },
    ],
  },

  // 9. Договор за управление и контрол (ДУК) ---------------------------------
  "dogovor-za-upravlenie-i-kontrol-duk": {
    graph: {
      template_slug: "dogovor-za-upravlenie-i-kontrol-duk",
      title: "Договор за управление и контрол (ДУК)",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "scope", title: "Правомощия" },
        { id: "terms", title: "Срок и възнаграждение" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "company", section: "parties", label: "Дружество", field_type: "party_list", required_when: "true" }),
        q({ id: "manager", section: "parties", label: "Управител / член на съвет", field_type: "party_list", required_when: "true" }),
        q({ id: "role", section: "scope", label: "Позиция", field_type: "select", required_when: "true",
          options: opts(["upravitel","Управител на ООД/ЕООД"],["izpalnitelen_direktor","Изпълнителен директор"],["chlen_sd","Член на СД"]) }),
        q({ id: "authority_limits", section: "scope", label: "Ограничения на правомощията", field_type: "longtext",
          help: "Например: сделки над 50 000 EUR — с решение на ОС." }),
        q({ id: "term_type", section: "terms", label: "Срок", field_type: "select", required_when: "true",
          options: opts(["indefinite","Безсрочен"],["fixed","Срочен"]) }),
        q({ id: "end_date", section: "terms", label: "Крайна дата", field_type: "date", visible_when: "term_type == 'fixed'", required_when: "term_type == 'fixed'" }),
        q({ id: "start_date", section: "terms", label: "Начална дата", field_type: "date", required_when: "true" }),
        q({ id: "gross_salary", section: "terms", label: "Месечно възнаграждение (EUR)", field_type: "money", required_when: "true" }),
        q({ id: "bonus_scheme", section: "terms", label: "Бонусна схема", field_type: "longtext" }),
        q({ id: "non_compete_months", section: "terms", label: "Неконкуриране след прекратяване (месеци)", field_type: "number",
          affects_clauses: ["non_compete_clause"] }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "subject", order: 10, title: "Предмет", body_md: "Дружеството възлага, а Управителят приема да изпълнява длъжността {{role}} с всички произтичащи от закона и устава правомощия.", severity: "required" },
      { clause_id: "limits", order: 20, title: "Ограничения", body_md: "Правомощията са ограничени, както следва: {{authority_limits}}.", include_when: "authority_limits != ''", severity: "recommended" },
      { clause_id: "term", order: 30, title: "Срок", body_md: "Начална дата: {{start_date}}. Срок: {{term_type}}.", severity: "required" },
      { clause_id: "term_end", order: 31, title: "Краен срок", body_md: "Договорът се прекратява на {{end_date}}.", include_when: "term_type == 'fixed'", severity: "required" },
      { clause_id: "salary", order: 40, title: "Възнаграждение", body_md: "Месечно възнаграждение: {{gross_salary}} EUR. Бонусна схема: {{bonus_scheme}}.", severity: "required" },
      { clause_id: "non_compete_clause", order: 50, title: "Неконкуриране", body_md: "За срок от {{non_compete_months}} месеца след прекратяване Управителят се задължава да не извършва конкурентна дейност.", include_when: "non_compete_months != null", severity: "optional" },
    ],
  },

  // 10. Договор главен изпълнител – подизпълнител ----------------------------
  "dogovor-glaven-izpalnitel-podizpalnitel": {
    graph: {
      template_slug: "dogovor-glaven-izpalnitel-podizpalnitel",
      title: "Договор главен изпълнител – подизпълнител",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "scope", title: "Обект и обхват" },
        { id: "terms", title: "Срок и цена" },
        { id: "quality", title: "Качество и приемане" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "main_contractor", section: "parties", label: "Главен изпълнител", field_type: "party_list", required_when: "true" }),
        q({ id: "subcontractor", section: "parties", label: "Подизпълнител", field_type: "party_list", required_when: "true" }),
        q({ id: "main_contract_ref", section: "parties", label: "Основен договор (номер / възложител)", field_type: "text", required_when: "true" }),
        q({ id: "site_address", section: "scope", label: "Обект (адрес)", field_type: "text", required_when: "true" }),
        q({ id: "works_description", section: "scope", label: "Описание на СМР / услуги", field_type: "longtext", required_when: "true" }),
        q({ id: "start_date", section: "terms", label: "Начална дата", field_type: "date", required_when: "true" }),
        q({ id: "end_date", section: "terms", label: "Краен срок", field_type: "date", required_when: "true" }),
        q({ id: "price_type", section: "terms", label: "Тип цена", field_type: "select", required_when: "true",
          options: opts(["fixed","Твърда"],["unit","По количества"]) }),
        q({ id: "total_price", section: "terms", label: "Обща цена (EUR)", field_type: "money", required_when: "true" }),
        q({ id: "advance_pct", section: "terms", label: "Аванс (%)", field_type: "number" }),
        q({ id: "retention_pct", section: "quality", label: "Задържане (%) до гаранционен срок", field_type: "number", default: "5" }),
        q({ id: "warranty_months", section: "quality", label: "Гаранционен срок (месеци)", field_type: "number", default: "12" }),
        q({ id: "penalty_per_day_pct", section: "quality", label: "Неустойка за забава (% на ден)", field_type: "number", default: "0.1" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "subject", order: 10, title: "Предмет", body_md: "Подизпълнителят се задължава да извърши следните работи на обект {{site_address}}: {{works_description}}. Работите са част от основен договор: {{main_contract_ref}}.", severity: "required" },
      { clause_id: "term", order: 20, title: "Срок", body_md: "Начало: {{start_date}}. Краен срок: {{end_date}}.", severity: "required" },
      { clause_id: "price", order: 30, title: "Цена", body_md: "Тип цена: {{price_type}}. Обща цена: {{total_price}} EUR.", severity: "required" },
      { clause_id: "advance", order: 31, title: "Аванс", body_md: "Аванс: {{advance_pct}}% от общата цена, изплащан в срок до 5 дни от подписване.", include_when: "advance_pct != null", severity: "optional" },
      { clause_id: "retention", order: 40, title: "Задържане", body_md: "Възложителят задържа {{retention_pct}}% от всяко плащане до изтичане на гаранционния срок.", severity: "recommended" },
      { clause_id: "warranty", order: 50, title: "Гаранция", body_md: "Гаранционен срок за извършените СМР: {{warranty_months}} месеца от подписване на приемно-предавателния протокол.", severity: "required" },
      { clause_id: "penalty", order: 60, title: "Неустойка", body_md: "При виновна забава Подизпълнителят дължи неустойка в размер на {{penalty_per_day_pct}}% от цената на забавената част за всеки ден забава, но не повече от 10%.", severity: "required" },
    ],
  },

  // 11. Договор за краткосрочен наем (Airbnb тип) ----------------------------
  "dogovor-za-kratkosrochen-naem-airbnb-tip": {
    graph: {
      template_slug: "dogovor-za-kratkosrochen-naem-airbnb-tip",
      title: "Договор за краткосрочен наем (Airbnb тип)",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "property", title: "Имот" },
        { id: "stay", title: "Престой" },
        { id: "rules", title: "Правила" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "host", section: "parties", label: "Домакин", field_type: "party_list", required_when: "true" }),
        q({ id: "guest", section: "parties", label: "Гост", field_type: "party_list", required_when: "true" }),
        q({ id: "property_address", section: "property", label: "Адрес на имота", field_type: "text", required_when: "true" }),
        q({ id: "guests_count", section: "property", label: "Брой гости", field_type: "number", required_when: "true" }),
        q({ id: "checkin_date", section: "stay", label: "Настаняване", field_type: "date", required_when: "true" }),
        q({ id: "checkin_time", section: "stay", label: "Час на настаняване", field_type: "text", default: "15:00" }),
        q({ id: "checkout_date", section: "stay", label: "Освобождаване", field_type: "date", required_when: "true" }),
        q({ id: "checkout_time", section: "stay", label: "Час на освобождаване", field_type: "text", default: "11:00" }),
        q({ id: "total_price", section: "stay", label: "Обща цена (EUR)", field_type: "money", required_when: "true" }),
        q({ id: "cleaning_fee", section: "stay", label: "Такса почистване (EUR)", field_type: "money" }),
        q({ id: "deposit", section: "stay", label: "Депозит за щети (EUR)", field_type: "money" }),
        q({ id: "pets_allowed", section: "rules", label: "Разрешени домашни любимци", field_type: "boolean" }),
        q({ id: "smoking_allowed", section: "rules", label: "Разрешено пушене", field_type: "boolean" }),
        q({ id: "parties_allowed", section: "rules", label: "Разрешени партита/събирания", field_type: "boolean" }),
        q({ id: "cancellation_policy", section: "rules", label: "Политика на анулиране", field_type: "select", required_when: "true", default: "moderate",
          options: opts(["flexible","Гъвкава — пълно връщане до 24ч"],["moderate","Умерена — пълно връщане до 5 дни"],["strict","Строга — 50% до 7 дни"]) }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "subject", order: 10, title: "Предмет", body_md: "Домакинът предоставя за краткосрочно ползване имот на адрес {{property_address}} за {{guests_count}} гости.", severity: "required" },
      { clause_id: "stay", order: 20, title: "Престой", body_md: "Настаняване: {{checkin_date}} след {{checkin_time}}. Освобождаване: {{checkout_date}} до {{checkout_time}}.", severity: "required" },
      { clause_id: "price", order: 30, title: "Цена", body_md: "Обща цена: {{total_price}} EUR. Такса почистване: {{cleaning_fee}} EUR. Депозит за щети: {{deposit}} EUR — възстановим при липса на щети.", severity: "required" },
      { clause_id: "rules", order: 40, title: "Правила", body_md: "Домашни любимци: {{pets_allowed}}. Пушене: {{smoking_allowed}}. Партита/шумни събирания: {{parties_allowed}}.", severity: "recommended" },
      { clause_id: "cancel", order: 50, title: "Анулиране", body_md: "Политика на анулиране: {{cancellation_policy}}.", severity: "required" },
    ],
  },

  // 12. Покана за свикване на Общо събрание ----------------------------------
  "pokana-za-svikvane-na-obshto-sabranie": {
    graph: {
      template_slug: "pokana-za-svikvane-na-obshto-sabranie",
      title: "Покана за свикване на Общо събрание",
      sections: [
        { id: "company", title: "Дружество" },
        { id: "meeting", title: "Събрание" },
        { id: "agenda", title: "Дневен ред" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "company_name", section: "company", label: "Наименование на дружеството", field_type: "text", required_when: "true" }),
        q({ id: "company_eik", section: "company", label: "ЕИК", field_type: "text", required_when: "true" }),
        q({ id: "company_legal_form", section: "company", label: "Правна форма", field_type: "select", required_when: "true",
          options: opts(["ood","ООД"],["eood","ЕООД"],["ad","АД"],["ead","ЕАД"]) }),
        q({ id: "convener", section: "company", label: "Свикващ (управител/СД)", field_type: "text", required_when: "true" }),
        q({ id: "meeting_date", section: "meeting", label: "Дата", field_type: "date", required_when: "true" }),
        q({ id: "meeting_time", section: "meeting", label: "Час", field_type: "text", required_when: "true" }),
        q({ id: "meeting_place", section: "meeting", label: "Място", field_type: "text", required_when: "true" }),
        q({ id: "meeting_type", section: "meeting", label: "Тип", field_type: "select", required_when: "true",
          options: opts(["redovno","Редовно"],["izvanredno","Извънредно"]) }),
        q({ id: "agenda_items", section: "agenda", label: "Точки от дневния ред", field_type: "longtext", required_when: "true",
          help: "Едно точка на ред." }),
        q({ id: "quorum_note", section: "agenda", label: "Кворум и материали", field_type: "longtext",
          default: "Материалите по дневния ред са на разположение в седалището. При липса на кворум събранието се отлага с един час на същото място при същия дневен ред." }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "intro", order: 10, title: "Покана", body_md: "{{convener}} — свикващ по чл. 138 ТЗ на {{company_legal_form}} „{{company_name}}\" (ЕИК {{company_eik}}), кани всички съдружници/акционери на {{meeting_type}} Общо събрание.", severity: "required" },
      { clause_id: "when", order: 20, title: "Дата, място, час", body_md: "Общото събрание ще се проведе на {{meeting_date}} от {{meeting_time}} часа в {{meeting_place}}.", severity: "required" },
      { clause_id: "agenda", order: 30, title: "Дневен ред", body_md: "{{agenda_items}}", severity: "required" },
      { clause_id: "quorum", order: 40, title: "Кворум и материали", body_md: "{{quorum_note}}", severity: "recommended" },
    ],
  },

  // 13. Договор за международен автомобилен превоз (CMR) --------------------
  "dogovor-za-mezhdunaroden-avtomobilen-prevoz-cmr": {
    graph: {
      template_slug: "dogovor-za-mezhdunaroden-avtomobilen-prevoz-cmr",
      title: "Договор за международен автомобилен превоз (CMR)",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "route", title: "Маршрут" },
        { id: "cargo", title: "Товар" },
        { id: "terms", title: "Условия" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "sender", section: "parties", label: "Изпращач", field_type: "party_list", required_when: "true" }),
        q({ id: "carrier", section: "parties", label: "Превозвач", field_type: "party_list", required_when: "true" }),
        q({ id: "consignee", section: "parties", label: "Получател", field_type: "party_list", required_when: "true" }),
        q({ id: "loading_place", section: "route", label: "Място на товарене", field_type: "text", required_when: "true" }),
        q({ id: "loading_date", section: "route", label: "Дата на товарене", field_type: "date", required_when: "true" }),
        q({ id: "unloading_place", section: "route", label: "Място на разтоварване", field_type: "text", required_when: "true" }),
        q({ id: "unloading_date", section: "route", label: "Дата на разтоварване", field_type: "date", required_when: "true" }),
        q({ id: "cargo_description", section: "cargo", label: "Описание на товара", field_type: "longtext", required_when: "true" }),
        q({ id: "cargo_weight", section: "cargo", label: "Тегло (кг)", field_type: "number", required_when: "true" }),
        q({ id: "cargo_value", section: "cargo", label: "Стойност на товара (EUR)", field_type: "money" }),
        q({ id: "adr", section: "cargo", label: "Опасни товари (ADR)", field_type: "boolean",
          affects_clauses: ["adr_clause"] }),
        q({ id: "freight_price", section: "terms", label: "Навло (EUR)", field_type: "money", required_when: "true" }),
        q({ id: "payment_terms_days", section: "terms", label: "Срок за плащане (дни от CMR)", field_type: "number", default: "30" }),
        q({ id: "insurance_required", section: "terms", label: "Изисква се CMR застраховка", field_type: "boolean", default: "true" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "subject", order: 10, title: "Предмет", body_md: "Превозвачът се задължава да извърши международен автомобилен превоз на товара по Конвенцията CMR от {{loading_place}} ({{loading_date}}) до {{unloading_place}} ({{unloading_date}}).", severity: "required" },
      { clause_id: "cargo", order: 20, title: "Товар", body_md: "Товар: {{cargo_description}}, тегло {{cargo_weight}} кг, стойност {{cargo_value}} EUR.", severity: "required" },
      { clause_id: "adr_clause", order: 25, title: "Опасни товари", body_md: "Товарът е с ADR клас. Превозвачът е длъжен да осигури ADR-сертифициран водач и оборудване.", include_when: "adr == true", severity: "required" },
      { clause_id: "freight", order: 30, title: "Навло", body_md: "Договорено навло: {{freight_price}} EUR, платимо в срок до {{payment_terms_days}} дни от получаване на подписан CMR.", severity: "required" },
      { clause_id: "insurance", order: 40, title: "Отговорност и застраховка", body_md: "Отговорността на Превозвача е съгласно чл. 17–23 CMR. Превозвачът поддържа валидна CMR застраховка.", include_when: "insurance_required == true", severity: "required" },
    ],
  },

  // 14. Договор за счетоводно обслужване -------------------------------------
  "dogovor-za-schetovodno-obsluzhvane": {
    graph: {
      template_slug: "dogovor-za-schetovodno-obsluzhvane",
      title: "Договор за счетоводно обслужване",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "scope", title: "Обхват" },
        { id: "terms", title: "Срок и цена" },
        { id: "responsibility", title: "Отговорност" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "client", section: "parties", label: "Възложител (клиент)", field_type: "party_list", required_when: "true" }),
        q({ id: "accountant", section: "parties", label: "Счетоводна кантора / счетоводител", field_type: "party_list", required_when: "true" }),
        q({ id: "services", section: "scope", label: "Обслужване", field_type: "multiselect", required_when: "true",
          options: opts(["monthly","Текущо счетоводство"],["payroll","ТРЗ и възнаграждения"],["vat","ДДС декларации"],["annual","Годишно приключване"],["reporting","Отчети към НСИ"],["nap","Представителство пред НАП"]) }),
        q({ id: "vat_registered", section: "scope", label: "Клиентът е регистриран по ДДС", field_type: "boolean",
          affects_clauses: ["vat_clause"] }),
        q({ id: "employees_count", section: "scope", label: "Приблизителен брой служители", field_type: "number", default: "0" }),
        q({ id: "monthly_fee", section: "terms", label: "Месечна такса (EUR)", field_type: "money", required_when: "true" }),
        q({ id: "annual_close_fee", section: "terms", label: "Такса годишно приключване (EUR)", field_type: "money" }),
        q({ id: "start_date", section: "terms", label: "Начална дата", field_type: "date", required_when: "true" }),
        q({ id: "notice_days", section: "terms", label: "Срок за прекратяване (дни)", field_type: "number", default: "30" }),
        q({ id: "insurance_liability_amount", section: "responsibility", label: "Застрахователно покритие (EUR)", field_type: "money" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "subject", order: 10, title: "Предмет", body_md: "Счетоводителят се задължава да предоставя на Възложителя следните услуги: {{services}}.", severity: "required" },
      { clause_id: "vat_clause", order: 15, title: "ДДС", body_md: "Клиентът е регистрирано по ЗДДС лице. Счетоводителят изготвя и подава месечните ДДС декларации.", include_when: "vat_registered == true", severity: "required" },
      { clause_id: "payroll", order: 20, title: "Персонал", body_md: "Обслужването включва ТРЗ за приблизително {{employees_count}} служители.", include_when: "employees_count > 0", severity: "recommended" },
      { clause_id: "price", order: 30, title: "Възнаграждение", body_md: "Месечна такса: {{monthly_fee}} EUR. Такса за годишно приключване: {{annual_close_fee}} EUR.", severity: "required" },
      { clause_id: "term", order: 40, title: "Срок и прекратяване", body_md: "Договорът е безсрочен, считано от {{start_date}}, и може да бъде прекратен от всяка от страните с {{notice_days}}-дневно писмено предизвестие.", severity: "required" },
      { clause_id: "liability", order: 50, title: "Отговорност", body_md: "Счетоводителят поддържа професионална застраховка „Отговорност\" в размер на {{insurance_liability_amount}} EUR.", include_when: "insurance_liability_amount != null", severity: "recommended" },
    ],
  },

  // 15. Договор за поддръжка на софтуер/хардуер (SLA) ------------------------
  "dogovor-za-poddrazhka-na-softuer-harduer-sla": {
    graph: {
      template_slug: "dogovor-za-poddrazhka-na-softuer-harduer-sla",
      title: "Договор за поддръжка на софтуер/хардуер (SLA)",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "scope", title: "Обхват" },
        { id: "sla", title: "SLA параметри" },
        { id: "commercial", title: "Цена" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "client", section: "parties", label: "Клиент", field_type: "party_list", required_when: "true" }),
        q({ id: "provider", section: "parties", label: "Доставчик", field_type: "party_list", required_when: "true" }),
        q({ id: "systems_covered", section: "scope", label: "Покрити системи / оборудване", field_type: "longtext", required_when: "true" }),
        q({ id: "support_level", section: "scope", label: "Ниво на поддръжка", field_type: "select", required_when: "true",
          options: opts(["basic","Basic — 5×8"],["standard","Standard — 5×12"],["premium","Premium — 7×24"]) }),
        q({ id: "uptime_pct", section: "sla", label: "Гарантиран uptime (%)", field_type: "number", default: "99.5", required_when: "true" }),
        q({ id: "response_p1_hours", section: "sla", label: "Време за реакция P1 (часове)", field_type: "number", default: "1" }),
        q({ id: "response_p2_hours", section: "sla", label: "Време за реакция P2 (часове)", field_type: "number", default: "4" }),
        q({ id: "resolution_p1_hours", section: "sla", label: "Време за разрешаване P1 (часове)", field_type: "number", default: "8" }),
        q({ id: "penalty_per_hour_pct", section: "sla", label: "Санкция за нарушен SLA (% от месечна такса на час)", field_type: "number", default: "1" }),
        q({ id: "monthly_fee", section: "commercial", label: "Месечна такса (EUR)", field_type: "money", required_when: "true" }),
        q({ id: "start_date", section: "commercial", label: "Начална дата", field_type: "date", required_when: "true" }),
        q({ id: "term_months", section: "commercial", label: "Срок (месеци)", field_type: "number", default: "12" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "subject", order: 10, title: "Предмет", body_md: "Доставчикът предоставя услуги по поддръжка на: {{systems_covered}}. Ниво на поддръжка: {{support_level}}.", severity: "required" },
      { clause_id: "uptime", order: 20, title: "Uptime", body_md: "Доставчикът гарантира минимален уptime от {{uptime_pct}}% на месечна база.", severity: "required" },
      { clause_id: "response", order: 25, title: "Време за реакция", body_md: "P1 инциденти: реакция до {{response_p1_hours}} ч., разрешаване до {{resolution_p1_hours}} ч. P2 инциденти: реакция до {{response_p2_hours}} ч.", severity: "required" },
      { clause_id: "penalty", order: 30, title: "Санкции", body_md: "При нарушение на SLA Доставчикът дължи неустойка в размер на {{penalty_per_hour_pct}}% от месечната такса за всеки час над договорения праг, но не повече от 30% от месечната такса.", severity: "required" },
      { clause_id: "price", order: 40, title: "Цена и срок", body_md: "Месечна такса: {{monthly_fee}} EUR. Начална дата: {{start_date}}. Срок: {{term_months}} месеца.", severity: "required" },
    ],
  },

  // 16. Договор за наем на МПС -----------------------------------------------
  "dogovor-za-naem-na-mps": {
    graph: {
      template_slug: "dogovor-za-naem-na-mps",
      title: "Договор за наем на МПС",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "vehicle", title: "Автомобил" },
        { id: "terms", title: "Срок и цена" },
        { id: "rules", title: "Правила" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "lessor", section: "parties", label: "Наемодател", field_type: "party_list", required_when: "true" }),
        q({ id: "lessee", section: "parties", label: "Наемател", field_type: "party_list", required_when: "true" }),
        q({ id: "vehicle_make_model", section: "vehicle", label: "Марка и модел", field_type: "text", required_when: "true" }),
        q({ id: "vehicle_reg_number", section: "vehicle", label: "Регистрационен номер", field_type: "text", required_when: "true" }),
        q({ id: "vehicle_vin", section: "vehicle", label: "VIN", field_type: "text", required_when: "true" }),
        q({ id: "vehicle_year", section: "vehicle", label: "Година на производство", field_type: "number" }),
        q({ id: "start_date", section: "terms", label: "Начална дата", field_type: "date", required_when: "true" }),
        q({ id: "end_date", section: "terms", label: "Крайна дата", field_type: "date", required_when: "true" }),
        q({ id: "rent_amount", section: "terms", label: "Наем (EUR)", field_type: "money", required_when: "true" }),
        q({ id: "rent_period", section: "terms", label: "Период на наема", field_type: "select", default: "daily",
          options: opts(["daily","На ден"],["weekly","На седмица"],["monthly","На месец"]) }),
        q({ id: "deposit", section: "terms", label: "Депозит (EUR)", field_type: "money" }),
        q({ id: "mileage_limit_km", section: "rules", label: "Лимит на пробег (км)", field_type: "number" }),
        q({ id: "over_mileage_price", section: "rules", label: "Цена над лимита (EUR/км)", field_type: "money" }),
        q({ id: "cross_border_allowed", section: "rules", label: "Разрешено пътуване в чужбина", field_type: "boolean",
          affects_clauses: ["cross_border_clause"] }),
        q({ id: "insurance_covered", section: "rules", label: "Каско е включено", field_type: "boolean" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "subject", order: 10, title: "Предмет", body_md: "Наемодателят предоставя за временно ползване моторно превозно средство {{vehicle_make_model}}, рег. № {{vehicle_reg_number}}, VIN {{vehicle_vin}}, година {{vehicle_year}}.", severity: "required" },
      { clause_id: "term", order: 20, title: "Срок", body_md: "От {{start_date}} до {{end_date}}.", severity: "required" },
      { clause_id: "price", order: 30, title: "Цена", body_md: "Наем: {{rent_amount}} EUR ({{rent_period}}). Депозит: {{deposit}} EUR.", severity: "required" },
      { clause_id: "mileage", order: 40, title: "Пробег", body_md: "Разрешен пробег: {{mileage_limit_km}} км. Над лимита: {{over_mileage_price}} EUR/км.", include_when: "mileage_limit_km != null", severity: "recommended" },
      { clause_id: "cross_border_clause", order: 50, title: "Пътуване в чужбина", body_md: "Наемателят има право да ползва МПС извън територията на РБ след предварително писмено съгласие на Наемодателя.", include_when: "cross_border_allowed == true", severity: "optional" },
      { clause_id: "insurance", order: 60, title: "Застраховка", body_md: "МПС е застраховано със застраховка „Каско\" за срока на наема.", include_when: "insurance_covered == true", severity: "recommended" },
    ],
  },

  // 17. Допълнително споразумение (към трудов договор) -----------------------
  "dopalnitelno-sporazumenie": {
    graph: {
      template_slug: "dopalnitelno-sporazumenie",
      title: "Допълнително споразумение към трудов договор",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "ref", title: "Основен договор" },
        { id: "changes", title: "Промени" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "employer", section: "parties", label: "Работодател", field_type: "party_list", required_when: "true" }),
        q({ id: "employee", section: "parties", label: "Служител", field_type: "party_list", required_when: "true" }),
        q({ id: "original_contract_no", section: "ref", label: "Трудов договор №", field_type: "text", required_when: "true" }),
        q({ id: "original_contract_date", section: "ref", label: "Дата на трудовия договор", field_type: "date", required_when: "true" }),
        q({ id: "change_type", section: "changes", label: "Какво се променя", field_type: "multiselect", required_when: "true",
          options: opts(["salary","Възнаграждение"],["position","Длъжност"],["workplace","Място на работа"],["working_time","Работно време"],["term","Срок"],["other","Друго"]),
          affects_clauses: ["change_salary","change_position","change_workplace","change_working_time","change_term","change_other"] }),
        q({ id: "new_salary", section: "changes", label: "Ново брутно възнаграждение (EUR)", field_type: "money", visible_when: "change_type contains 'salary'", required_when: "change_type contains 'salary'" }),
        q({ id: "new_position", section: "changes", label: "Нова длъжност", field_type: "text", visible_when: "change_type contains 'position'", required_when: "change_type contains 'position'" }),
        q({ id: "new_workplace", section: "changes", label: "Ново място на работа", field_type: "text", visible_when: "change_type contains 'workplace'", required_when: "change_type contains 'workplace'" }),
        q({ id: "new_working_time", section: "changes", label: "Ново работно време", field_type: "text", visible_when: "change_type contains 'working_time'", required_when: "change_type contains 'working_time'" }),
        q({ id: "new_end_date", section: "changes", label: "Нов срок / крайна дата", field_type: "date", visible_when: "change_type contains 'term'" }),
        q({ id: "other_change", section: "changes", label: "Друга промяна (описание)", field_type: "longtext", visible_when: "change_type contains 'other'" }),
        q({ id: "effective_date", section: "changes", label: "Влиза в сила от", field_type: "date", required_when: "true" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "intro", order: 10, title: "Предмет", body_md: "Страните се съгласяват да изменят и допълнят Трудов договор № {{original_contract_no}} от {{original_contract_date}}, считано от {{effective_date}}, както следва:", severity: "required" },
      { clause_id: "change_salary", order: 20, title: "Възнаграждение", body_md: "Брутното месечно възнаграждение се променя на {{new_salary}} EUR.", include_when: "change_type contains 'salary'", severity: "required" },
      { clause_id: "change_position", order: 21, title: "Длъжност", body_md: "Длъжността се променя на „{{new_position}}\".", include_when: "change_type contains 'position'", severity: "required" },
      { clause_id: "change_workplace", order: 22, title: "Място на работа", body_md: "Мястото на работа се променя на {{new_workplace}}.", include_when: "change_type contains 'workplace'", severity: "required" },
      { clause_id: "change_working_time", order: 23, title: "Работно време", body_md: "Работното време се променя на {{new_working_time}}.", include_when: "change_type contains 'working_time'", severity: "required" },
      { clause_id: "change_term", order: 24, title: "Срок", body_md: "Срокът се променя, като нова крайна дата е {{new_end_date}}.", include_when: "change_type contains 'term'", severity: "required" },
      { clause_id: "change_other", order: 25, title: "Друга промяна", body_md: "{{other_change}}", include_when: "change_type contains 'other'", severity: "required" },
      { clause_id: "rest", order: 90, title: "Останалите клаузи", body_md: "Всички останали клаузи от трудовия договор остават непроменени.", severity: "required" },
    ],
  },

  // 18. Молба за прекратяване по взаимно съгласие (чл. 325 КТ) --------------
  "molba-za-prekratyavane-po-vzaimno-saglasie-chl-325-al-1-t-1-kt": {
    graph: {
      template_slug: "molba-za-prekratyavane-po-vzaimno-saglasie-chl-325-al-1-t-1-kt",
      title: "Молба за прекратяване по взаимно съгласие (чл. 325, ал. 1, т. 1 КТ)",
      sections: [
        { id: "addressing", title: "До работодателя" },
        { id: "employee", title: "Данни на служителя" },
        { id: "request", title: "Искане" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "employer_name", section: "addressing", label: "Работодател", field_type: "text", required_when: "true" }),
        q({ id: "employer_eik", section: "addressing", label: "ЕИК на работодателя", field_type: "text" }),
        q({ id: "manager_name", section: "addressing", label: "До (ръководител)", field_type: "text" }),
        q({ id: "employee_name", section: "employee", label: "Име на служителя", field_type: "text", required_when: "true" }),
        q({ id: "employee_position", section: "employee", label: "Длъжност", field_type: "text", required_when: "true" }),
        q({ id: "employee_egn", section: "employee", label: "ЕГН (по желание)", field_type: "text" }),
        q({ id: "contract_no", section: "request", label: "Трудов договор №", field_type: "text" }),
        q({ id: "contract_date", section: "request", label: "Дата на трудовия договор", field_type: "date" }),
        q({ id: "termination_date", section: "request", label: "Желана дата на прекратяване", field_type: "date", required_when: "true" }),
        q({ id: "response_days", section: "request", label: "Срок за отговор от работодателя (дни)", field_type: "number", default: "7" }),
        q({ id: "reason_optional", section: "request", label: "Мотиви (по желание)", field_type: "longtext" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "intro", order: 10, title: "Искане", body_md: "Долуподписаният/ата {{employee_name}}, ЕГН {{employee_egn}}, заемащ/а длъжност „{{employee_position}}\" при {{employer_name}} (ЕИК {{employer_eik}}), на основание чл. 325, ал. 1, т. 1 КТ, предлагам прекратяване на трудовото ми правоотношение по взаимно съгласие на страните.", severity: "required" },
      { clause_id: "date", order: 20, title: "Дата на прекратяване", body_md: "Предлагам за дата на прекратяване {{termination_date}}.", severity: "required" },
      { clause_id: "response", order: 30, title: "Срок за отговор", body_md: "Моля работодателят да се произнесе по настоящето предложение в срок от {{response_days}} дни от получаването му. При липса на отговор в този срок предложението се счита за неприето (чл. 325, ал. 1, т. 1, изр. 2 КТ).", severity: "required" },
      { clause_id: "reason", order: 40, title: "Мотиви", body_md: "{{reason_optional}}", include_when: "reason_optional != ''", severity: "optional" },
    ],
  },

  // 19. Проформа фактура ------------------------------------------------------
  "proforma-faktura": {
    graph: {
      template_slug: "proforma-faktura",
      title: "Проформа фактура",
      sections: [
        { id: "issuer", title: "Издател" },
        { id: "recipient", title: "Получател" },
        { id: "items", title: "Стоки / услуги" },
        { id: "payment", title: "Плащане" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "issuer_name", section: "issuer", label: "Наименование на издателя", field_type: "text", required_when: "true" }),
        q({ id: "issuer_eik", section: "issuer", label: "ЕИК", field_type: "text", required_when: "true" }),
        q({ id: "issuer_vat", section: "issuer", label: "ДДС №", field_type: "text" }),
        q({ id: "issuer_address", section: "issuer", label: "Адрес", field_type: "text", required_when: "true" }),
        q({ id: "issuer_mol", section: "issuer", label: "МОЛ", field_type: "text" }),
        q({ id: "proforma_no", section: "issuer", label: "Номер на проформа", field_type: "text", required_when: "true" }),
        q({ id: "issue_date", section: "issuer", label: "Дата на издаване", field_type: "date", required_when: "true" }),
        q({ id: "recipient_name", section: "recipient", label: "Наименование на получателя", field_type: "text", required_when: "true" }),
        q({ id: "recipient_eik", section: "recipient", label: "ЕИК", field_type: "text" }),
        q({ id: "recipient_vat", section: "recipient", label: "ДДС №", field_type: "text" }),
        q({ id: "recipient_address", section: "recipient", label: "Адрес", field_type: "text" }),
        q({ id: "items_list", section: "items", label: "Позиции (описание, к-во, ед. цена)", field_type: "longtext", required_when: "true",
          help: "Пример: 1) Консултация — 10 часа × 50 EUR" }),
        q({ id: "subtotal", section: "items", label: "Междинна сума (EUR, без ДДС)", field_type: "money", required_when: "true" }),
        q({ id: "vat_rate_pct", section: "items", label: "ДДС ставка (%)", field_type: "number", default: "20" }),
        q({ id: "total_amount", section: "items", label: "Общо за плащане (EUR, с ДДС)", field_type: "money", required_when: "true" }),
        q({ id: "payment_method", section: "payment", label: "Начин на плащане", field_type: "select", required_when: "true",
          options: opts(["bank","Банков превод"],["cash","В брой"],["card","С карта"]) }),
        q({ id: "bank_iban", section: "payment", label: "IBAN", field_type: "text", visible_when: "payment_method == 'bank'" }),
        q({ id: "bank_name", section: "payment", label: "Банка", field_type: "text", visible_when: "payment_method == 'bank'" }),
        q({ id: "due_date", section: "payment", label: "Срок за плащане", field_type: "date", required_when: "true" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "header", order: 10, title: "Проформа фактура", body_md: "**Проформа фактура № {{proforma_no}}** от {{issue_date}}.", severity: "required" },
      { clause_id: "issuer", order: 20, title: "Издател", body_md: "{{issuer_name}}, ЕИК {{issuer_eik}}, ДДС № {{issuer_vat}}, адрес: {{issuer_address}}, МОЛ: {{issuer_mol}}.", severity: "required" },
      { clause_id: "recipient", order: 30, title: "Получател", body_md: "{{recipient_name}}, ЕИК {{recipient_eik}}, ДДС № {{recipient_vat}}, адрес: {{recipient_address}}.", severity: "required" },
      { clause_id: "items", order: 40, title: "Позиции", body_md: "{{items_list}}", severity: "required" },
      { clause_id: "totals", order: 50, title: "Суми", body_md: "Междинна сума: {{subtotal}} EUR. ДДС {{vat_rate_pct}}%. **Общо: {{total_amount}} EUR.**", severity: "required" },
      { clause_id: "payment", order: 60, title: "Плащане", body_md: "Начин на плащане: {{payment_method}}. Срок: {{due_date}}.", severity: "required" },
      { clause_id: "bank", order: 61, title: "Банкови детайли", body_md: "IBAN: {{bank_iban}}, Банка: {{bank_name}}.", include_when: "payment_method == 'bank'", severity: "recommended" },
      { clause_id: "note", order: 70, title: "Забележка", body_md: "Настоящият документ е проформа фактура и не е данъчен документ.", severity: "recommended" },
    ],
  },

  // 20. Учредителен акт на ЕООД ----------------------------------------------
  "uchreditelen-akt-na-eood": {
    graph: {
      template_slug: "uchreditelen-akt-na-eood",
      title: "Учредителен акт на ЕООД",
      sections: [
        { id: "founder", title: "Едноличен собственик" },
        { id: "company", title: "Дружество" },
        { id: "capital", title: "Капитал" },
        { id: "management", title: "Управление" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "founder_type", section: "founder", label: "Тип собственик", field_type: "select", required_when: "true",
          options: opts(["individual","Физическо лице"],["legal","Юридическо лице"]) }),
        q({ id: "founder_name", section: "founder", label: "Име / Наименование", field_type: "text", required_when: "true" }),
        q({ id: "founder_id", section: "founder", label: "ЕГН / ЕИК", field_type: "text", required_when: "true" }),
        q({ id: "founder_address", section: "founder", label: "Адрес / седалище", field_type: "text", required_when: "true" }),
        q({ id: "company_name", section: "company", label: "Наименование на ЕООД", field_type: "text", required_when: "true" }),
        q({ id: "company_seat", section: "company", label: "Седалище и адрес на управление", field_type: "text", required_when: "true" }),
        q({ id: "activity_scope", section: "company", label: "Предмет на дейност", field_type: "longtext", required_when: "true" }),
        q({ id: "term_indefinite", section: "company", label: "Безсрочно", field_type: "boolean", default: "true" }),
        q({ id: "capital_amount", section: "capital", label: "Записан капитал (EUR)", field_type: "money", required_when: "true", default: "1" }),
        q({ id: "capital_contribution_type", section: "capital", label: "Вид на вноската", field_type: "select", required_when: "true",
          options: opts(["cash","Парична"],["in_kind","Апортна"]) }),
        q({ id: "capital_shares_count", section: "capital", label: "Брой дялове", field_type: "number", default: "1" }),
        q({ id: "share_nominal_value", section: "capital", label: "Номинална стойност на един дял (EUR)", field_type: "money", default: "1" }),
        q({ id: "manager_name", section: "management", label: "Име на управителя", field_type: "text", required_when: "true" }),
        q({ id: "manager_egn", section: "management", label: "ЕГН на управителя", field_type: "text", required_when: "true" }),
        q({ id: "manager_powers", section: "management", label: "Ограничения на правомощията", field_type: "longtext" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "founder", order: 10, title: "Едноличен собственик", body_md: "Долуподписаният/ата {{founder_name}} ({{founder_id}}), с адрес {{founder_address}}, като едноличен собственик на капитала, приема настоящия учредителен акт на еднолично дружество с ограничена отговорност (ЕООД).", severity: "required" },
      { clause_id: "company", order: 20, title: "Наименование, седалище, предмет", body_md: "**Наименование:** „{{company_name}}\" ЕООД. **Седалище и адрес на управление:** {{company_seat}}. **Предмет на дейност:** {{activity_scope}}.", severity: "required" },
      { clause_id: "term", order: 25, title: "Срок", body_md: "Дружеството се учредява без срок.", include_when: "term_indefinite == true", severity: "recommended" },
      { clause_id: "capital", order: 30, title: "Капитал", body_md: "Капиталът на дружеството е в размер на {{capital_amount}} EUR, разпределен в {{capital_shares_count}} дяла по {{share_nominal_value}} EUR всеки. Вноските са {{capital_contribution_type}} и се внасят изцяло при учредяването.", severity: "required" },
      { clause_id: "management", order: 40, title: "Управление", body_md: "Дружеството се управлява и представлява от {{manager_name}}, ЕГН {{manager_egn}}. Ограничения на правомощията: {{manager_powers}}.", severity: "required" },
      { clause_id: "final", order: 90, title: "Заключителни разпоредби", body_md: "За неуредените в настоящия акт въпроси се прилагат разпоредбите на Търговския закон.", severity: "required" },
    ],
  },
};

export const BULK_GRAPHS_PART4: Record<string, QuestionGraph> = Object.fromEntries(
  Object.entries(SPECS).map(([slug, s]) => [slug, s.graph]),
);

export const BULK_CLAUSES_PART4: ClauseDefinition[] = Object.entries(SPECS).flatMap(([slug, s]) =>
  s.clauses.map((c) => ({ ...c, template_slug: slug })),
);
