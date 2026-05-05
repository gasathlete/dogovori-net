export type FieldType = "text" | "textarea" | "number" | "date" | "select" | "radio";

export interface Question {
  id: string;
  label: string;
  help?: string;
  type: FieldType;
  options?: string[];
  placeholder?: string;
  required?: boolean;
  /** Conditionally show this question */
  showIf?: (answers: Record<string, string>) => boolean;
}

export interface Sector {
  id: string;
  title: string;
  subtitle: string;
  icon: string; // lucide name
  description: string;
  contractName: string;
  parties: { a: string; b: string };
  questions: Question[];
}

const commonTail: Question[] = [
  {
    id: "penalty_pct",
    label: "Размер на неустойката за забава (% на ден)",
    help: "Препоръчително: 0,1% – 0,5% на ден забава, с таван.",
    type: "select",
    options: ["0,05% на ден", "0,1% на ден", "0,3% на ден", "0,5% на ден", "Без неустойка"],
    required: true,
  },
  {
    id: "penalty_cap",
    label: "Таван на неустойката (% от стойността)",
    type: "select",
    options: ["10%", "20%", "30%", "50%", "Без таван"],
    required: true,
  },
  {
    id: "termination",
    label: "Основания за предсрочно прекратяване",
    type: "radio",
    options: [
      "Само по взаимно съгласие",
      "С едностранно предизвестие",
      "При съществено нарушение, без предизвестие",
      "Комбинирано (всички горепосочени)",
    ],
    required: true,
  },
  {
    id: "notice_days",
    label: "Срок на предизвестие (дни)",
    type: "select",
    options: ["7 дни", "14 дни", "30 дни", "60 дни", "90 дни"],
    showIf: (a) =>
      a.termination?.includes("предизвестие") || a.termination?.includes("Комбинирано"),
    required: true,
  },
  {
    id: "force_majeure",
    label: "Клауза за форсмажор",
    type: "radio",
    options: [
      "Стандартна (природни бедствия, война, пандемия)",
      "Разширена (вкл. кибератаки, санкции, прекъсване на доставки)",
      "Минимална (само непреодолима сила по ТЗ)",
    ],
    required: true,
  },
  {
    id: "jurisdiction",
    label: "Подсъдност при спор",
    type: "radio",
    options: [
      "Софийски градски съд",
      "Арбитражен съд при БТПП – София",
      "Компетентен районен/окръжен съд по седалище на ответника",
    ],
    required: true,
  },
  {
    id: "extra_notes",
    label: "Допълнителни специфики (по желание)",
    help: "Всичко, което желаете AI да включи или вземе предвид при анализа на риска.",
    type: "textarea",
    placeholder: "Напр. отговорност за скрити дефекти, гаранционни задължения, конкурентни ограничения...",
  },
];

const partiesQuestions = (a: string, b: string): Question[] => [
  {
    id: "party_a_name",
    label: `Наименование на ${a}`,
    type: "text",
    placeholder: "ЕООД «Пример" / Иван Иванов",
    required: true,
  },
  {
    id: "party_a_type",
    label: `${a} е:`,
    type: "radio",
    options: ["Юридическо лице", "Физическо лице", "ЕТ / Самоосигуряващо се"],
    required: true,
  },
  {
    id: "party_b_name",
    label: `Наименование на ${b}`,
    type: "text",
    placeholder: "ООД «Контрагент" / Мария Петрова",
    required: true,
  },
  {
    id: "party_b_type",
    label: `${b} е:`,
    type: "radio",
    options: ["Юридическо лице", "Физическо лице", "ЕТ / Самоосигуряващо се"],
    required: true,
  },
];

