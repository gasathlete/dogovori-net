/**
 * Bulk migration — Batches 2-4 (15 templates) към dynamic question graphs.
 * Същата DSL като _bulk20.ts.
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
  // 6. Безсрочен трудов договор по чл. 67 КТ -----------------------------
  "trudov-dogovor-po-chl-67-kt-bezsrochen": {
    graph: {
      template_slug: "trudov-dogovor-po-chl-67-kt-bezsrochen",
      title: "Трудов договор по чл. 67 КТ (безсрочен)",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "job", title: "Длъжност и условия" },
        { id: "pay", title: "Възнаграждение" },
        { id: "probation", title: "Изпитателен срок" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "employer", section: "parties", label: "Работодател", field_type: "party_list", required_when: "true" }),
        q({ id: "employee", section: "parties", label: "Служител", field_type: "party_list", required_when: "true" }),
        q({ id: "position", section: "job", label: "Длъжност", field_type: "text", required_when: "true" }),
        q({ id: "nkpd_code", section: "job", label: "Код по НКПД", field_type: "text" }),
        q({ id: "workplace", section: "job", label: "Място на работа", field_type: "text", required_when: "true" }),
        q({ id: "work_time", section: "job", label: "Работно време", field_type: "select", required_when: "true",
          options: opts(["full","Пълно (8ч)"],["part","Непълно"]), affects_clauses: ["part_time"] }),
        q({ id: "part_hours", section: "job", label: "Часове на ден", field_type: "number",
          visible_when: "work_time == 'part'", required_when: "work_time == 'part'" }),
        q({ id: "start_date", section: "job", label: "Дата на постъпване", field_type: "date", required_when: "true" }),
        q({ id: "salary", section: "pay", label: "Брутна заплата (EUR)", field_type: "money", required_when: "true" }),
        q({ id: "pay_day", section: "pay", label: "Ден за заплата", field_type: "number", default: 25, required_when: "true" }),
        q({ id: "has_probation", section: "probation", label: "Има ли изпитателен срок?", field_type: "boolean", required_when: "true",
          affects_clauses: ["probation"] }),
        q({ id: "probation_months", section: "probation", label: "Срок (месеци, до 6)", field_type: "number",
          visible_when: "has_probation == true", required_when: "has_probation == true", default: 6 }),
        q({ id: "probation_in_favor", section: "probation", label: "В полза на", field_type: "select",
          visible_when: "has_probation == true", required_when: "has_probation == true",
          options: opts(["employer","Работодателя"],["employee","Служителя"],["both","И двете страни"]) }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "subject", order: 10, title: "Предмет", body_md: "Работодателят възлага, а Служителят приема да изпълнява длъжността „{{position}}" + "\" (НКПД: {{nkpd_code}}), с място на работа {{workplace}}, считано от {{start_date}}.", severity: "required" },
      { clause_id: "full_time", order: 20, title: "Работно време", body_md: "Работното време е пълно — 8 часа дневно, 40 часа седмично.", include_when: "work_time == 'full'", severity: "required" },
      { clause_id: "part_time", order: 21, title: "Непълно работно време", body_md: "Работното време е непълно — {{part_hours}} часа дневно.", include_when: "work_time == 'part'", severity: "required" },
      { clause_id: "salary", order: 30, title: "Възнаграждение", body_md: "Основното месечно брутно възнаграждение е {{salary}} EUR, платимо до {{pay_day}}-то число.", severity: "required" },
      { clause_id: "probation", order: 40, title: "Изпитателен срок", body_md: "Договорът се сключва с изпитателен срок от {{probation_months}} месеца, в полза на {{probation_in_favor}}.", include_when: "has_probation == true", severity: "recommended" },
    ],
  },

  // 7. Срочен трудов договор по чл. 68 КТ --------------------------------
  "srochen-trudov-dogovor-po-chl-68-kt": {
    graph: {
      template_slug: "srochen-trudov-dogovor-po-chl-68-kt",
      title: "Срочен трудов договор по чл. 68 КТ",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "job", title: "Длъжност" },
        { id: "term", title: "Срок" },
        { id: "pay", title: "Възнаграждение" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "employer", section: "parties", label: "Работодател", field_type: "party_list", required_when: "true" }),
        q({ id: "employee", section: "parties", label: "Служител", field_type: "party_list", required_when: "true" }),
        q({ id: "position", section: "job", label: "Длъжност", field_type: "text", required_when: "true" }),
        q({ id: "workplace", section: "job", label: "Място на работа", field_type: "text", required_when: "true" }),
        q({ id: "term_basis", section: "term", label: "Основание за срочност", field_type: "select", required_when: "true",
          options: opts(["fixed_date","Определен срок (до 3г)"],["task","До завършване на конкретна задача"],["replacement","Заместване на отсъстващ"]),
          affects_clauses: ["term_date","term_task","term_replacement"] }),
        q({ id: "start_date", section: "term", label: "Начална дата", field_type: "date", required_when: "true" }),
        q({ id: "end_date", section: "term", label: "Крайна дата", field_type: "date",
          visible_when: "term_basis == 'fixed_date'", required_when: "term_basis == 'fixed_date'" }),
        q({ id: "task_description", section: "term", label: "Описание на задачата", field_type: "longtext",
          visible_when: "term_basis == 'task'", required_when: "term_basis == 'task'" }),
        q({ id: "replaced_person", section: "term", label: "Заместван служител", field_type: "text",
          visible_when: "term_basis == 'replacement'", required_when: "term_basis == 'replacement'" }),
        q({ id: "salary", section: "pay", label: "Брутна заплата (EUR)", field_type: "money", required_when: "true" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "subject", order: 10, title: "Предмет", body_md: "Служителят се назначава на длъжност „{{position}}" + "\", място на работа {{workplace}}, от {{start_date}}.", severity: "required" },
      { clause_id: "term_date", order: 20, title: "Срок", body_md: "Договорът се сключва за срок до {{end_date}}.", include_when: "term_basis == 'fixed_date'", severity: "required" },
      { clause_id: "term_task", order: 21, title: "Срок (задача)", body_md: "Договорът е до завършване на следната конкретна задача: {{task_description}}.", include_when: "term_basis == 'task'", severity: "required" },
      { clause_id: "term_replacement", order: 22, title: "Срок (заместване)", body_md: "Договорът е за заместване на отсъстващия служител {{replaced_person}} и се прекратява с неговото връщане.", include_when: "term_basis == 'replacement'", severity: "required" },
      { clause_id: "salary", order: 30, title: "Възнаграждение", body_md: "Брутно възнаграждение: {{salary}} EUR месечно.", severity: "required" },
    ],
  },

  // 8. Наем на автомобил --------------------------------------------------
  "dogovor-za-naem-na-avtomobil": {
    graph: {
      template_slug: "dogovor-za-naem-na-avtomobil",
      title: "Договор за наем на автомобил",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "vehicle", title: "Автомобил" },
        { id: "term", title: "Срок и наем" },
        { id: "rules", title: "Условия" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "lessor", section: "parties", label: "Наемодател", field_type: "party_list", required_when: "true" }),
        q({ id: "lessee", section: "parties", label: "Наемател", field_type: "party_list", required_when: "true" }),
        q({ id: "make_model", section: "vehicle", label: "Марка и модел", field_type: "text", required_when: "true" }),
        q({ id: "plate", section: "vehicle", label: "Регистрационен номер", field_type: "text", required_when: "true" }),
        q({ id: "vin", section: "vehicle", label: "VIN / рама", field_type: "text" }),
        q({ id: "start_date", section: "term", label: "Начална дата", field_type: "date", required_when: "true" }),
        q({ id: "end_date", section: "term", label: "Крайна дата", field_type: "date", required_when: "true" }),
        q({ id: "daily_rate", section: "term", label: "Дневна цена (EUR)", field_type: "money", required_when: "true" }),
        q({ id: "km_limit", section: "term", label: "Дневен лимит километри", field_type: "number", default: 200 }),
        q({ id: "deposit", section: "term", label: "Депозит (EUR)", field_type: "money" }),
        q({ id: "fuel_policy", section: "rules", label: "Политика за гориво", field_type: "select", required_when: "true",
          options: opts(["full_to_full","Пълен-пълен"],["same_level","Същото ниво"],["prepaid","Предплатено"]) }),
        q({ id: "insurance_included", section: "rules", label: "Включена ли е каско застраховка?", field_type: "boolean", required_when: "true",
          affects_clauses: ["insurance"] }),
        q({ id: "abroad_allowed", section: "rules", label: "Разрешено пътуване в чужбина?", field_type: "boolean",
          affects_clauses: ["abroad_forbidden"] }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "subject", order: 10, title: "Предмет", body_md: "Наемодателят предоставя на Наемателя автомобил {{make_model}}, рег. № {{plate}}, VIN {{vin}}, за временно възмездно ползване.", severity: "required" },
      { clause_id: "term", order: 20, title: "Срок", body_md: "Срокът на наема е от {{start_date}} до {{end_date}}. Дневна цена: {{daily_rate}} EUR.", severity: "required" },
      { clause_id: "deposit", order: 25, title: "Депозит", body_md: "Наемателят внася депозит в размер на {{deposit}} EUR, който се възстановява при връщане на автомобила без щети.", include_when: "deposit", severity: "recommended" },
      { clause_id: "km", order: 30, title: "Лимит километри", body_md: "Дневен лимит: {{km_limit}} км. Превишението се таксува допълнително.", include_when: "km_limit", severity: "recommended" },
      { clause_id: "fuel", order: 35, title: "Гориво", body_md: "Политика за гориво: {{fuel_policy}}.", severity: "required" },
      { clause_id: "insurance", order: 40, title: "Застраховка", body_md: "Автомобилът е каско застрахован за периода на наема за сметка на Наемодателя.", include_when: "insurance_included == true", severity: "recommended" },
      { clause_id: "abroad_forbidden", order: 45, title: "Пътуване в чужбина", body_md: "Извеждането на автомобила извън Р. България е забранено без писмено съгласие.", include_when: "abroad_allowed == false", severity: "recommended" },
    ],
  },

  // 9. Наем на търговски обект -------------------------------------------
  "dogovor-za-naem-na-targovski-obekt": {
    graph: {
      template_slug: "dogovor-za-naem-na-targovski-obekt",
      title: "Договор за наем на търговски обект",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "property", title: "Обект" },
        { id: "terms", title: "Срок и наем" },
        { id: "deposit", title: "Депозит" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "landlord", section: "parties", label: "Наемодател", field_type: "party_list", required_when: "true" }),
        q({ id: "tenant", section: "parties", label: "Наемател", field_type: "party_list", required_when: "true" }),
        q({ id: "address", section: "property", label: "Адрес на обекта", field_type: "longtext", required_when: "true" }),
        q({ id: "area", section: "property", label: "Площ (кв.м)", field_type: "number", required_when: "true" }),
        q({ id: "permitted_use", section: "property", label: "Допустима търговска дейност", field_type: "longtext", required_when: "true" }),
        q({ id: "start_date", section: "terms", label: "Начална дата", field_type: "date", required_when: "true" }),
        q({ id: "end_date", section: "terms", label: "Крайна дата", field_type: "date", required_when: "true" }),
        q({ id: "monthly_rent", section: "terms", label: "Месечен наем (EUR)", field_type: "money", required_when: "true" }),
        q({ id: "rent_review", section: "terms", label: "Годишна индексация на наема?", field_type: "boolean",
          affects_clauses: ["rent_review"] }),
        q({ id: "review_pct", section: "terms", label: "Процент индексация (%)", field_type: "number",
          visible_when: "rent_review == true", default: 3 }),
        q({ id: "deposit_months", section: "deposit", label: "Депозит (месечни наеми)", field_type: "number", required_when: "true", default: 2 }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "subject", order: 10, title: "Предмет", body_md: "Наемодателят предоставя на Наемателя търговски обект на адрес {{address}}, с площ {{area}} кв.м, за дейност: {{permitted_use}}.", severity: "required" },
      { clause_id: "term", order: 20, title: "Срок", body_md: "Срокът е от {{start_date}} до {{end_date}}.", severity: "required" },
      { clause_id: "rent", order: 30, title: "Наем", body_md: "Месечен наем: {{monthly_rent}} EUR без ДДС.", severity: "required" },
      { clause_id: "rent_review", order: 35, title: "Индексация", body_md: "Наемът се индексира ежегодно с {{review_pct}}% или с официалния индекс на инфлация (което е по-високо).", include_when: "rent_review == true", severity: "recommended" },
      { clause_id: "deposit", order: 40, title: "Депозит", body_md: "Наемателят внася депозит в размер на {{deposit_months}} месечни наема.", severity: "required" },
    ],
  },

  // 10. Наем на офис -----------------------------------------------------
  "dogovor-za-naem-na-ofis": {
    graph: {
      template_slug: "dogovor-za-naem-na-ofis",
      title: "Договор за наем на офис",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "property", title: "Офис" },
        { id: "terms", title: "Срок и наем" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "landlord", section: "parties", label: "Наемодател", field_type: "party_list", required_when: "true" }),
        q({ id: "tenant", section: "parties", label: "Наемател", field_type: "party_list", required_when: "true" }),
        q({ id: "address", section: "property", label: "Адрес на офиса", field_type: "longtext", required_when: "true" }),
        q({ id: "area", section: "property", label: "Площ (кв.м)", field_type: "number", required_when: "true" }),
        q({ id: "workstations", section: "property", label: "Брой работни места", field_type: "number" }),
        q({ id: "furnished", section: "property", label: "Обзаведен", field_type: "boolean",
          affects_clauses: ["furnished"] }),
        q({ id: "internet_included", section: "property", label: "Включен интернет?", field_type: "boolean",
          affects_clauses: ["internet"] }),
        q({ id: "start_date", section: "terms", label: "Начална дата", field_type: "date", required_when: "true" }),
        q({ id: "end_date", section: "terms", label: "Крайна дата", field_type: "date", required_when: "true" }),
        q({ id: "monthly_rent", section: "terms", label: "Месечен наем (EUR)", field_type: "money", required_when: "true" }),
        q({ id: "utilities_included", section: "terms", label: "Консумативите включени в наема?", field_type: "boolean", required_when: "true",
          affects_clauses: ["utilities_included","utilities_excluded"] }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "subject", order: 10, title: "Предмет", body_md: "Наемодателят предоставя на Наемателя офис на адрес {{address}}, с площ {{area}} кв.м ({{workstations}} работни места).", severity: "required" },
      { clause_id: "furnished", order: 15, title: "Обзавеждане", body_md: "Офисът е обзаведен; инвентарът се описва в Приложение №1.", include_when: "furnished == true", severity: "recommended" },
      { clause_id: "internet", order: 16, title: "Интернет", body_md: "Наемодателят предоставя интернет връзка за периода на наема.", include_when: "internet_included == true", severity: "optional" },
      { clause_id: "term", order: 20, title: "Срок", body_md: "От {{start_date}} до {{end_date}}.", severity: "required" },
      { clause_id: "rent", order: 30, title: "Наем", body_md: "Месечен наем: {{monthly_rent}} EUR.", severity: "required" },
      { clause_id: "utilities_included", order: 35, title: "Консумативи", body_md: "Консумативите (ток, вода, отопление, поддръжка) са включени в наема.", include_when: "utilities_included == true", severity: "required" },
      { clause_id: "utilities_excluded", order: 36, title: "Консумативи", body_md: "Консумативите се заплащат отделно от Наемателя по реални показания.", include_when: "utilities_included == false", severity: "required" },
    ],
  },

  // 11. Прекратяване на наем — предизвестие ------------------------------
  "predizvestie-za-prekratyavane-na-naem": {
    graph: {
      template_slug: "predizvestie-za-prekratyavane-na-naem",
      title: "Предизвестие за прекратяване на наем",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "contract", title: "Договор за наем" },
        { id: "termination", title: "Прекратяване" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "sender", section: "parties", label: "Изпращач (Наемодател/Наемател)", field_type: "party_list", required_when: "true" }),
        q({ id: "recipient", section: "parties", label: "Получател", field_type: "party_list", required_when: "true" }),
        q({ id: "sender_role", section: "parties", label: "Изпращачът е", field_type: "select", required_when: "true",
          options: opts(["landlord","Наемодател"],["tenant","Наемател"]) }),
        q({ id: "contract_date", section: "contract", label: "Дата на договора за наем", field_type: "date", required_when: "true" }),
        q({ id: "property_address", section: "contract", label: "Адрес на имота", field_type: "longtext", required_when: "true" }),
        q({ id: "termination_date", section: "termination", label: "Дата на прекратяване", field_type: "date", required_when: "true" }),
        q({ id: "notice_days", section: "termination", label: "Срок на предизвестие (дни)", field_type: "number", required_when: "true", default: 30 }),
        q({ id: "reason", section: "termination", label: "Основание / причина", field_type: "longtext" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "intro", order: 10, title: "До", body_md: "До: {{recipient}}", severity: "required" },
      { clause_id: "body", order: 20, title: "Предизвестие", body_md: "С настоящото Ви уведомявам като {{sender_role}}, че прекратявам договора за наем от {{contract_date}} за имот на адрес {{property_address}}, считано от {{termination_date}}, при спазен срок на предизвестие от {{notice_days}} дни.", severity: "required" },
      { clause_id: "reason", order: 30, title: "Основание", body_md: "Основание: {{reason}}.", include_when: "reason", severity: "optional" },
    ],
  },

  // 12. Прекратяване на трудов договор по взаимно съгласие ---------------
  "sporazumenie-za-prekratyavane-na-trudov-dogovor-po-vzaimno-saglasie": {
    graph: {
      template_slug: "sporazumenie-za-prekratyavane-na-trudov-dogovor-po-vzaimno-saglasie",
      title: "Споразумение за прекратяване на трудов договор по взаимно съгласие",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "contract", title: "Договор" },
        { id: "termination", title: "Прекратяване" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "employer", section: "parties", label: "Работодател", field_type: "party_list", required_when: "true" }),
        q({ id: "employee", section: "parties", label: "Служител", field_type: "party_list", required_when: "true" }),
        q({ id: "contract_number", section: "contract", label: "Номер на трудовия договор", field_type: "text" }),
        q({ id: "contract_date", section: "contract", label: "Дата на трудовия договор", field_type: "date", required_when: "true" }),
        q({ id: "position", section: "contract", label: "Длъжност", field_type: "text", required_when: "true" }),
        q({ id: "termination_date", section: "termination", label: "Дата на прекратяване", field_type: "date", required_when: "true" }),
        q({ id: "has_compensation", section: "termination", label: "Има ли обезщетение по чл. 331 КТ?", field_type: "boolean", required_when: "true",
          affects_clauses: ["compensation"] }),
        q({ id: "compensation_amount", section: "termination", label: "Размер на обезщетението (EUR)", field_type: "money",
          visible_when: "has_compensation == true", required_when: "has_compensation == true" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "subject", order: 10, title: "Предмет", body_md: "Страните се споразумяват да прекратят трудовия договор № {{contract_number}} от {{contract_date}} за длъжност „{{position}}\", на основание чл. 325, ал. 1, т. 1 КТ — по взаимно съгласие.", severity: "required" },
      { clause_id: "date", order: 20, title: "Дата на прекратяване", body_md: "Трудовото правоотношение се прекратява, считано от {{termination_date}}.", severity: "required" },
      { clause_id: "compensation", order: 30, title: "Обезщетение по чл. 331 КТ", body_md: "Работодателят дължи на Служителя обезщетение в размер на {{compensation_amount}} EUR, платимо в едномесечен срок от прекратяването.", include_when: "has_compensation == true", severity: "required" },
      { clause_id: "settlement", order: 40, title: "Окончателно уреждане", body_md: "Страните декларират, че след изплащане на дължимите суми нямат претенции една към друга, свързани с трудовото правоотношение.", severity: "recommended" },
    ],
  },

  // 13. Заповед за прекратяване на ТПО -----------------------------------
  "zapoved-za-prekratyavane-na-tpo": {
    graph: {
      template_slug: "zapoved-za-prekratyavane-na-tpo",
      title: "Заповед за прекратяване на трудово правоотношение",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "grounds", title: "Основание" },
        { id: "compensation", title: "Обезщетения" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "employer", section: "parties", label: "Работодател", field_type: "party_list", required_when: "true" }),
        q({ id: "employee", section: "parties", label: "Служител", field_type: "party_list", required_when: "true" }),
        q({ id: "position", section: "parties", label: "Длъжност", field_type: "text", required_when: "true" }),
        q({ id: "order_number", section: "grounds", label: "Номер на заповедта", field_type: "text", required_when: "true" }),
        q({ id: "ground_article", section: "grounds", label: "Член от КТ", field_type: "select", required_when: "true",
          options: opts(["325_1","чл. 325, ал. 1, т. 1 (взаимно съгласие)"],["326","чл. 326 (с предизвестие от работника)"],["328","чл. 328 (с предизвестие от работодателя)"],["330","чл. 330 (без предизвестие — дисциплинарно)"],["331","чл. 331 (срещу обезщетение)"]) }),
        q({ id: "termination_date", section: "grounds", label: "Дата на прекратяване", field_type: "date", required_when: "true" }),
        q({ id: "unused_leave_days", section: "compensation", label: "Дни неизползван годишен отпуск", field_type: "number" }),
        q({ id: "notice_compensation", section: "compensation", label: "Обезщетение за неспазено предизвестие?", field_type: "boolean",
          affects_clauses: ["notice_comp"] }),
        q({ id: "notice_months", section: "compensation", label: "Брой месечни заплати (предизвестие)", field_type: "number",
          visible_when: "notice_compensation == true", required_when: "notice_compensation == true" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "header", order: 10, title: "Заповед", body_md: "Заповед № {{order_number}} за прекратяване на трудово правоотношение", severity: "required" },
      { clause_id: "body", order: 20, title: "Разпоредителна част", body_md: "Прекратявам трудовото правоотношение със Служителя на длъжност „{{position}}\", на основание {{ground_article}}, считано от {{termination_date}}.", severity: "required" },
      { clause_id: "leave_comp", order: 30, title: "Обезщетение за неизползван отпуск", body_md: "За {{unused_leave_days}} дни неизползван платен годишен отпуск се изплаща обезщетение по чл. 224 КТ.", include_when: "unused_leave_days", severity: "required" },
      { clause_id: "notice_comp", order: 40, title: "Обезщетение за предизвестие", body_md: "Изплаща се обезщетение по чл. 220, ал. 1 КТ в размер на {{notice_months}} брутни месечни заплати.", include_when: "notice_compensation == true", severity: "required" },
    ],
  },

  // 14. Сметка за изплатени суми -----------------------------------------
  "smetka-za-izplateni-sumi": {
    graph: {
      template_slug: "smetka-za-izplateni-sumi",
      title: "Сметка за изплатени суми",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "amounts", title: "Суми" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "payer", section: "parties", label: "Платец", field_type: "party_list", required_when: "true" }),
        q({ id: "recipient", section: "parties", label: "Получател", field_type: "party_list", required_when: "true" }),
        q({ id: "service_description", section: "amounts", label: "Описание на услугата/основание", field_type: "longtext", required_when: "true" }),
        q({ id: "gross_amount", section: "amounts", label: "Брутна сума (EUR)", field_type: "money", required_when: "true" }),
        q({ id: "expenses_pct", section: "amounts", label: "Нормативно признати разходи (%)", field_type: "number", default: 25 }),
        q({ id: "tax_pct", section: "amounts", label: "Данък (%)", field_type: "number", default: 10 }),
        q({ id: "has_ssa", section: "amounts", label: "Удържат ли се осигуровки?", field_type: "boolean", required_when: "true",
          affects_clauses: ["ssa"] }),
        q({ id: "ssa_amount", section: "amounts", label: "Размер на осигуровките (EUR)", field_type: "money",
          visible_when: "has_ssa == true", required_when: "has_ssa == true" }),
        q({ id: "payment_date", section: "amounts", label: "Дата на изплащане", field_type: "date", required_when: "true" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "subject", order: 10, title: "Основание", body_md: "Сметка за изплатени суми по: {{service_description}}.", severity: "required" },
      { clause_id: "amounts", order: 20, title: "Изчисление", body_md: "Брутна сума: {{gross_amount}} EUR. Нормативно признати разходи: {{expenses_pct}}%. Данък по ЗДДФЛ: {{tax_pct}}%.", severity: "required" },
      { clause_id: "ssa", order: 25, title: "Осигуровки", body_md: "Удържани осигурителни вноски: {{ssa_amount}} EUR.", include_when: "has_ssa == true", severity: "required" },
      { clause_id: "payment", order: 30, title: "Изплащане", body_md: "Сумата се изплаща на {{payment_date}}.", severity: "required" },
    ],
  },

  // 15. Споразумение за неконкуриране ------------------------------------
  "sporazumenie-za-nekonkurirane-sled-prekratyavane-na-targovsko-pravootnoshenie": {
    graph: {
      template_slug: "sporazumenie-za-nekonkurirane-sled-prekratyavane-na-targovsko-pravootnoshenie",
      title: "Споразумение за неконкуриране",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "scope", title: "Обхват" },
        { id: "compensation", title: "Компенсация" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "company", section: "parties", label: "Дружество", field_type: "party_list", required_when: "true" }),
        q({ id: "obligor", section: "parties", label: "Задължено лице", field_type: "party_list", required_when: "true" }),
        q({ id: "term_months", section: "scope", label: "Срок на неконкуриране (месеци)", field_type: "number", required_when: "true", default: 12 }),
        q({ id: "territory", section: "scope", label: "Териториален обхват", field_type: "text", required_when: "true", default: "Република България" }),
        q({ id: "business_scope", section: "scope", label: "Дейност, която не може да се извършва", field_type: "longtext", required_when: "true" }),
        q({ id: "non_solicit", section: "scope", label: "Включва ли забрана за привличане на клиенти/служители?", field_type: "boolean", required_when: "true",
          affects_clauses: ["non_solicit"] }),
        q({ id: "has_compensation", section: "compensation", label: "Има ли парична компенсация?", field_type: "boolean", required_when: "true",
          affects_clauses: ["compensation"] }),
        q({ id: "monthly_compensation", section: "compensation", label: "Месечна компенсация (EUR)", field_type: "money",
          visible_when: "has_compensation == true", required_when: "has_compensation == true" }),
        q({ id: "penalty", section: "compensation", label: "Неустойка при нарушение (EUR)", field_type: "money", required_when: "true" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "obligation", order: 10, title: "Задължение за неконкуриране", body_md: "Задълженото лице се задължава за срок от {{term_months}} месеца след прекратяване на правоотношението да не извършва пряко или косвено следната дейност: {{business_scope}}, на територията на {{territory}}.", severity: "required" },
      { clause_id: "non_solicit", order: 20, title: "Забрана за привличане", body_md: "Забранява се привличането на клиенти и служители на Дружеството за същия период.", include_when: "non_solicit == true", severity: "recommended" },
      { clause_id: "compensation", order: 30, title: "Компенсация", body_md: "Дружеството изплаща на Задълженото лице месечна компенсация в размер на {{monthly_compensation}} EUR за периода на ограничението.", include_when: "has_compensation == true", severity: "required" },
      { clause_id: "penalty", order: 40, title: "Неустойка", body_md: "При нарушение Задълженото лице дължи неустойка в размер на {{penalty}} EUR за всяко отделно нарушение.", severity: "required" },
    ],
  },

  // 16. Дистрибуторски договор -------------------------------------------
  "distributorski-dogovor": {
    graph: {
      template_slug: "distributorski-dogovor",
      title: "Дистрибуторски договор",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "scope", title: "Обхват" },
        { id: "commercials", title: "Търговски условия" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "supplier", section: "parties", label: "Доставчик", field_type: "party_list", required_when: "true" }),
        q({ id: "distributor", section: "parties", label: "Дистрибутор", field_type: "party_list", required_when: "true" }),
        q({ id: "products", section: "scope", label: "Описание на продуктите", field_type: "longtext", required_when: "true" }),
        q({ id: "territory", section: "scope", label: "Територия", field_type: "text", required_when: "true" }),
        q({ id: "exclusivity", section: "scope", label: "Изключителни права?", field_type: "select", required_when: "true",
          options: opts(["exclusive","Изключителни"],["non_exclusive","Неизключителни"],["sole","Единствени (sole)"]),
          affects_clauses: ["exclusive","non_exclusive"] }),
        q({ id: "min_purchase", section: "commercials", label: "Минимални годишни покупки (EUR)", field_type: "money" }),
        q({ id: "discount_pct", section: "commercials", label: "Дистрибуторска отстъпка (%)", field_type: "number", required_when: "true" }),
        q({ id: "payment_days", section: "commercials", label: "Срок за плащане (дни)", field_type: "number", default: 30 }),
        q({ id: "term_months", section: "commercials", label: "Срок на договора (месеци)", field_type: "number", required_when: "true", default: 24 }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "subject", order: 10, title: "Предмет", body_md: "Доставчикът упълномощава Дистрибутора да разпространява следните продукти: {{products}}, на територията на {{territory}}.", severity: "required" },
      { clause_id: "exclusive", order: 15, title: "Изключителност", body_md: "Дистрибуторът има изключителни права на разпространение на територията. Доставчикът няма да назначава други дистрибутори.", include_when: "exclusivity == 'exclusive'", severity: "required" },
      { clause_id: "non_exclusive", order: 16, title: "Неизключителни права", body_md: "Договорът е неизключителен — Доставчикът запазва правото да назначава други дистрибутори.", include_when: "exclusivity == 'non_exclusive'", severity: "required" },
      { clause_id: "min_purchase", order: 20, title: "Минимални покупки", body_md: "Дистрибуторът се задължава да закупи продукти на минимална стойност {{min_purchase}} EUR годишно.", include_when: "min_purchase", severity: "recommended" },
      { clause_id: "pricing", order: 30, title: "Цени", body_md: "Дистрибуторска отстъпка: {{discount_pct}}% от каталожните цени. Срок за плащане: {{payment_days}} дни.", severity: "required" },
      { clause_id: "term", order: 40, title: "Срок", body_md: "Договорът е със срок {{term_months}} месеца, с автоматично подновяване, освен при писмено възражение.", severity: "required" },
    ],
  },

  // 17. Брачен договор ---------------------------------------------------
  "brachen-dogovor": {
    graph: {
      template_slug: "brachen-dogovor",
      title: "Брачен договор",
      sections: [
        { id: "parties", title: "Съпрузи" },
        { id: "regime", title: "Имуществен режим" },
        { id: "assets", title: "Имущество" },
        { id: "support", title: "Издръжка" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "spouse_a", section: "parties", label: "Съпруг", field_type: "party_list", required_when: "true" }),
        q({ id: "spouse_b", section: "parties", label: "Съпруга", field_type: "party_list", required_when: "true" }),
        q({ id: "marriage_date", section: "parties", label: "Дата на брака (или предстоящ)", field_type: "date" }),
        q({ id: "regime", section: "regime", label: "Избран режим", field_type: "select", required_when: "true",
          options: opts(["separation","Разделност на имуществото"],["community","Общност на имуществото"],["mixed","Смесен (по чл. 39 СК)"]),
          affects_clauses: ["sep_regime","com_regime","mixed_regime"] }),
        q({ id: "premarital_assets", section: "assets", label: "Описание на имущество преди брака", field_type: "longtext" }),
        q({ id: "post_divorce_property", section: "assets", label: "Уговорки за дял при развод", field_type: "longtext" }),
        q({ id: "support_during", section: "support", label: "Издръжка по време на брака", field_type: "longtext" }),
        q({ id: "support_after", section: "support", label: "Издръжка след прекратяване", field_type: "longtext" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "sep_regime", order: 10, title: "Режим на разделност", body_md: "Съпрузите избират режим на разделност на имуществото съгласно чл. 33 СК. Всеки запазва пълно право на собственост върху придобитото от него имущество.", include_when: "regime == 'separation'", severity: "required" },
      { clause_id: "com_regime", order: 11, title: "Режим на общност", body_md: "Съпрузите избират режим на общност на имуществото по чл. 21 и сл. СК.", include_when: "regime == 'community'", severity: "required" },
      { clause_id: "mixed_regime", order: 12, title: "Смесен режим", body_md: "Съпрузите избират договорен режим по чл. 39 СК, чиито условия се уреждат подробно в следващите клаузи.", include_when: "regime == 'mixed'", severity: "required" },
      { clause_id: "premarital", order: 20, title: "Имущество преди брака", body_md: "Предбрачно имущество: {{premarital_assets}}.", include_when: "premarital_assets", severity: "recommended" },
      { clause_id: "post_divorce", order: 30, title: "Прекратяване на брака", body_md: "При прекратяване на брака: {{post_divorce_property}}.", include_when: "post_divorce_property", severity: "recommended" },
      { clause_id: "support_during", order: 40, title: "Издръжка по време на брака", body_md: "{{support_during}}.", include_when: "support_during", severity: "optional" },
      { clause_id: "support_after", order: 41, title: "Издръжка след прекратяване", body_md: "{{support_after}}.", include_when: "support_after", severity: "optional" },
      { clause_id: "notary", order: 90, title: "Форма", body_md: "Договорът се сключва в писмена форма с нотариална заверка на подписите и съдържанието съгласно чл. 39, ал. 1 СК.", severity: "required" },
    ],
  },

  // 18. DPA по GDPR ------------------------------------------------------
  "data-processing-agreement-dpa-po-gdpr": {
    graph: {
      template_slug: "data-processing-agreement-dpa-po-gdpr",
      title: "Договор за обработка на лични данни (DPA)",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "scope", title: "Обхват на обработката" },
        { id: "security", title: "Сигурност" },
        { id: "subprocessors", title: "Подизпълнители" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "controller", section: "parties", label: "Администратор", field_type: "party_list", required_when: "true" }),
        q({ id: "processor", section: "parties", label: "Обработващ", field_type: "party_list", required_when: "true" }),
        q({ id: "purpose", section: "scope", label: "Цел на обработката", field_type: "longtext", required_when: "true" }),
        q({ id: "data_categories", section: "scope", label: "Категории лични данни", field_type: "multiselect", required_when: "true",
          options: opts(["identification","Идентификационни"],["contact","Контакти"],["financial","Финансови"],["health","Здравни"],["sensitive","Чувствителни (специални)"]),
          affects_clauses: ["sensitive_data"] }),
        q({ id: "data_subjects", section: "scope", label: "Категории субекти", field_type: "longtext", required_when: "true" }),
        q({ id: "retention_period", section: "scope", label: "Срок на съхранение", field_type: "text", required_when: "true" }),
        q({ id: "transfer_outside_eu", section: "security", label: "Има ли трансфер извън ЕС/ЕИП?", field_type: "boolean", required_when: "true",
          affects_clauses: ["scc"] }),
        q({ id: "breach_notification_hours", section: "security", label: "Срок за уведомяване при пробив (часове)", field_type: "number", default: 24, required_when: "true" }),
        q({ id: "allow_subprocessors", section: "subprocessors", label: "Позволени ли са подизпълнители?", field_type: "boolean", required_when: "true",
          affects_clauses: ["subprocessors"] }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "subject", order: 10, title: "Предмет", body_md: "Обработващият обработва лични данни от името и по указание на Администратора за следната цел: {{purpose}}. Категории данни: {{data_categories}}. Субекти: {{data_subjects}}. Срок: {{retention_period}}.", severity: "required" },
      { clause_id: "sensitive_data", order: 15, title: "Специални категории данни", body_md: "Обработването включва специални категории лични данни по чл. 9 GDPR — прилагат се завишени технически и организационни мерки.", include_when: "'sensitive' in data_categories", severity: "required" },
      { clause_id: "security", order: 20, title: "Мерки за сигурност", body_md: "Обработващият прилага подходящи технически и организационни мерки (криптиране, контрол на достъпа, журнали, резервни копия) съгласно чл. 32 GDPR.", severity: "required" },
      { clause_id: "breach", order: 25, title: "Уведомяване при пробив", body_md: "При установяване на нарушение Обработващият уведомява Администратора в срок до {{breach_notification_hours}} часа.", severity: "required" },
      { clause_id: "subprocessors", order: 30, title: "Подизпълнители", body_md: "Подизпълнители се ангажират само след предварително писмено одобрение от Администратора и при същите условия за защита.", include_when: "allow_subprocessors == true", severity: "required" },
      { clause_id: "scc", order: 40, title: "Трансфер извън ЕС", body_md: "За трансфери извън ЕС/ЕИП се прилагат Стандартните договорни клаузи на ЕК (Решение 2021/914).", include_when: "transfer_outside_eu == true", severity: "required" },
      { clause_id: "audit", order: 50, title: "Одит", body_md: "Администраторът има право да извършва одити и инспекции с предварително 30-дневно предизвестие.", severity: "recommended" },
      { clause_id: "return", order: 60, title: "Връщане/изтриване", body_md: "След прекратяване Обработващият връща или изтрива всички лични данни, освен ако закон не изисква запазване.", severity: "required" },
    ],
  },

  // 19. Длъжностна характеристика ----------------------------------------
  "dlazhnostna-harakteristika": {
    graph: {
      template_slug: "dlazhnostna-harakteristika",
      title: "Длъжностна характеристика",
      sections: [
        { id: "position", title: "Длъжност" },
        { id: "duties", title: "Задължения" },
        { id: "requirements", title: "Изисквания" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "employer", section: "position", label: "Работодател", field_type: "party_list", required_when: "true" }),
        q({ id: "position", section: "position", label: "Длъжност", field_type: "text", required_when: "true" }),
        q({ id: "nkpd_code", section: "position", label: "Код по НКПД", field_type: "text" }),
        q({ id: "department", section: "position", label: "Отдел / звено", field_type: "text" }),
        q({ id: "reports_to", section: "position", label: "Подчинен на", field_type: "text" }),
        q({ id: "main_duties", section: "duties", label: "Основни задължения", field_type: "longtext", required_when: "true" }),
        q({ id: "additional_duties", section: "duties", label: "Допълнителни задължения", field_type: "longtext" }),
        q({ id: "education", section: "requirements", label: "Образование", field_type: "text", required_when: "true" }),
        q({ id: "experience_years", section: "requirements", label: "Опит (години)", field_type: "number" }),
        q({ id: "skills", section: "requirements", label: "Ключови умения", field_type: "longtext" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "header", order: 10, title: "Длъжност", body_md: "Длъжност: {{position}} (НКПД: {{nkpd_code}}). Отдел: {{department}}. Подчинен на: {{reports_to}}.", severity: "required" },
      { clause_id: "duties", order: 20, title: "Основни задължения", body_md: "{{main_duties}}", severity: "required" },
      { clause_id: "additional", order: 25, title: "Допълнителни задължения", body_md: "{{additional_duties}}", include_when: "additional_duties", severity: "optional" },
      { clause_id: "requirements", order: 30, title: "Изисквания към длъжността", body_md: "Образование: {{education}}. Минимален опит: {{experience_years}} години. Ключови умения: {{skills}}.", severity: "required" },
    ],
  },

  // 20. Декларация за съгласие GDPR --------------------------------------
  "deklaratsiya-za-saglasie-za-obrabotka-na-lichni-danni-gdpr": {
    graph: {
      template_slug: "deklaratsiya-za-saglasie-za-obrabotka-na-lichni-danni-gdpr",
      title: "Декларация за съгласие за обработка на лични данни",
      sections: [
        { id: "subject", title: "Субект" },
        { id: "controller", title: "Администратор" },
        { id: "scope", title: "Обхват" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "data_subject", section: "subject", label: "Субект на данните", field_type: "party_list", required_when: "true" }),
        q({ id: "controller", section: "controller", label: "Администратор на данни", field_type: "party_list", required_when: "true" }),
        q({ id: "purposes", section: "scope", label: "Цели на обработката", field_type: "multiselect", required_when: "true",
          options: opts(["marketing","Маркетинг и реклама"],["newsletter","Информационен бюлетин"],["profiling","Профилиране"],["service","Предоставяне на услуга"]) }),
        q({ id: "data_categories", section: "scope", label: "Категории данни", field_type: "longtext", required_when: "true" }),
        q({ id: "retention_period", section: "scope", label: "Срок на съхранение", field_type: "text", required_when: "true" }),
        q({ id: "third_party_share", section: "scope", label: "Споделяне с трети лица?", field_type: "boolean", required_when: "true",
          affects_clauses: ["third_party"] }),
        q({ id: "third_parties_list", section: "scope", label: "Списък на трети лица/получатели", field_type: "longtext",
          visible_when: "third_party_share == true", required_when: "third_party_share == true" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "consent", order: 10, title: "Съгласие", body_md: "Долуподписаният Субект на данните давам изричното си информирано съгласие Администраторът да обработва моите лични данни ({{data_categories}}) за следните цели: {{purposes}}.", severity: "required" },
      { clause_id: "retention", order: 20, title: "Срок на съхранение", body_md: "Личните данни се съхраняват за срок от {{retention_period}}.", severity: "required" },
      { clause_id: "third_party", order: 30, title: "Получатели", body_md: "Данните могат да бъдат споделяни със следните получатели: {{third_parties_list}}.", include_when: "third_party_share == true", severity: "required" },
      { clause_id: "rights", order: 40, title: "Права на субекта", body_md: "Имам право по всяко време да оттегля съгласието си, да поискам достъп, корекция, изтриване, ограничаване или преносимост на данните, както и да подам жалба до КЗЛД.", severity: "required" },
    ],
  },
};

export const BULK_GRAPHS_PART2: Record<string, QuestionGraph> = Object.fromEntries(
  Object.entries(SPECS).map(([slug, s]) => [slug, s.graph]),
);

export const BULK_CLAUSES_PART2: ClauseDefinition[] = Object.entries(SPECS).flatMap(([slug, s]) =>
  s.clauses.map((c) => ({ ...c, template_slug: slug })),
);
