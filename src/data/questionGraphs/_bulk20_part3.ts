/**
 * Bulk migration part 3 — top-searched шаблони към dynamic wizards.
 *
 * 20 нови графа, фокусирани върху Featured Blanks (homepage), HR молби/заповеди
 * и често търсени граждански/финансови образци. Същият DSL и регистър като
 * `_bulk20.ts` и `_bulk20_part2.ts`.
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

// Reusable header sections for "молба до работодателя" docs.
const employeeAddrSection = { id: "addressing", title: "До работодателя" };
const employeeInfoSection = { id: "employee", title: "Данни на служителя" };
const requestSection = { id: "request", title: "Искане" };

const addressingQs = (): QuestionNode[] => [
  q({ id: "employer_name", section: "addressing", label: "Наименование на работодателя", field_type: "text", required_when: "true" }),
  q({ id: "employer_eik", section: "addressing", label: "ЕИК на работодателя", field_type: "text" }),
  q({ id: "manager_name", section: "addressing", label: "До (име на ръководител / отдел)", field_type: "text" }),
];
const employeeQs = (): QuestionNode[] => [
  q({ id: "employee_name", section: "employee", label: "Име на служителя", field_type: "text", required_when: "true" }),
  q({ id: "employee_position", section: "employee", label: "Длъжност", field_type: "text", required_when: "true" }),
  q({ id: "employee_egn", section: "employee", label: "ЕГН (по желание)", field_type: "text" }),
];

const SPECS: Record<string, BulkSpec> = {

  // 1. Молба за напускане (чл. 326, ал. 1 КТ) ----------------------------------
  "molba-za-napuskane-chl-326-al-1-kt": {
    graph: {
      template_slug: "molba-za-napuskane-chl-326-al-1-kt",
      title: "Молба за напускане (чл. 326, ал. 1 КТ)",
      sections: [employeeAddrSection, employeeInfoSection, requestSection, SIGN_SECTION],
      questions: [
        ...addressingQs(),
        ...employeeQs(),
        q({ id: "notice_period_days", section: "request", label: "Срок на предизвестие (дни)", field_type: "number", required_when: "true",
          affects_clauses: ["notice_30","notice_custom"] }),
        q({ id: "termination_date", section: "request", label: "Желана дата на прекратяване", field_type: "date", required_when: "true" }),
        q({ id: "reason_optional", section: "request", label: "Мотиви (по желание)", field_type: "longtext" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "request", order: 10, title: "Искане", body_md: "Долуподписаният/ата {{employee_name}}, заемащ/а длъжност „{{employee_position}}\" при {{employer_name}} (ЕИК {{employer_eik}}), на основание чл. 326, ал. 1 от КТ заявявам, че желая да прекратя трудовото си правоотношение.", severity: "required" },
      { clause_id: "notice_30", order: 20, title: "Предизвестие", body_md: "Моля за прекратяване на договора след изтичане на 30-дневно предизвестие, считано от датата на връчване на настоящата молба.", include_when: "notice_period_days == 30", severity: "required" },
      { clause_id: "notice_custom", order: 21, title: "Предизвестие", body_md: "Моля за прекратяване на договора след изтичане на предизвестие от {{notice_period_days}} дни, считано от датата на връчване на настоящата молба.", include_when: "notice_period_days != 30", severity: "required" },
      { clause_id: "termination_date", order: 30, title: "Дата на прекратяване", body_md: "Желаната дата на прекратяване е {{termination_date}}.", severity: "recommended" },
      { clause_id: "reason", order: 40, title: "Мотиви", body_md: "{{reason_optional}}", include_when: "reason_optional != ''", severity: "optional" },
    ],
  },

  // 2. Молба за платен годишен отпуск -----------------------------------------
  "molba-za-platen-godishen-otpusk": {
    graph: {
      template_slug: "molba-za-platen-godishen-otpusk",
      title: "Молба за платен годишен отпуск",
      sections: [employeeAddrSection, employeeInfoSection, requestSection, SIGN_SECTION],
      questions: [
        ...addressingQs(),
        ...employeeQs(),
        q({ id: "leave_days", section: "request", label: "Брой работни дни", field_type: "number", required_when: "true" }),
        q({ id: "leave_from", section: "request", label: "От дата", field_type: "date", required_when: "true" }),
        q({ id: "leave_to", section: "request", label: "До дата", field_type: "date", required_when: "true" }),
        q({ id: "leave_year", section: "request", label: "За календарна година", field_type: "number" }),
        q({ id: "substitute", section: "request", label: "Заместник по време на отпуска (по желание)", field_type: "text" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "request", order: 10, title: "Искане", body_md: "Моля да ми бъде разрешено ползване на платен годишен отпуск в размер на {{leave_days}} работни дни за {{leave_year}} г., в периода от {{leave_from}} до {{leave_to}}, на основание чл. 155 от Кодекса на труда.", severity: "required" },
      { clause_id: "substitute", order: 20, title: "Заместник", body_md: "По време на отсъствието ми задълженията ще бъдат поети от {{substitute}}.", include_when: "substitute != ''", severity: "optional" },
    ],
  },

  // 3. Запис на заповед (образец) ---------------------------------------------
  "zapis-na-zapoved-obrazets": {
    graph: {
      template_slug: "zapis-na-zapoved-obrazets",
      title: "Запис на заповед",
      sections: [
        { id: "issuer", title: "Издател" },
        { id: "beneficiary", title: "Поемател" },
        { id: "obligation", title: "Задължение" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "issuer_party", section: "issuer", label: "Издател", field_type: "party_list", required_when: "true" }),
        q({ id: "beneficiary_party", section: "beneficiary", label: "Поемател", field_type: "party_list", required_when: "true" }),
        q({ id: "amount", section: "obligation", label: "Сума (EUR)", field_type: "money", required_when: "true" }),
        q({ id: "amount_words", section: "obligation", label: "Сумата с думи", field_type: "text", required_when: "true" }),
        q({ id: "place_issued", section: "obligation", label: "Място на издаване", field_type: "text", required_when: "true" }),
        q({ id: "date_issued", section: "obligation", label: "Дата на издаване", field_type: "date", required_when: "true" }),
        q({ id: "due_type", section: "obligation", label: "Падеж", field_type: "select", required_when: "true",
          options: opts(["on_date","На определена дата"],["on_demand","На предявяване"]),
          affects_clauses: ["due_on_date","due_on_demand"] }),
        q({ id: "due_date", section: "obligation", label: "Дата на падежа", field_type: "date",
          visible_when: "due_type == 'on_date'", required_when: "due_type == 'on_date'" }),
        q({ id: "without_protest", section: "obligation", label: "Без протест", field_type: "boolean",
          affects_clauses: ["without_protest_clause"] }),
        q({ id: "place_payment", section: "obligation", label: "Място на плащане", field_type: "text", required_when: "true" }),
      ],
    },
    clauses: [
      { clause_id: "header", order: 5, title: "ЗАПИС НА ЗАПОВЕД", body_md: "Издаден в {{place_issued}} на {{date_issued}}.", severity: "required" },
      { clause_id: "promise", order: 10, title: "Безусловно обещание", body_md: "Долуподписаният Издател безусловно се задължавам да платя срещу този запис на заповед на Поемателя сумата от {{amount}} EUR ({{amount_words}}).", severity: "required" },
      { clause_id: "due_on_date", order: 20, title: "Падеж", body_md: "Сумата е платима на {{due_date}}.", include_when: "due_type == 'on_date'", severity: "required" },
      { clause_id: "due_on_demand", order: 21, title: "Падеж", body_md: "Сумата е платима на предявяване.", include_when: "due_type == 'on_demand'", severity: "required" },
      { clause_id: "place_payment", order: 30, title: "Място на плащане", body_md: "Плащането се извършва в {{place_payment}}.", severity: "required" },
      { clause_id: "without_protest_clause", order: 40, title: "Без протест", body_md: "Без протест и без разноски.", include_when: "without_protest == true", severity: "recommended" },
    ],
  },

  // 4. Нотариално заверено пълномощно (универсално) ---------------------------
  "notarialno-zavereno-palnomoshtno-universalno": {
    graph: {
      template_slug: "notarialno-zavereno-palnomoshtno-universalno",
      title: "Нотариално заверено пълномощно (универсално)",
      sections: [
        { id: "grantor", title: "Упълномощител" },
        { id: "grantee", title: "Пълномощник" },
        { id: "scope", title: "Обхват" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "grantor_party", section: "grantor", label: "Упълномощител", field_type: "party_list", required_when: "true" }),
        q({ id: "grantee_party", section: "grantee", label: "Пълномощник", field_type: "party_list", required_when: "true" }),
        q({ id: "scope_areas", section: "scope", label: "Области на представителство", field_type: "longtext", required_when: "true" }),
        q({ id: "bank_powers", section: "scope", label: "Включва ли банкови действия?", field_type: "boolean",
          affects_clauses: ["bank_clause"] }),
        q({ id: "property_powers", section: "scope", label: "Включва ли разпореждане с имот?", field_type: "boolean",
          affects_clauses: ["property_clause"] }),
        q({ id: "right_of_substitution", section: "scope", label: "Право на преупълномощаване", field_type: "boolean",
          affects_clauses: ["substitution_clause"] }),
        q({ id: "valid_until", section: "scope", label: "Срок на пълномощното (до дата)", field_type: "date" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "header", order: 10, title: "Упълномощаване", body_md: "Долуподписаният Упълномощител упълномощавам Пълномощника да ме представлява пред държавни, общински, банкови и съдебни институции, както и пред трети лица, в следните области: {{scope_areas}}.", severity: "required" },
      { clause_id: "bank_clause", order: 20, title: "Банкови действия", body_md: "Пълномощникът има право да открива, оперира и закрива банкови сметки от мое име, да тегли и внася суми, както и да подписва всички свързани документи.", include_when: "bank_powers == true", severity: "required" },
      { clause_id: "property_clause", order: 30, title: "Разпоредителни действия с имот", body_md: "Пълномощникът има право да се разпорежда с моите недвижими имоти — продава, дарява, ипотекира, отдава под наем — при условия по своя преценка.", include_when: "property_powers == true", severity: "required" },
      { clause_id: "substitution_clause", order: 40, title: "Преупълномощаване", body_md: "Пълномощникът има право да преупълномощава трети лица с правата по настоящото пълномощно.", include_when: "right_of_substitution == true", severity: "recommended" },
      { clause_id: "validity", order: 50, title: "Срок", body_md: "Пълномощното е валидно до {{valid_until}}.", include_when: "valid_until != ''", severity: "optional" },
      { clause_id: "notary", order: 60, title: "Нотариална заверка", body_md: "Подписът на Упълномощителя следва да бъде нотариално заверен.", severity: "required" },
    ],
  },

  // 5. Разписка за получена сума ----------------------------------------------
  "razpiska-za-poluchena-suma": {
    graph: {
      template_slug: "razpiska-za-poluchena-suma",
      title: "Разписка за получена сума",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "amount", title: "Сума и основание" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "recipient", section: "parties", label: "Получател (получава сумата)", field_type: "party_list", required_when: "true" }),
        q({ id: "payer", section: "parties", label: "Платец (плаща сумата)", field_type: "party_list", required_when: "true" }),
        q({ id: "amount", section: "amount", label: "Сума (EUR)", field_type: "money", required_when: "true" }),
        q({ id: "amount_words", section: "amount", label: "Сумата с думи", field_type: "text", required_when: "true" }),
        q({ id: "reason", section: "amount", label: "Основание (за какво е сумата)", field_type: "longtext", required_when: "true" }),
        q({ id: "payment_method", section: "amount", label: "Начин на плащане", field_type: "select", required_when: "true",
          options: opts(["cash","В брой"],["bank","По банков път"]) }),
        q({ id: "final_settlement", section: "amount", label: "Окончателно уреждане на отношенията?", field_type: "boolean",
          affects_clauses: ["final_settlement_clause"] }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "acknowledge", order: 10, title: "Получаване на сумата", body_md: "Долуподписаният Получател потвърждавам, че днес — {{date_signed}} в {{place_signed}}, получих от Платеца сумата от {{amount}} EUR ({{amount_words}}) {{payment_method}}.", severity: "required" },
      { clause_id: "reason", order: 20, title: "Основание", body_md: "Сумата се получава на основание: {{reason}}.", severity: "required" },
      { clause_id: "final_settlement_clause", order: 30, title: "Окончателно уреждане", body_md: "С получаването на горепосочената сума страните считат отношенията си изцяло уредени и нямат бъдещи претенции една към друга.", include_when: "final_settlement == true", severity: "recommended" },
    ],
  },

  // 6. Молба за неплатен отпуск (чл. 160 КТ) ----------------------------------
  "molba-za-neplaten-otpusk-chl-160-kt": {
    graph: {
      template_slug: "molba-za-neplaten-otpusk-chl-160-kt",
      title: "Молба за неплатен отпуск (чл. 160 КТ)",
      sections: [employeeAddrSection, employeeInfoSection, requestSection, SIGN_SECTION],
      questions: [
        ...addressingQs(),
        ...employeeQs(),
        q({ id: "leave_days", section: "request", label: "Брой работни дни", field_type: "number", required_when: "true" }),
        q({ id: "leave_from", section: "request", label: "От дата", field_type: "date", required_when: "true" }),
        q({ id: "leave_to", section: "request", label: "До дата", field_type: "date", required_when: "true" }),
        q({ id: "reason", section: "request", label: "Мотиви", field_type: "longtext", required_when: "true" }),
        q({ id: "counts_for_service", section: "request", label: "Да се зачете за трудов стаж (до 30 дни/година)?", field_type: "boolean",
          affects_clauses: ["service_clause"] }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "request", order: 10, title: "Искане", body_md: "Моля да ми бъде разрешено ползване на неплатен отпуск в размер на {{leave_days}} работни дни, в периода {{leave_from}} — {{leave_to}}, на основание чл. 160 от КТ.", severity: "required" },
      { clause_id: "reason", order: 20, title: "Мотиви", body_md: "Причина за искането: {{reason}}.", severity: "required" },
      { clause_id: "service_clause", order: 30, title: "Зачитане за стаж", body_md: "Моля отпускът да бъде зачетен за трудов стаж по реда на чл. 160, ал. 1 КТ (до 30 работни дни годишно).", include_when: "counts_for_service == true", severity: "recommended" },
    ],
  },

  // 7. Заповед за командировка (вътрешна) ------------------------------------
  "zapoved-za-komandirovka-vatreshna": {
    graph: {
      template_slug: "zapoved-za-komandirovka-vatreshna",
      title: "Заповед за командировка (вътрешна)",
      sections: [
        { id: "issuer", title: "Издател" },
        { id: "employee", title: "Командирован" },
        { id: "trip", title: "Командировка" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "order_number", section: "issuer", label: "Номер на заповедта", field_type: "text", required_when: "true" }),
        q({ id: "employer_name", section: "issuer", label: "Работодател", field_type: "text", required_when: "true" }),
        q({ id: "issuer_position", section: "issuer", label: "Длъжност на издаващия", field_type: "text", required_when: "true" }),
        q({ id: "employee_name", section: "employee", label: "Име на командирования", field_type: "text", required_when: "true" }),
        q({ id: "employee_position", section: "employee", label: "Длъжност", field_type: "text", required_when: "true" }),
        q({ id: "destination", section: "trip", label: "Място на командировката", field_type: "text", required_when: "true" }),
        q({ id: "trip_from", section: "trip", label: "От дата", field_type: "date", required_when: "true" }),
        q({ id: "trip_to", section: "trip", label: "До дата", field_type: "date", required_when: "true" }),
        q({ id: "purpose", section: "trip", label: "Цел на командировката", field_type: "longtext", required_when: "true" }),
        q({ id: "transport", section: "trip", label: "Транспорт", field_type: "select", required_when: "true",
          options: opts(["personal","Личен автомобил"],["company","Служебен автомобил"],["public","Обществен транспорт"]),
          affects_clauses: ["transport_personal"] }),
        q({ id: "daily_allowance", section: "trip", label: "Дневни (EUR/ден)", field_type: "money" }),
        q({ id: "accommodation_covered", section: "trip", label: "Покриване на нощувка по фактура", field_type: "boolean",
          affects_clauses: ["accommodation_clause"] }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "header", order: 10, title: "ЗАПОВЕД №{{order_number}}", body_md: "На основание чл. 121 от Кодекса на труда и Наредбата за командировките в страната, нареждам:", severity: "required" },
      { clause_id: "command", order: 20, title: "Командироване", body_md: "Командирова се {{employee_name}}, заемащ длъжността „{{employee_position}}\", до {{destination}} за периода {{trip_from}} — {{trip_to}}.", severity: "required" },
      { clause_id: "purpose", order: 30, title: "Цел", body_md: "Цел на командировката: {{purpose}}.", severity: "required" },
      { clause_id: "allowance", order: 40, title: "Дневни", body_md: "На командированото лице се полагат дневни в размер на {{daily_allowance}} EUR за всеки ден от командировката.", include_when: "daily_allowance != ''", severity: "required" },
      { clause_id: "transport_personal", order: 45, title: "Транспортни разноски — личен автомобил", body_md: "Транспортните разноски с личен автомобил се възстановяват по реда на Наредбата срещу представени документи за изминати километри.", include_when: "transport == 'personal'", severity: "recommended" },
      { clause_id: "accommodation_clause", order: 50, title: "Нощувка", body_md: "Разходите за нощувка се възстановяват срещу представена фактура.", include_when: "accommodation_covered == true", severity: "recommended" },
    ],
  },

  // 8. Заповед за командировка в чужбина -------------------------------------
  "zapoved-za-komandirovka-v-chuzhbina": {
    graph: {
      template_slug: "zapoved-za-komandirovka-v-chuzhbina",
      title: "Заповед за командировка в чужбина",
      sections: [
        { id: "issuer", title: "Издател" },
        { id: "employee", title: "Командирован" },
        { id: "trip", title: "Командировка" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "order_number", section: "issuer", label: "Номер на заповедта", field_type: "text", required_when: "true" }),
        q({ id: "employer_name", section: "issuer", label: "Работодател", field_type: "text", required_when: "true" }),
        q({ id: "issuer_position", section: "issuer", label: "Длъжност на издаващия", field_type: "text", required_when: "true" }),
        q({ id: "employee_name", section: "employee", label: "Име на командирования", field_type: "text", required_when: "true" }),
        q({ id: "employee_position", section: "employee", label: "Длъжност", field_type: "text", required_when: "true" }),
        q({ id: "country", section: "trip", label: "Държава", field_type: "text", required_when: "true" }),
        q({ id: "city", section: "trip", label: "Град", field_type: "text", required_when: "true" }),
        q({ id: "trip_from", section: "trip", label: "От дата", field_type: "date", required_when: "true" }),
        q({ id: "trip_to", section: "trip", label: "До дата", field_type: "date", required_when: "true" }),
        q({ id: "purpose", section: "trip", label: "Цел", field_type: "longtext", required_when: "true" }),
        q({ id: "daily_allowance", section: "trip", label: "Дневни (EUR/ден)", field_type: "money", required_when: "true" }),
        q({ id: "insurance_covered", section: "trip", label: "Покриване на медицинска застраховка", field_type: "boolean",
          affects_clauses: ["insurance_clause"] }),
      ],
    },
    clauses: [
      { clause_id: "header", order: 10, title: "ЗАПОВЕД №{{order_number}}", body_md: "На основание Наредбата за служебните командировки и специализации в чужбина, нареждам:", severity: "required" },
      { clause_id: "command", order: 20, title: "Командироване", body_md: "Командирова се {{employee_name}} ({{employee_position}}) до {{city}}, {{country}}, за периода {{trip_from}} — {{trip_to}}.", severity: "required" },
      { clause_id: "purpose", order: 30, title: "Цел", body_md: "Цел: {{purpose}}.", severity: "required" },
      { clause_id: "allowance", order: 40, title: "Дневни", body_md: "Полагат се дневни в размер на {{daily_allowance}} EUR за всеки ден от командировката.", severity: "required" },
      { clause_id: "insurance_clause", order: 50, title: "Медицинска застраховка", body_md: "Работодателят осигурява медицинска застраховка за времето на командировката.", include_when: "insurance_covered == true", severity: "recommended" },
    ],
  },

  // 9. Молба за промяна на работно време --------------------------------------
  "molba-za-promyana-na-rabotno-vreme": {
    graph: {
      template_slug: "molba-za-promyana-na-rabotno-vreme",
      title: "Молба за промяна на работно време",
      sections: [employeeAddrSection, employeeInfoSection, requestSection, SIGN_SECTION],
      questions: [
        ...addressingQs(),
        ...employeeQs(),
        q({ id: "current_schedule", section: "request", label: "Настоящо работно време", field_type: "text", required_when: "true" }),
        q({ id: "new_schedule_type", section: "request", label: "Желан режим", field_type: "select", required_when: "true",
          options: opts(["part_time","Непълно работно време"],["flexible","Гъвкаво работно време"],["remote","Дистанционна работа"],["custom","Друго"]),
          affects_clauses: ["part_time_clause","flexible_clause","remote_clause","custom_clause"] }),
        q({ id: "new_schedule_details", section: "request", label: "Детайли за новия режим", field_type: "longtext", required_when: "true" }),
        q({ id: "effective_from", section: "request", label: "Считано от дата", field_type: "date", required_when: "true" }),
        q({ id: "reason", section: "request", label: "Мотиви", field_type: "longtext", required_when: "true" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "request", order: 10, title: "Искане", body_md: "Моля да бъде променено настоящото ми работно време ({{current_schedule}}) считано от {{effective_from}}.", severity: "required" },
      { clause_id: "part_time_clause", order: 20, title: "Непълно работно време", body_md: "Желая преминаване на непълно работно време: {{new_schedule_details}}.", include_when: "new_schedule_type == 'part_time'", severity: "required" },
      { clause_id: "flexible_clause", order: 21, title: "Гъвкаво работно време", body_md: "Желая гъвкав режим: {{new_schedule_details}}.", include_when: "new_schedule_type == 'flexible'", severity: "required" },
      { clause_id: "remote_clause", order: 22, title: "Дистанционна работа", body_md: "Желая преминаване на дистанционна работа при условия: {{new_schedule_details}}.", include_when: "new_schedule_type == 'remote'", severity: "required" },
      { clause_id: "custom_clause", order: 23, title: "Друг режим", body_md: "Желан режим: {{new_schedule_details}}.", include_when: "new_schedule_type == 'custom'", severity: "required" },
      { clause_id: "reason", order: 30, title: "Мотиви", body_md: "{{reason}}", severity: "required" },
    ],
  },

  // 10. Заповед за уволнение по чл. 328 КТ (съкращение) ----------------------
  "zapoved-za-uvolnenie-po-chl-328-kt-sakrashtenie": {
    graph: {
      template_slug: "zapoved-za-uvolnenie-po-chl-328-kt-sakrashtenie",
      title: "Заповед за уволнение по чл. 328 КТ (съкращение)",
      sections: [
        { id: "issuer", title: "Работодател" },
        { id: "employee", title: "Служител" },
        { id: "termination", title: "Прекратяване" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "order_number", section: "issuer", label: "Номер на заповедта", field_type: "text", required_when: "true" }),
        q({ id: "employer_name", section: "issuer", label: "Работодател (наименование)", field_type: "text", required_when: "true" }),
        q({ id: "employer_eik", section: "issuer", label: "ЕИК", field_type: "text", required_when: "true" }),
        q({ id: "employee_name", section: "employee", label: "Име на служителя", field_type: "text", required_when: "true" }),
        q({ id: "employee_egn", section: "employee", label: "ЕГН", field_type: "text" }),
        q({ id: "employee_position", section: "employee", label: "Длъжност", field_type: "text", required_when: "true" }),
        q({ id: "contract_number", section: "termination", label: "Номер на трудовия договор", field_type: "text", required_when: "true" }),
        q({ id: "contract_date", section: "termination", label: "Дата на трудовия договор", field_type: "date", required_when: "true" }),
        q({ id: "ground", section: "termination", label: "Основание (чл. 328, ал. 1)", field_type: "select", required_when: "true",
          options: opts(["t2","т. 2 — съкращаване на щата"],["t3","т. 3 — намаляване на обема на работа"],["t10","т. 10 — придобито право на пенсия"]),
          affects_clauses: ["ground_t2","ground_t3","ground_t10"] }),
        q({ id: "termination_date", section: "termination", label: "Дата на прекратяване", field_type: "date", required_when: "true" }),
        q({ id: "notice_paid", section: "termination", label: "Изплаща се обезщетение по чл. 220 (без предизвестие)", field_type: "boolean",
          affects_clauses: ["compensation_notice"] }),
        q({ id: "severance_months", section: "termination", label: "Обезщетение по чл. 222 (брой месеци)", field_type: "number",
          affects_clauses: ["compensation_222"] }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "header", order: 10, title: "ЗАПОВЕД №{{order_number}}", body_md: "На основание чл. 328, ал. 1 от Кодекса на труда, нареждам:", severity: "required" },
      { clause_id: "ground_t2", order: 20, title: "Основание", body_md: "Прекратявам трудовото правоотношение по чл. 328, ал. 1, т. 2 КТ — съкращаване на щата.", include_when: "ground == 't2'", severity: "required" },
      { clause_id: "ground_t3", order: 21, title: "Основание", body_md: "Прекратявам трудовото правоотношение по чл. 328, ал. 1, т. 3 КТ — намаляване на обема на работата.", include_when: "ground == 't3'", severity: "required" },
      { clause_id: "ground_t10", order: 22, title: "Основание", body_md: "Прекратявам трудовото правоотношение по чл. 328, ал. 1, т. 10 КТ — придобито право на пенсия за осигурителен стаж и възраст.", include_when: "ground == 't10'", severity: "required" },
      { clause_id: "subject", order: 30, title: "Прекратяване", body_md: "Прекратява се трудовият договор №{{contract_number}}/{{contract_date}} със служителя {{employee_name}} (ЕГН {{employee_egn}}), длъжност „{{employee_position}}\", считано от {{termination_date}}.", severity: "required" },
      { clause_id: "compensation_notice", order: 40, title: "Обезщетение по чл. 220 КТ", body_md: "На служителя се изплаща обезщетение по чл. 220 от КТ за неспазено предизвестие.", include_when: "notice_paid == true", severity: "required" },
      { clause_id: "compensation_222", order: 50, title: "Обезщетение по чл. 222 КТ", body_md: "На служителя се изплаща обезщетение по чл. 222, ал. 1 КТ за {{severance_months}} месеца оставане без работа.", include_when: "severance_months > 0", severity: "required" },
    ],
  },

  // 11. Служебна бележка по чл. 45 ЗДДФЛ -------------------------------------
  "sluzhebna-belezhka-po-chl-45-zddfl": {
    graph: {
      template_slug: "sluzhebna-belezhka-po-chl-45-zddfl",
      title: "Служебна бележка по чл. 45 ЗДДФЛ",
      sections: [
        { id: "issuer", title: "Издател" },
        { id: "employee", title: "Лице" },
        { id: "income", title: "Доходи" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "employer_name", section: "issuer", label: "Работодател", field_type: "text", required_when: "true" }),
        q({ id: "employer_eik", section: "issuer", label: "ЕИК", field_type: "text", required_when: "true" }),
        q({ id: "employee_name", section: "employee", label: "Име на лицето", field_type: "text", required_when: "true" }),
        q({ id: "employee_egn", section: "employee", label: "ЕГН", field_type: "text", required_when: "true" }),
        q({ id: "year", section: "income", label: "За година", field_type: "number", required_when: "true" }),
        q({ id: "gross_income", section: "income", label: "Брутен доход (EUR)", field_type: "money", required_when: "true" }),
        q({ id: "social_contributions", section: "income", label: "Удържани осигуровки (EUR)", field_type: "money", required_when: "true" }),
        q({ id: "tax_withheld", section: "income", label: "Удържан данък (EUR)", field_type: "money", required_when: "true" }),
        q({ id: "purpose", section: "income", label: "За представяне пред", field_type: "text" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "header", order: 10, title: "Служебна бележка", body_md: "{{employer_name}} (ЕИК {{employer_eik}}) удостоверява, че {{employee_name}} (ЕГН {{employee_egn}}) през {{year}} г. е получил/а доходи от трудово правоотношение, както следва:", severity: "required" },
      { clause_id: "summary", order: 20, title: "Данни за дохода", body_md: "Брутен доход: {{gross_income}} EUR. Удържани осигуровки: {{social_contributions}} EUR. Удържан данък по чл. 42 ЗДДФЛ: {{tax_withheld}} EUR.", severity: "required" },
      { clause_id: "purpose", order: 30, title: "Цел", body_md: "Бележката се издава за представяне пред {{purpose}}.", include_when: "purpose != ''", severity: "optional" },
    ],
  },

  // 12. Молба за напускане (кратка форма) -------------------------------------
  "molba-za-napuskane": {
    graph: {
      template_slug: "molba-za-napuskane",
      title: "Молба за напускане",
      sections: [employeeAddrSection, employeeInfoSection, requestSection, SIGN_SECTION],
      questions: [
        ...addressingQs(),
        ...employeeQs(),
        q({ id: "termination_basis", section: "request", label: "Основание", field_type: "select", required_when: "true",
          options: opts(["326","чл. 326 КТ — с предизвестие"],["325","чл. 325 — по взаимно съгласие"],["327","чл. 327 — без предизвестие"]),
          affects_clauses: ["basis_326","basis_325","basis_327"] }),
        q({ id: "notice_period_days", section: "request", label: "Срок на предизвестие (дни)", field_type: "number",
          visible_when: "termination_basis == '326'" }),
        q({ id: "termination_date", section: "request", label: "Желана дата на прекратяване", field_type: "date", required_when: "true" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "intro", order: 10, title: "Искане", body_md: "Долуподписаният/ата {{employee_name}}, длъжност „{{employee_position}}\" при {{employer_name}}, заявявам, че желая да прекратя трудовото си правоотношение, считано от {{termination_date}}.", severity: "required" },
      { clause_id: "basis_326", order: 20, title: "Основание", body_md: "Прекратяването е на основание чл. 326 КТ, при срок на предизвестие {{notice_period_days}} дни.", include_when: "termination_basis == '326'", severity: "required" },
      { clause_id: "basis_325", order: 21, title: "Основание", body_md: "Прекратяването се иска на основание чл. 325, ал. 1, т. 1 КТ — по взаимно съгласие.", include_when: "termination_basis == '325'", severity: "required" },
      { clause_id: "basis_327", order: 22, title: "Основание", body_md: "Прекратяването се извършва на основание чл. 327 КТ — без предизвестие.", include_when: "termination_basis == '327'", severity: "required" },
    ],
  },

  // 13. Общо пълномощно -------------------------------------------------------
  "obshto-palnomoshtno": {
    graph: {
      template_slug: "obshto-palnomoshtno",
      title: "Общо пълномощно",
      sections: [
        { id: "grantor", title: "Упълномощител" },
        { id: "grantee", title: "Пълномощник" },
        { id: "scope", title: "Обхват" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "grantor_party", section: "grantor", label: "Упълномощител", field_type: "party_list", required_when: "true" }),
        q({ id: "grantee_party", section: "grantee", label: "Пълномощник", field_type: "party_list", required_when: "true" }),
        q({ id: "scope_areas", section: "scope", label: "Действия, които обхваща", field_type: "longtext", required_when: "true" }),
        q({ id: "valid_until", section: "scope", label: "Валидност до", field_type: "date" }),
        q({ id: "notarized", section: "scope", label: "Нотариална заверка", field_type: "boolean",
          affects_clauses: ["notary_clause"] }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "header", order: 10, title: "Упълномощаване", body_md: "Упълномощителят упълномощава Пълномощника да го представлява и да извършва от негово име и за негова сметка следните действия: {{scope_areas}}.", severity: "required" },
      { clause_id: "validity", order: 20, title: "Срок", body_md: "Настоящото пълномощно е валидно до {{valid_until}}.", include_when: "valid_until != ''", severity: "optional" },
      { clause_id: "notary_clause", order: 30, title: "Нотариална заверка", body_md: "Подписът на Упълномощителя следва да бъде нотариално заверен.", include_when: "notarized == true", severity: "recommended" },
    ],
  },

  // 14. Декларация по чл. 313а КТ --------------------------------------------
  "deklaratsiya-po-chl-313a-kt": {
    graph: {
      template_slug: "deklaratsiya-po-chl-313a-kt",
      title: "Декларация по чл. 313а КТ",
      sections: [
        { id: "employee", title: "Декларатор" },
        { id: "employer", title: "Работодател" },
        { id: "declaration", title: "Декларация" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "employee_name", section: "employee", label: "Име на декларатора", field_type: "text", required_when: "true" }),
        q({ id: "employee_egn", section: "employee", label: "ЕГН", field_type: "text", required_when: "true" }),
        q({ id: "employer_name", section: "employer", label: "Работодател", field_type: "text", required_when: "true" }),
        q({ id: "employer_eik", section: "employer", label: "ЕИК", field_type: "text", required_when: "true" }),
        q({ id: "has_other_employment", section: "declaration", label: "Имам ли друго трудово правоотношение?", field_type: "boolean", required_when: "true",
          affects_clauses: ["other_yes","other_no"] }),
        q({ id: "other_employer", section: "declaration", label: "Друг работодател (наименование и ЕИК)", field_type: "text",
          visible_when: "has_other_employment == true" }),
        q({ id: "weekly_hours_other", section: "declaration", label: "Седмично работно време при другия работодател (часове)", field_type: "number",
          visible_when: "has_other_employment == true" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "intro", order: 10, title: "Декларация", body_md: "Долуподписаният/ата {{employee_name}}, ЕГН {{employee_egn}}, декларирам пред работодателя {{employer_name}} (ЕИК {{employer_eik}}) следното:", severity: "required" },
      { clause_id: "other_no", order: 20, title: "Без друго трудово правоотношение", body_md: "Към момента на постъпване нямам сключен друг трудов договор и работното ми време при настоящия работодател може да бъде определено в рамките на максимално допустимото по КТ.", include_when: "has_other_employment == false", severity: "required" },
      { clause_id: "other_yes", order: 21, title: "Друго трудово правоотношение", body_md: "Имам сключен трудов договор с {{other_employer}}, при който седмичното ми работно време е {{weekly_hours_other}} часа.", include_when: "has_other_employment == true", severity: "required" },
    ],
  },

  // 15. Приемно-предавателен протокол (общ) -----------------------------------
  "priemo-predavatelen-protokol": {
    graph: {
      template_slug: "priemo-predavatelen-protokol",
      title: "Приемно-предавателен протокол",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "subject", title: "Обект" },
        { id: "condition", title: "Състояние" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "deliverer", section: "parties", label: "Предал", field_type: "party_list", required_when: "true" }),
        q({ id: "recipient", section: "parties", label: "Приел", field_type: "party_list", required_when: "true" }),
        q({ id: "reference_contract", section: "subject", label: "Във връзка с договор/задание", field_type: "text" }),
        q({ id: "items_list", section: "subject", label: "Списък на предадените вещи/документи", field_type: "longtext", required_when: "true" }),
        q({ id: "condition_state", section: "condition", label: "Състояние при предаването", field_type: "select", required_when: "true",
          options: opts(["new","Ново / неизползвано"],["good","Изправно"],["defects","С отбелязани недостатъци"]),
          affects_clauses: ["defects_clause"] }),
        q({ id: "defects_description", section: "condition", label: "Описание на недостатъци", field_type: "longtext",
          visible_when: "condition_state == 'defects'" }),
        q({ id: "no_claims", section: "condition", label: "Приелият няма възражения", field_type: "boolean",
          affects_clauses: ["no_claims_clause"] }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "header", order: 10, title: "Предмет", body_md: "Днес, {{date_signed}} в {{place_signed}}, Предалият предаде, а Приелият прие следните вещи/документи: {{items_list}}.", severity: "required" },
      { clause_id: "reference", order: 15, title: "Връзка с договор", body_md: "Предаването се извършва във връзка с {{reference_contract}}.", include_when: "reference_contract != ''", severity: "optional" },
      { clause_id: "condition", order: 20, title: "Състояние", body_md: "Вещите/документите се предават в състояние „{{condition_state}}\".", severity: "required" },
      { clause_id: "defects_clause", order: 25, title: "Недостатъци", body_md: "При предаването са констатирани следните недостатъци: {{defects_description}}.", include_when: "condition_state == 'defects'", severity: "required" },
      { clause_id: "no_claims_clause", order: 30, title: "Без възражения", body_md: "Приелият потвърждава, че няма възражения по състоянието и пълнотата на предадените вещи/документи.", include_when: "no_claims == true", severity: "recommended" },
    ],
  },

  // 16. Приемно-предавателен протокол при продажба на имот --------------------
  "priemo-predavatelen-protokol-pri-prodazhba-na-imot": {
    graph: {
      template_slug: "priemo-predavatelen-protokol-pri-prodazhba-na-imot",
      title: "Приемно-предавателен протокол при продажба на имот",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "property", title: "Имот" },
        { id: "meters", title: "Показания" },
        { id: "keys", title: "Ключове / документи" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "seller", section: "parties", label: "Продавач", field_type: "party_list", required_when: "true" }),
        q({ id: "buyer", section: "parties", label: "Купувач", field_type: "party_list", required_when: "true" }),
        q({ id: "deed_number", section: "property", label: "Номер на нотариалния акт", field_type: "text", required_when: "true" }),
        q({ id: "deed_date", section: "property", label: "Дата на акта", field_type: "date", required_when: "true" }),
        q({ id: "property_address", section: "property", label: "Адрес на имота", field_type: "longtext", required_when: "true" }),
        q({ id: "property_area", section: "property", label: "Площ (кв. м)", field_type: "number" }),
        q({ id: "electricity_reading", section: "meters", label: "Показание ел. електромер", field_type: "text" }),
        q({ id: "water_reading", section: "meters", label: "Показание водомер", field_type: "text" }),
        q({ id: "heating_reading", section: "meters", label: "Показание топломер", field_type: "text" }),
        q({ id: "keys_count", section: "keys", label: "Брой предадени ключове", field_type: "number", required_when: "true" }),
        q({ id: "documents_handed", section: "keys", label: "Документи, предадени с имота", field_type: "longtext" }),
        q({ id: "outstanding_bills", section: "keys", label: "Дължими сметки към датата", field_type: "longtext",
          affects_clauses: ["bills_clause"] }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "header", order: 10, title: "Предаване на имот", body_md: "Днес, {{date_signed}} в {{place_signed}}, Продавачът предаде, а Купувачът прие владението на имот по нот. акт №{{deed_number}}/{{deed_date}}, находящ се на адрес: {{property_address}}, площ {{property_area}} кв. м.", severity: "required" },
      { clause_id: "meters", order: 20, title: "Показания на измервателните уреди", body_md: "Електромер: {{electricity_reading}}. Водомер: {{water_reading}}. Топломер: {{heating_reading}}.", severity: "required" },
      { clause_id: "keys", order: 30, title: "Ключове и документи", body_md: "Предадени {{keys_count}} ключа, както и следните документи: {{documents_handed}}.", severity: "required" },
      { clause_id: "bills_clause", order: 40, title: "Дължими сметки", body_md: "Към датата на предаване са налице следните неплатени сметки/задължения, които остават за сметка на Продавача: {{outstanding_bills}}.", include_when: "outstanding_bills != ''", severity: "recommended" },
    ],
  },

  // 17. Анекс за подновяване на наем -----------------------------------------
  "aneks-za-podnovyavane-na-naem": {
    graph: {
      template_slug: "aneks-za-podnovyavane-na-naem",
      title: "Анекс за подновяване на наем",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "original", title: "Първоначален договор" },
        { id: "changes", title: "Изменения" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "landlord", section: "parties", label: "Наемодател", field_type: "party_list", required_when: "true" }),
        q({ id: "tenant", section: "parties", label: "Наемател", field_type: "party_list", required_when: "true" }),
        q({ id: "original_contract_date", section: "original", label: "Дата на основния договор", field_type: "date", required_when: "true" }),
        q({ id: "property_address", section: "original", label: "Адрес на имота", field_type: "longtext", required_when: "true" }),
        q({ id: "new_term_from", section: "changes", label: "Нов срок — от дата", field_type: "date", required_when: "true" }),
        q({ id: "new_term_to", section: "changes", label: "Нов срок — до дата", field_type: "date", required_when: "true" }),
        q({ id: "rent_change", section: "changes", label: "Промяна на наема?", field_type: "boolean",
          affects_clauses: ["rent_change_clause"] }),
        q({ id: "new_rent", section: "changes", label: "Нов месечен наем (EUR)", field_type: "money",
          visible_when: "rent_change == true", required_when: "rent_change == true" }),
        q({ id: "deposit_change", section: "changes", label: "Промяна на депозита?", field_type: "boolean",
          affects_clauses: ["deposit_change_clause"] }),
        q({ id: "new_deposit", section: "changes", label: "Нов депозит (EUR)", field_type: "money",
          visible_when: "deposit_change == true", required_when: "deposit_change == true" }),
        q({ id: "other_changes", section: "changes", label: "Други изменения (по желание)", field_type: "longtext" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "intro", order: 10, title: "Предмет", body_md: "Страните се споразумяват за подновяване и изменение на сключения между тях договор за наем от {{original_contract_date}} за имот, находящ се на адрес: {{property_address}}.", severity: "required" },
      { clause_id: "term", order: 20, title: "Нов срок", body_md: "Договорът се продължава за нов срок, считано от {{new_term_from}} до {{new_term_to}}.", severity: "required" },
      { clause_id: "rent_change_clause", order: 30, title: "Изменение на наема", body_md: "Месечният наем се променя на {{new_rent}} EUR.", include_when: "rent_change == true", severity: "required" },
      { clause_id: "deposit_change_clause", order: 40, title: "Изменение на депозита", body_md: "Депозитът се променя на {{new_deposit}} EUR. Разликата се внася/възстановява в 7-дневен срок от подписване на анекса.", include_when: "deposit_change == true", severity: "required" },
      { clause_id: "other", order: 50, title: "Други изменения", body_md: "{{other_changes}}", include_when: "other_changes != ''", severity: "optional" },
      { clause_id: "unchanged", order: 60, title: "Останали клаузи", body_md: "Всички останали клаузи от основния договор остават непроменени.", severity: "required" },
    ],
  },

  // 18. Договор за поръчителство (чл. 138 ЗЗД) -------------------------------
  "dogovor-za-porachitelstvo-chl-138-zzd": {
    graph: {
      template_slug: "dogovor-za-porachitelstvo-chl-138-zzd",
      title: "Договор за поръчителство (чл. 138 ЗЗД)",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "main_debt", title: "Главно задължение" },
        { id: "guarantee", title: "Поръчителство" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "creditor", section: "parties", label: "Кредитор", field_type: "party_list", required_when: "true" }),
        q({ id: "guarantor", section: "parties", label: "Поръчител", field_type: "party_list", required_when: "true" }),
        q({ id: "debtor_name", section: "main_debt", label: "Длъжник (име/наименование)", field_type: "text", required_when: "true" }),
        q({ id: "debt_basis", section: "main_debt", label: "Основание на главното задължение", field_type: "longtext", required_when: "true" }),
        q({ id: "debt_amount", section: "main_debt", label: "Размер на главното задължение (EUR)", field_type: "money", required_when: "true" }),
        q({ id: "debt_due_date", section: "main_debt", label: "Падеж", field_type: "date" }),
        q({ id: "guarantee_scope", section: "guarantee", label: "Обем на поръчителството", field_type: "select", required_when: "true",
          options: opts(["full","Пълно — главница, лихви, разноски"],["principal_only","Само главница"],["limited","Ограничен размер"]),
          affects_clauses: ["scope_full","scope_principal","scope_limited"] }),
        q({ id: "guarantee_limit", section: "guarantee", label: "Лимит на поръчителството (EUR)", field_type: "money",
          visible_when: "guarantee_scope == 'limited'", required_when: "guarantee_scope == 'limited'" }),
        q({ id: "guarantee_term", section: "guarantee", label: "Срок на поръчителството (до дата)", field_type: "date" }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "header", order: 10, title: "Предмет", body_md: "Поръчителят се задължава пред Кредитора да отговаря за изпълнението на задължението на {{debtor_name}}, произтичащо от {{debt_basis}}, в размер на {{debt_amount}} EUR с падеж {{debt_due_date}}.", severity: "required" },
      { clause_id: "scope_full", order: 20, title: "Обем", body_md: "Поръчителството обхваща главницата, лихвите, неустойките и разноските за събиране на вземането.", include_when: "guarantee_scope == 'full'", severity: "required" },
      { clause_id: "scope_principal", order: 21, title: "Обем", body_md: "Поръчителството е ограничено до главницата на задължението.", include_when: "guarantee_scope == 'principal_only'", severity: "required" },
      { clause_id: "scope_limited", order: 22, title: "Лимит", body_md: "Поръчителството е до размера на {{guarantee_limit}} EUR.", include_when: "guarantee_scope == 'limited'", severity: "required" },
      { clause_id: "joint", order: 30, title: "Солидарност", body_md: "Поръчителят отговаря солидарно с главния длъжник по реда на чл. 141 ЗЗД.", severity: "required" },
      { clause_id: "term", order: 40, title: "Срок", body_md: "Настоящото поръчителство е валидно до {{guarantee_term}}.", include_when: "guarantee_term != ''", severity: "optional" },
    ],
  },

  // 19. Разписка за получена сума (наем/депозит) ------------------------------
  "razpiska-za-poluchena-suma-naem-depozit": {
    graph: {
      template_slug: "razpiska-za-poluchena-suma-naem-depozit",
      title: "Разписка за получена сума (наем/депозит)",
      sections: [
        { id: "parties", title: "Страни" },
        { id: "lease", title: "Наем" },
        { id: "amount", title: "Сума" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "landlord", section: "parties", label: "Наемодател (получател)", field_type: "party_list", required_when: "true" }),
        q({ id: "tenant", section: "parties", label: "Наемател (платец)", field_type: "party_list", required_when: "true" }),
        q({ id: "property_address", section: "lease", label: "Адрес на имота", field_type: "longtext", required_when: "true" }),
        q({ id: "lease_contract_date", section: "lease", label: "Дата на договора за наем", field_type: "date" }),
        q({ id: "payment_kind", section: "amount", label: "Вид плащане", field_type: "select", required_when: "true",
          options: opts(["rent","Месечен наем"],["deposit","Депозит"],["both","Наем + депозит"]),
          affects_clauses: ["rent_clause","deposit_clause","both_clause"] }),
        q({ id: "rent_period", section: "amount", label: "За кой период (ако наем)", field_type: "text",
          visible_when: "payment_kind == 'rent' or payment_kind == 'both'" }),
        q({ id: "amount", section: "amount", label: "Получена сума (EUR)", field_type: "money", required_when: "true" }),
        q({ id: "amount_words", section: "amount", label: "Сумата с думи", field_type: "text", required_when: "true" }),
        q({ id: "payment_method", section: "amount", label: "Начин на плащане", field_type: "select", required_when: "true",
          options: opts(["cash","В брой"],["bank","По банков път"]) }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "intro", order: 10, title: "Получаване", body_md: "Долуподписаният Наемодател потвърждавам, че днес — {{date_signed}} в {{place_signed}}, получих от Наемателя сумата от {{amount}} EUR ({{amount_words}}) {{payment_method}}.", severity: "required" },
      { clause_id: "rent_clause", order: 20, title: "Основание", body_md: "Сумата представлява наем за периода {{rent_period}} за имот на адрес: {{property_address}}, по договор за наем от {{lease_contract_date}}.", include_when: "payment_kind == 'rent'", severity: "required" },
      { clause_id: "deposit_clause", order: 21, title: "Основание", body_md: "Сумата представлява депозит (гаранция за добро изпълнение) по договор за наем от {{lease_contract_date}} за имот на адрес: {{property_address}}.", include_when: "payment_kind == 'deposit'", severity: "required" },
      { clause_id: "both_clause", order: 22, title: "Основание", body_md: "Сумата включва наем за периода {{rent_period}} и депозит по договор за наем от {{lease_contract_date}} за имот на адрес: {{property_address}}.", include_when: "payment_kind == 'both'", severity: "required" },
    ],
  },

  // 20. Декларация за съгласие за пътуване на дете ---------------------------
  "deklaratsiya-za-saglasie-za-patuvane-na-dete": {
    graph: {
      template_slug: "deklaratsiya-za-saglasie-za-patuvane-na-dete",
      title: "Декларация за съгласие за пътуване на дете",
      sections: [
        { id: "parent", title: "Родител / настойник" },
        { id: "child", title: "Дете" },
        { id: "travel", title: "Пътуване" },
        SIGN_SECTION,
      ],
      questions: [
        q({ id: "parent_name", section: "parent", label: "Име на родителя/настойника", field_type: "text", required_when: "true" }),
        q({ id: "parent_egn", section: "parent", label: "ЕГН", field_type: "text", required_when: "true" }),
        q({ id: "parent_role", section: "parent", label: "Качество", field_type: "select", required_when: "true",
          options: opts(["mother","Майка"],["father","Баща"],["guardian","Настойник"]) }),
        q({ id: "child_name", section: "child", label: "Име на детето", field_type: "text", required_when: "true" }),
        q({ id: "child_egn", section: "child", label: "ЕГН на детето", field_type: "text", required_when: "true" }),
        q({ id: "child_passport", section: "child", label: "Документ за самоличност (№ паспорт/л.к.)", field_type: "text" }),
        q({ id: "accompanying_person", section: "travel", label: "Придружител (име и качество)", field_type: "text", required_when: "true" }),
        q({ id: "destination_country", section: "travel", label: "Държава(и) на пътуване", field_type: "text", required_when: "true" }),
        q({ id: "travel_from", section: "travel", label: "Период — от", field_type: "date", required_when: "true" }),
        q({ id: "travel_to", section: "travel", label: "Период — до", field_type: "date", required_when: "true" }),
        q({ id: "purpose", section: "travel", label: "Цел на пътуването", field_type: "text" }),
        q({ id: "multiple_trips", section: "travel", label: "Многократно пътуване в периода", field_type: "boolean",
          affects_clauses: ["multiple_trips_clause"] }),
        ...signQuestions(),
      ],
    },
    clauses: [
      { clause_id: "intro", order: 10, title: "Декларация", body_md: "Долуподписаният/ата {{parent_name}}, ЕГН {{parent_egn}}, в качеството си на {{parent_role}} на детето {{child_name}}, ЕГН {{child_egn}}, документ за самоличност {{child_passport}}, декларирам своето изрично съгласие за пътуване на детето извън Република България.", severity: "required" },
      { clause_id: "travel", order: 20, title: "Условия на пътуването", body_md: "Детето ще пътува до {{destination_country}} в периода {{travel_from}} — {{travel_to}}, придружено от {{accompanying_person}}.", severity: "required" },
      { clause_id: "purpose", order: 25, title: "Цел", body_md: "Цел на пътуването: {{purpose}}.", include_when: "purpose != ''", severity: "optional" },
      { clause_id: "multiple_trips_clause", order: 30, title: "Многократни пътувания", body_md: "Съгласието се отнася за многократни пътувания в посочения период.", include_when: "multiple_trips == true", severity: "recommended" },
      { clause_id: "notary", order: 40, title: "Нотариална заверка", body_md: "Подписът на декларатора следва да бъде нотариално заверен.", severity: "required" },
    ],
  },
};

export const BULK_GRAPHS_PART3: Record<string, QuestionGraph> = Object.fromEntries(
  Object.entries(SPECS).map(([slug, s]) => [slug, s.graph]),
);

export const BULK_CLAUSES_PART3: ClauseDefinition[] = Object.entries(SPECS).flatMap(([slug, s]) =>
  s.clauses.map((c) => ({ ...c, template_slug: slug })),
);