export const SECTORS: Sector[] = [
  {
    id: "real-estate",
    title: "Недвижими имоти",
    subtitle: "Продажби, наеми, управление",
    icon: "Building2",
    description:
      "Предварителни договори, наеми, управление на имоти и брокерски услуги, съобразени със ЗЗД и ЗС.",
    contractName: "Договор за наем на недвижим имот",
    parties: { a: "Наемодателя", b: "Наемателя" },
    questions: [
      ...partiesQuestions("Наемодателя", "Наемателя"),
      {
        id: "property",
        label: "Описание на имота (адрес, площ, етаж, кадастрален №)",
        type: "textarea",
        placeholder: "гр. София, ул. «...", № ..., ет. ..., ап. ..., 85 кв.м., кад. №...",
        required: true,
      },
      {
        id: "purpose",
        label: "Предназначение на ползване",
        type: "radio",
        options: ["Жилищни нужди", "Офис", "Търговски обект", "Складова дейност"],
        required: true,
      },
      {
        id: "rent",
        label: "Месечен наем (в лева, без ДДС)",
        type: "number",
        placeholder: "1500",
        required: true,
      },
      {
        id: "deposit",
        label: "Депозит (брой месечни наеми)",
        type: "select",
        options: ["1 месец", "2 месеца", "3 месеца", "Без депозит"],
        required: true,
      },
      {
        id: "term_months",
        label: "Срок на договора (месеци)",
        type: "select",
        options: ["6 месеца", "12 месеца", "24 месеца", "36 месеца", "Безсрочен"],
        required: true,
      },
      {
        id: "indexation",
        label: "Годишна индексация на наема",
        type: "radio",
        options: ["Без индексация", "Фиксирани 3% годишно", "По индекс на инфлация (НСИ)"],
        required: true,
      },
      ...commonTail,
    ],
  },
  {
    id: "construction",
    title: "Строителство и СМР",
    subtitle: "Грубо строителство до довършителни",
    icon: "HardHat",
    description:
      "Договори за СМР, изпълнение на обект, поетапни плащания и гаранционни срокове по ЗУТ.",
    contractName: "Договор за изпълнение на СМР",
    parties: { a: "Възложителя", b: "Изпълнителя" },
    questions: [
      ...partiesQuestions("Възложителя", "Изпълнителя"),
      {
        id: "object",
        label: "Описание на обекта и видове СМР",
        type: "textarea",
        placeholder: "Грубо строителство на двуетажна жилищна сграда на адрес...",
        required: true,
      },
      {
        id: "value",
        label: "Обща стойност на договора (в лева, без ДДС)",
        type: "number",
        placeholder: "120000",
        required: true,
      },
      {
        id: "payment_schedule",
        label: "Схема на плащане",
        type: "radio",
        options: [
          "Авансово 30% + етапи + 10% задържане",
          "Месечни актове по реално изпълнено",
          "50% аванс / 50% при предаване",
          "По акт-образец 19 на етапи",
        ],
        required: true,
      },
      {
        id: "advance_protection",
        label: "Защита на аванса",
        type: "radio",
        options: ["Банкова гаранция за аванс", "Ескроу сметка", "Без обезпечение"],
        showIf: (a) => /авансов|Аванс|аванс/.test(a.payment_schedule || ""),
        required: true,
      },
      {
        id: "deadline",
        label: "Срок за изпълнение (календарни дни)",
        type: "number",
        placeholder: "180",
        required: true,
      },
      {
        id: "warranty",
        label: "Гаранционен срок (по Наредба №2 към ЗУТ)",
        type: "select",
        options: [
          "Минимални по Наредба №2",
          "5 години за всички СМР",
          "10 години за конструкция",
        ],
        required: true,
      },
      ...commonTail,
    ],
  },
  {
    id: "logistics",
    title: "Логистика и транспорт",
    subtitle: "Превоз, складиране, CMR",
    icon: "Truck",
    description:
      "Договори за вътрешен и международен превоз (CMR), складиране и спедиция.",
    contractName: "Договор за превоз на товари",
    parties: { a: "Спедитора/Възложителя", b: "Превозвача" },
    questions: [
      ...partiesQuestions("Спедитора/Възложителя", "Превозвача"),
      {
        id: "route",
        label: "Маршрут (от – до)",
        type: "text",
        placeholder: "София, България – Мюнхен, Германия",
        required: true,
      },
      {
        id: "cargo",
        label: "Описание на товара (вид, тегло, обем)",
        type: "textarea",
        required: true,
      },
      {
        id: "international",
        label: "Превозът е:",
        type: "radio",
        options: ["Вътрешен (България)", "Международен (CMR конвенция)"],
        required: true,
      },
      {
        id: "freight",
        label: "Навло (цена за превоз) в EUR/BGN",
        type: "number",
        placeholder: "1800",
        required: true,
      },
      {
        id: "payment_term",
        label: "Срок за плащане",
        type: "select",
        options: ["При натоварване", "30 дни след доставка", "45 дни след CMR", "60 дни"],
        required: true,
      },
      {
        id: "insurance",
        label: "Карго застраховка",
        type: "radio",
        options: [
          "За сметка на превозвача (CMR отговорност)",
          "За сметка на възложителя (отделна полица)",
          "Допълнителна All Risk застраховка",
        ],
        required: true,
      },
      ...commonTail,
    ],
  },
  {
    id: "digital",
    title: "Дигитален и фрийланс",
    subtitle: "Софтуер, дизайн, маркетинг, ИС",
    icon: "Code2",
    description:
      "Договори за разработка, поддръжка, IP права, NDA, маркетинг и креативни услуги.",
    contractName: "Договор за изработка на софтуерен продукт",
    parties: { a: "Възложителя", b: "Изпълнителя" },
    questions: [
      ...partiesQuestions("Възложителя", "Изпълнителя"),
      {
        id: "scope",
        label: "Обхват и описание на услугата/продукта",
        type: "textarea",
        placeholder: "Уеб приложение с админ панел, 3 модула, интеграция с...",
        required: true,
      },
      {
        id: "value",
        label: "Обща стойност (BGN, без ДДС)",
        type: "number",
        placeholder: "15000",
        required: true,
      },
      {
        id: "payment_model",
        label: "Модел на плащане",
        type: "radio",
        options: [
          "Fixed price на етапи (Milestones)",
          "Time & Materials (часова ставка)",
          "Месечен ретейнър",
          "50% аванс / 50% при приемане",
        ],
        required: true,
      },
      {
        id: "ip_rights",
        label: "Авторски и интелектуални права",
        type: "radio",
        options: [
          "Пълно прехвърляне към Възложителя при пълно плащане",
          "Изключителен лиценз без прехвърляне",
          "Възложителят получава лиценз, ИЗП запазва правата върху reusable компоненти",
        ],
        required: true,
      },
      {
        id: "nda",
        label: "Конфиденциалност (NDA)",
        type: "radio",
        options: ["Стандартна (3 години)", "Разширена (5 години)", "Безсрочна за търговска тайна"],
        required: true,
      },
      {
        id: "deadline",
        label: "Краен срок за предаване",
        type: "date",
        required: true,
      },
      {
        id: "acceptance",
        label: "Процедура за приемане",
        type: "radio",
        options: [
          "Тих accept след 7 дни без забележки",
          "Изричен подписан приемо-предавателен протокол",
          "UAT тестове по предварително договорени критерии",
        ],
        required: true,
      },
      ...commonTail,
    ],
  },
  {
    id: "partnerships",
    title: "Партньорства и инвестиции",
    subtitle: "JV, акционерни споразумения",
    icon: "Handshake",
    description:
      "Споразумения между съдружници, инвестиционни сделки, vesting и exit клаузи.",
    contractName: "Споразумение между съдружници (Shareholders Agreement)",
    parties: { a: "Партньор A", b: "Партньор B" },
    questions: [
      ...partiesQuestions("Партньор A", "Партньор B"),
      {
        id: "company",
        label: "Дружество (наименование, ЕИК)",
        type: "text",
        required: true,
      },
      {
        id: "shares",
        label: "Разпределение на дялове / акции (%)",
        type: "text",
        placeholder: "A: 60%, B: 40%",
        required: true,
      },
      {
        id: "investment",
        label: "Размер на инвестицията (ако има)",
        type: "number",
        placeholder: "100000",
      },
      {
        id: "governance",
        label: "Управление и взимане на решения",
        type: "radio",
        options: [
          "Едноличен управител с veto права за миноритарния",
          "Двама управители – заедно за съществени решения",
          "Управителен съвет с квалифицирано мнозинство (75%)",
        ],
        required: true,
      },
      {
        id: "vesting",
        label: "Vesting на дяловете на основателите",
        type: "radio",
        options: [
          "Без vesting",
          "4 години с 1 година cliff",
          "3 години линейно",
          "Reverse vesting за основатели",
        ],
        required: true,
      },
      {
        id: "exit",
        label: "Exit клаузи",
        type: "radio",
        options: [
          "Tag-along + Drag-along (стандарт)",
          "Right of First Refusal (ROFR)",
          "Put/Call опции при дедлок",
          "Комбинирани (всички горни)",
        ],
        required: true,
      },
      {
        id: "non_compete",
        label: "Конкурентна забрана след напускане",
        type: "select",
        options: ["Без забрана", "12 месеца", "24 месеца", "36 месеца"],
        required: true,
      },
      ...commonTail,
    ],
  },
  {
    id: "trade",
    title: "Търговия и дистрибуция",
    subtitle: "Агентство, търговия на едро",
    icon: "Store",
    description:
      "Дистрибуторски и агентски договори, ексклузивност, рамкови договори за доставка.",
    contractName: "Договор за дистрибуция",
    parties: { a: "Доставчика", b: "Дистрибутора" },
    questions: [
      ...partiesQuestions("Доставчика", "Дистрибутора"),
      {
        id: "products",
        label: "Продукти / асортимент",
        type: "textarea",
        required: true,
      },
      {
        id: "territory",
        label: "Територия на дистрибуция",
        type: "text",
        placeholder: "Република България / Югоизточна Европа",
        required: true,
      },
      {
        id: "exclusivity",
        label: "Ексклузивност",
        type: "radio",
        options: [
          "Изключителна (Exclusive)",
          "Селективна (Selective)",
          "Неизключителна (Non-exclusive)",
        ],
        required: true,
      },
      {
        id: "min_purchase",
        label: "Минимални годишни покупки (BGN)",
        type: "number",
        placeholder: "200000",
      },
      {
        id: "payment_term",
        label: "Условия на плащане",
        type: "select",
        options: ["Авансово 100%", "Авансово 50% / 50% при доставка", "30 дни отложено", "60 дни отложено"],
        required: true,
      },
      {
        id: "advance_protection",
        label: "Обезпечение при отложено плащане",
        type: "radio",
        options: ["Банкова гаранция", "Запис на заповед", "Застраховка на търговски кредит", "Без"],
        showIf: (a) => /отложено/.test(a.payment_term || ""),
        required: true,
      },
      {
        id: "term_years",
        label: "Срок на договора",
        type: "select",
        options: ["1 година с автоматично продължаване", "2 години", "3 години", "5 години"],
        required: true,
      },
      ...commonTail,
    ],
  },
];

export const getSector = (id: string) => SECTORS.find((s) => s.id === id);
