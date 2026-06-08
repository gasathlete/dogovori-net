// Predefined document kits — curated bundles of related templates for
// common business scenarios. Each `docName` should match a CatalogDocument
// name exactly; if it does not, the item is shown without a link.

export interface KitItem {
  docName: string;
  role: "primary" | "appendix" | "companion";
  optional?: boolean;
  note?: string;
}

export interface DocumentKit {
  id: string;
  title: string;
  sectorId: string;
  group: "corporate" | "real_estate" | "employment" | "digital" | "ip" | "family" | "other";
  groupLabel: string;
  icon: string; // lucide
  shortDescription: string;
  forWho: string;
  items: KitItem[];
  featured?: boolean;
}

export const KIT_GROUPS: { id: DocumentKit["group"]; label: string }[] = [
  { id: "corporate", label: "Фирмено / Корпоративно" },
  { id: "real_estate", label: "Имоти и Наем" },
  { id: "employment", label: "Труд и Услуги" },
  { id: "digital", label: "Дигитално и SaaS" },
  { id: "ip", label: "Интелектуална собственост" },
  { id: "family", label: "Семейно и лично" },
  { id: "other", label: "Други ключови" },
];

export const DOCUMENT_KITS: DocumentKit[] = [
  // ─────────────────────────────  CORPORATE  ─────────────────────────────
  {
    id: "registratsiya-na-ood",
    title: "Регистрация на ООД — пълен пакет",
    sectorId: "corporate",
    group: "corporate",
    groupLabel: "Фирмено",
    icon: "Building2",
    featured: true,
    shortDescription:
      "Всички документи за учредяване на ООД и подаване в Търговския регистър.",
    forWho: "За съдружници, които учредяват ново ООД.",
    items: [
      { docName: "Дружествен договор на ООД", role: "primary" },
      { docName: "Протокол от Общо събрание на ООД", role: "appendix", note: "Учредително събрание" },
      { docName: "Заявление А4/А5 за вписване в Търговския регистър", role: "companion" },
      { docName: "Договор за управление и контрол (ДУК)", role: "companion", optional: true },
    ],
  },
  {
    id: "registratsiya-na-eood",
    title: "Регистрация на ЕООД — пълен пакет",
    sectorId: "corporate",
    group: "corporate",
    groupLabel: "Фирмено",
    icon: "Building",
    featured: true,
    shortDescription:
      "Едноличен собственик: учредителен акт, решение и заявление за вписване.",
    forWho: "За еднолични учредители.",
    items: [
      { docName: "Учредителен акт на ЕООД", role: "primary" },
      { docName: "Решение на едноличния собственик на капитала", role: "appendix" },
      { docName: "Заявление А4/А5 за вписване в Търговския регистър", role: "companion" },
      { docName: "Договор за управление и контрол (ДУК)", role: "companion", optional: true },
    ],
  },
  {
    id: "promyana-po-partida",
    title: "Промяна по партида на дружество",
    sectorId: "corporate",
    group: "corporate",
    groupLabel: "Фирмено",
    icon: "Replace",
    shortDescription:
      "Смяна на управител, седалище, предмет на дейност или капитал.",
    forWho: "За съществуващи ООД/ЕООД с предстояща промяна.",
    items: [
      { docName: "Протокол от Общо събрание на ООД", role: "primary" },
      { docName: "Дружествен договор на ООД", role: "appendix", note: "Актуализиран текст" },
      { docName: "Заявление А4/А5 за вписване в Търговския регистър", role: "companion" },
    ],
  },
  {
    id: "prehvarlyane-dyalove",
    title: "Прехвърляне на дружествени дялове",
    sectorId: "corporate",
    group: "corporate",
    groupLabel: "Фирмено",
    icon: "ArrowRightLeft",
    shortDescription:
      "Чл. 129 ТЗ — договор с нотариална заверка, решение на ОС и вписване.",
    forWho: "При продажба или дарение на дялове в ООД.",
    items: [
      { docName: "Договор за прехвърляне на дружествени дялове (чл. 129 ТЗ)", role: "primary" },
      { docName: "Протокол от Общо събрание на ООД", role: "appendix" },
      { docName: "Дружествен договор на ООД", role: "appendix", note: "Актуализиран" },
      { docName: "Заявление А4/А5 за вписване в Търговския регистър", role: "companion" },
    ],
  },
  {
    id: "zalog-na-dyalove",
    title: "Залог на дружествени дялове",
    sectorId: "corporate",
    group: "corporate",
    groupLabel: "Фирмено",
    icon: "Lock",
    shortDescription: "За обезпечаване на финансиране чрез залог на дялове.",
    forWho: "При банкови или частни финансирания.",
    items: [
      { docName: "Договор за залог на дружествени дялове", role: "primary" },
      { docName: "Протокол от Общо събрание на ООД", role: "appendix" },
      { docName: "Заявление А4/А5 за вписване в Търговския регистър", role: "companion" },
    ],
  },
  {
    id: "investitsionna-sdelka",
    title: "Инвестиционна сделка (SAFE / Convertible / Term Sheet)",
    sectorId: "corporate",
    group: "corporate",
    groupLabel: "Фирмено",
    icon: "TrendingUp",
    featured: true,
    shortDescription:
      "Стартъп финансиране — term sheet, SAFE/Convertible Note и акционерно споразумение.",
    forWho: "За основатели и инвеститори в seed/pre-seed рунд.",
    items: [
      { docName: "Term sheet за инвестиция", role: "primary" },
      { docName: "SAFE (Simple Agreement for Future Equity)", role: "appendix" },
      { docName: "Convertible Note", role: "appendix", optional: true },
      { docName: "Споразумение между съдружници (Shareholders Agreement)", role: "companion" },
      { docName: "Drag-along / Tag-along споразумение", role: "companion", optional: true },
    ],
  },
  {
    id: "esop-vesting",
    title: "ESOP и Vesting за съоснователи",
    sectorId: "corporate",
    group: "corporate",
    groupLabel: "Фирмено",
    icon: "Gem",
    shortDescription:
      "План за опции и vesting на дялове за ключови служители и съоснователи.",
    forWho: "За технологични компании и стартъпи.",
    items: [
      { docName: "Опции за дялове / ESOP план", role: "primary" },
      { docName: "Vesting agreement за съоснователи", role: "appendix" },
      { docName: "Споразумение между съдружници (Shareholders Agreement)", role: "companion", optional: true },
    ],
  },
  {
    id: "dividend",
    title: "Разпределение на дивидент",
    sectorId: "corporate",
    group: "corporate",
    groupLabel: "Фирмено",
    icon: "PiggyBank",
    shortDescription:
      "Свикване на ОС, решение за дивидент и протокол.",
    forWho: "За управители и съдружници в края на финансовата година.",
    items: [
      { docName: "Покана за свикване на Общо събрание", role: "primary" },
      { docName: "Протокол от Общо събрание на ООД", role: "appendix" },
      { docName: "Решение за разпределение на дивидент", role: "appendix" },
    ],
  },

  // ─────────────────────────────  REAL ESTATE / NAEM  ─────────────────────────────
  {
    id: "naem-zhilishte",
    title: "Наем на жилище — пълен пакет",
    sectorId: "real-estate",
    group: "real_estate",
    groupLabel: "Имоти",
    icon: "Home",
    featured: true,
    shortDescription: "Договор, приемо-предавателен протокол, разписка и предизвестие.",
    forWho: "За наемодатели и наематели на жилище.",
    items: [
      { docName: "Договор за наем на жилище", role: "primary" },
      { docName: "Приемо-предавателен протокол", role: "appendix" },
      { docName: "Опис на инвентар към договор за наем", role: "appendix" },
      { docName: "Разписка за получена сума (наем/депозит)", role: "companion" },
      { docName: "Декларация за регистрация на наем пред НАП", role: "companion", optional: true },
      { docName: "Предизвестие за прекратяване на наем", role: "companion", optional: true },
    ],
  },
  {
    id: "naem-ofis",
    title: "Наем на офис / търговски обект",
    sectorId: "real-estate",
    group: "real_estate",
    groupLabel: "Имоти",
    icon: "Briefcase",
    shortDescription: "Бизнес наем с приемо-предавателен протокол и опции за подновяване.",
    forWho: "За фирми, които наемат офис или магазин.",
    items: [
      { docName: "Договор за наем на офис", role: "primary" },
      { docName: "Приемо-предавателен протокол", role: "appendix" },
      { docName: "Опис на инвентар към договор за наем", role: "appendix" },
      { docName: "Анекс за подновяване на наем", role: "companion", optional: true },
    ],
  },
  {
    id: "kratkosrochen-naem",
    title: "Краткосрочен наем (Airbnb тип)",
    sectorId: "real-estate",
    group: "real_estate",
    groupLabel: "Имоти",
    icon: "BedDouble",
    shortDescription: "Договор за нощувка и протокол за оглед.",
    forWho: "За домакини на туристически имоти.",
    items: [
      { docName: "Договор за краткосрочен наем (Airbnb тип)", role: "primary" },
      { docName: "Протокол за оглед на имот под наем", role: "appendix" },
    ],
  },
  {
    id: "pokupko-prodajba-imot",
    title: "Покупко-продажба на недвижим имот",
    sectorId: "real-estate",
    group: "real_estate",
    groupLabel: "Имоти",
    icon: "KeyRound",
    featured: true,
    shortDescription:
      "Предварителен договор, капаро, проект на нотариален акт и приемо-предавателен протокол.",
    forWho: "За купувачи и продавачи на имот.",
    items: [
      { docName: "Предварителен договор за покупка на имот", role: "primary" },
      { docName: "Договор за капаро при продажба на имот", role: "appendix" },
      { docName: "Окончателен договор за покупко-продажба на имот (проект на нотариален акт)", role: "appendix" },
      { docName: "Приемо-предавателен протокол при продажба на имот", role: "companion" },
      { docName: "Декларация по чл. 264 ДОПК", role: "companion" },
      { docName: "Декларация по ЗМИП (мерки срещу прането на пари)", role: "companion" },
      { docName: "Заявление за удостоверение за тежести", role: "companion", optional: true },
      { docName: "Подробно пълномощно за продажба на имот", role: "companion", optional: true },
    ],
  },

  // ─────────────────────────────  EMPLOYMENT  ─────────────────────────────
  {
    id: "trudovo-naznachavane",
    title: "Трудово назначаване (чл. 67 КТ)",
    sectorId: "employment",
    group: "employment",
    groupLabel: "Труд",
    icon: "UserCheck",
    featured: true,
    shortDescription:
      "Трудов договор, длъжностна характеристика и регистрация в НАП.",
    forWho: "За работодатели при ново назначение.",
    items: [
      { docName: "Трудов договор по чл. 67 КТ (безсрочен)", role: "primary" },
      { docName: "Длъжностна характеристика", role: "appendix" },
      { docName: "Уведомление по чл. 62, ал. 5 КТ до НАП", role: "appendix" },
      { docName: "Декларация по ЗЗЛД от служител", role: "companion" },
      { docName: "Заповед за работно време / Правилник за вътрешния трудов ред", role: "companion", optional: true },
    ],
  },
  {
    id: "prekratyavane-trudovo",
    title: "Прекратяване на трудово правоотношение",
    sectorId: "employment",
    group: "employment",
    groupLabel: "Труд",
    icon: "UserMinus",
    featured: true,
    shortDescription:
      "Заповед, споразумение и УП-2/УП-3 за коректно прекратяване по КТ.",
    forWho: "За работодатели и HR при напускане или съкращение.",
    items: [
      { docName: "Заповед за прекратяване на ТПО", role: "primary" },
      { docName: "Споразумение за прекратяване по чл. 325, ал. 1, т. 1 КТ", role: "appendix" },
      { docName: "Молба за прекратяване по взаимно съгласие (чл. 325, ал. 1, т. 1 КТ)", role: "appendix", optional: true },
      { docName: "УП-2 (образец)", role: "companion" },
      { docName: "УП-3 (образец)", role: "companion" },
    ],
  },
  {
    id: "freelancer-paket",
    title: "Freelancer / Граждански договор пакет",
    sectorId: "services",
    group: "employment",
    groupLabel: "Услуги",
    icon: "Briefcase",
    shortDescription:
      "Граждански договор, NDA, сметка за изплатени суми и осигуряване.",
    forWho: "За самонаети и възложители на услуги.",
    items: [
      { docName: "Граждански договор / Договор за услуги", role: "primary" },
      { docName: "NDA – Договор за конфиденциалност", role: "appendix" },
      { docName: "Сметка за изплатени суми", role: "companion" },
      { docName: "Декларация за здравно осигуряване (самоосигуряващо се лице)", role: "companion", optional: true },
    ],
  },

  // ─────────────────────────────  DIGITAL  ─────────────────────────────
  {
    id: "digitalen-proekt",
    title: "Дигитален проект (изработка)",
    sectorId: "digital",
    group: "digital",
    groupLabel: "Дигитално",
    icon: "Laptop",
    featured: true,
    shortDescription:
      "Договор за изработка, NDA, MSA/SOW и приемо-предавателни документи.",
    forWho: "За IT агенции и клиенти.",
    items: [
      { docName: "Договор за изработка на уебсайт / мобилно приложение", role: "primary" },
      { docName: "NDA – Договор за конфиденциалност", role: "appendix" },
      { docName: "Master Services Agreement (MSA)", role: "appendix", optional: true },
      { docName: "Statement of Work (SOW)", role: "companion" },
      { docName: "Acceptance Protocol (приемане на разработка)", role: "companion" },
      { docName: "Change Request форма", role: "companion", optional: true },
    ],
  },
  {
    id: "saas-klient",
    title: "SaaS клиент пакет",
    sectorId: "digital",
    group: "digital",
    groupLabel: "Дигитално",
    icon: "Cloud",
    shortDescription:
      "Абонаментен договор, DPA по GDPR и SLA поддръжка.",
    forWho: "За SaaS компании при onboarding на B2B клиенти.",
    items: [
      { docName: "SaaS абонаментен договор", role: "primary" },
      { docName: "Data Processing Agreement (DPA по GDPR)", role: "appendix" },
      { docName: "Договор за поддръжка на софтуер/хардуер (SLA)", role: "companion", optional: true },
    ],
  },
  {
    id: "saas-eshop-paket",
    title: "Онлайн магазин / SaaS старт",
    sectorId: "ecommerce",
    group: "digital",
    groupLabel: "Дигитално",
    icon: "ShoppingCart",
    featured: true,
    shortDescription:
      "Общи условия, GDPR пакет и декларации за стартиране на онлайн магазин или SaaS.",
    forWho: "За e-commerce и SaaS основатели в България и ЕС.",
    items: [
      { docName: "Общи условия на онлайн магазин", role: "primary" },
      { docName: "Политика за поверителност (GDPR)", role: "appendix" },
      { docName: "Cookie политика", role: "appendix" },
      { docName: "Декларация за съгласие за обработка на лични данни (GDPR)", role: "companion" },
      { docName: "Регистър на дейностите по обработка (GDPR чл. 30)", role: "companion", optional: true },
    ],
  },

  // ─────────────────────────────  IP  ─────────────────────────────
  {
    id: "nda-ip",
    title: "NDA + IP трансфер",
    sectorId: "ip",
    group: "ip",
    groupLabel: "IP",
    icon: "ShieldCheck",
    shortDescription:
      "Конфиденциалност + прехвърляне на авторски права + work-for-hire.",
    forWho: "При наемане на фрийлансъри или преговори с партньори.",
    items: [
      { docName: "NDA – Договор за конфиденциалност", role: "primary" },
      { docName: "Договор за прехвърляне на авторски права", role: "appendix" },
      { docName: "Work-for-hire споразумение", role: "appendix", optional: true },
    ],
  },
  {
    id: "gdpr-paket",
    title: "GDPR пакет за малък бизнес",
    sectorId: "ip",
    group: "ip",
    groupLabel: "IP / GDPR",
    icon: "ShieldAlert",
    featured: true,
    shortDescription:
      "Политика, cookie банер, DPA, регистър и декларации за съгласие.",
    forWho: "За уеб магазини, SaaS и услуги, които събират лични данни.",
    items: [
      { docName: "Политика за поверителност (GDPR)", role: "primary" },
      { docName: "Cookie политика", role: "appendix" },
      { docName: "Декларация за съгласие по GDPR", role: "appendix" },
      { docName: "Регистър на дейностите по обработка (GDPR чл. 30)", role: "appendix" },
      { docName: "Data Processing Agreement (DPA по GDPR)", role: "companion", optional: true },
    ],
  },

  // ─────────────────────────────  OTHER  ─────────────────────────────
  {
    id: "stroitelen-obekt",
    title: "Строителен обект — СМР пакет",
    sectorId: "construction",
    group: "other",
    groupLabel: "Строителство",
    icon: "HardHat",
    shortDescription:
      "Договор за груб строеж, надзор и приемо-предавателни актове.",
    forWho: "За инвеститори и строителни фирми.",
    items: [
      { docName: "Договор за груб строеж (Акт 14)", role: "primary" },
      { docName: "Договор за строителен надзор", role: "appendix" },
      { docName: "Протокол образец 2 (откриване на строителна площадка)", role: "companion" },
      { docName: "Акт обр. 15 (приемане на строежа)", role: "companion" },
    ],
  },
  {
    id: "prodajba-mps",
    title: "Продажба на МПС",
    sectorId: "automotive",
    group: "other",
    groupLabel: "Транспорт",
    icon: "Car",
    shortDescription:
      "Договор за покупко-продажба, декларации и приемо-предавателен протокол.",
    forWho: "За продавачи и купувачи на автомобил.",
    items: [
      { docName: "Договор за покупко-продажба на МПС", role: "primary" },
      { docName: "Декларация за продажба на МПС пред КАТ", role: "appendix" },
      { docName: "Приемо-предавателен протокол за МПС", role: "appendix" },
      { docName: "Декларация по чл. 264 ДОПК", role: "companion" },
      { docName: "Пълномощно за управление и продажба на МПС", role: "companion", optional: true },
    ],
  },

  // ─────────────────────────────  REAL ESTATE (extra)  ─────────────────────────────
  {
    id: "predvaritelen-dogovor-imot",
    title: "Предварителен договор за имот — пълен пакет",
    sectorId: "real-estate",
    group: "real_estate",
    groupLabel: "Имоти",
    icon: "FileSignature",
    shortDescription:
      "Предварителен договор, задатък и декларации преди нотариалния акт.",
    forWho: "За купувачи и продавачи преди финализиране на сделка.",
    items: [
      { docName: "Предварителен договор за покупка на имот", role: "primary" },
      { docName: "Разписка за получена сума в агенция (задатък)", role: "appendix" },
      { docName: "Декларация по чл. 264 ДОПК", role: "companion" },
      { docName: "Заявление за удостоверение за тежести", role: "companion", optional: true },
      { docName: "Споразумение за разваляне на предварителен договор", role: "companion", optional: true },
    ],
  },

  // ─────────────────────────────  POWER OF ATTORNEY  ─────────────────────────────
  {
    id: "pulnomoshchno-paket",
    title: "Пълномощни — представителство",
    sectorId: "power-of-attorney",
    group: "family",
    groupLabel: "Пълномощни",
    icon: "FileSignature",
    featured: true,
    shortDescription:
      "Най-използваните пълномощни — банка, МПС, имот, НАП и държавни органи.",
    forWho: "За всеки, който упълномощава трето лице да го представлява.",
    items: [
      { docName: "Пълномощно за банкови операции", role: "primary" },
      { docName: "Пълномощно за управление и продажба на МПС", role: "appendix" },
      { docName: "Пълномощно за недвижим имот", role: "appendix" },
      { docName: "Пълномощно за пред държавни органи", role: "appendix" },
      { docName: "Пълномощно за НАП", role: "companion", optional: true },
      { docName: "Пълномощно за съд", role: "companion", optional: true },
      { docName: "Оттегляне на пълномощно", role: "companion", optional: true },
    ],
  },

  // ─────────────────────────────  FAMILY  ─────────────────────────────
  {
    id: "razvod-paket",
    title: "Развод по взаимно съгласие",
    sectorId: "family",
    group: "family",
    groupLabel: "Семейно",
    icon: "Users",
    featured: true,
    shortDescription:
      "Молба, споразумение за развод, родителски права и издръжка.",
    forWho: "За съпрузи, които прекратяват брака без съдебен спор.",
    items: [
      { docName: "Молба за развод по взаимно съгласие", role: "primary" },
      { docName: "Споразумение за развод по взаимно съгласие", role: "appendix" },
      { docName: "Споразумение за родителски права", role: "appendix" },
      { docName: "Декларация за семейно и материално положение", role: "companion" },
      { docName: "Молба за издръжка на дете (бланка)", role: "companion", optional: true },
    ],
  },
  {
    id: "roditelski-prava-paket",
    title: "Родителски права и издръжка",
    sectorId: "family",
    group: "family",
    groupLabel: "Семейно",
    icon: "Heart",
    shortDescription:
      "За определяне на режим на лични отношения и издръжка след развод.",
    forWho: "За разделени родители или при промяна на режима.",
    items: [
      { docName: "Споразумение за родителски права", role: "primary" },
      { docName: "Молба за издръжка на дете (бланка)", role: "appendix" },
      { docName: "Декларация за семейно и материално положение", role: "companion" },
      { docName: "Споразумение за извънсъдебно уреждане на спор", role: "companion", optional: true },
    ],
  },
  {
    id: "nasledstvo-paket",
    title: "Наследство и завещание",
    sectorId: "family",
    group: "family",
    groupLabel: "Семейно",
    icon: "Scroll",
    featured: true,
    shortDescription:
      "Завещание, удостоверение за наследници и декларации при наследяване.",
    forWho: "За завещатели и наследници при откриване на наследство.",
    items: [
      { docName: "Саморъчно завещание", role: "primary" },
      { docName: "Нотариално завещание", role: "appendix", optional: true },
      { docName: "Молба за удостоверение за наследници", role: "appendix" },
      { docName: "Декларация за отказ от наследство", role: "companion", optional: true },
      { docName: "Декларация по чл. 264 ДОПК", role: "companion", optional: true },
    ],
  },

  // ─────────────────────────────  FINANCE  ─────────────────────────────
  {
    id: "zaem-pari-paket",
    title: "Заем между физически лица",
    sectorId: "finance",
    group: "other",
    groupLabel: "Финанси",
    icon: "HandCoins",
    featured: true,
    shortDescription:
      "Договор за заем, запис на заповед, разписка и инструменти за събиране.",
    forWho: "За заемодатели и заемополучатели между физически лица.",
    items: [
      { docName: "Договор за заем на парични средства", role: "primary" },
      { docName: "Запис на заповед", role: "appendix" },
      { docName: "Разписка за получена сума", role: "appendix" },
      { docName: "Споразумение за разсрочване на дълг", role: "companion", optional: true },
      { docName: "Покана за доброволно плащане", role: "companion", optional: true },
      { docName: "Споразумение за опрощаване на дълг (чл. 108 ЗЗД)", role: "companion", optional: true },
    ],
  },
  {
    id: "vzemanie-spor",
    title: "Събиране на вземане / извънсъдебно",
    sectorId: "finance",
    group: "other",
    groupLabel: "Финанси",
    icon: "Gavel",
    featured: true,
    shortDescription:
      "Стъпки за извънсъдебно и съдебно събиране на просрочено вземане.",
    forWho: "За кредитори и фирми с просрочени вземания.",
    items: [
      { docName: "Покана за доброволно изпълнение", role: "primary" },
      { docName: "Уведомление за просрочие", role: "appendix" },
      { docName: "Покана за доброволно плащане", role: "appendix" },
      { docName: "Заявление за заповедно производство (чл. 410 ГПК)", role: "companion" },
      { docName: "Споразумение за разсрочване на дълг", role: "companion", optional: true },
    ],
  },

  // ─────────────────────────────  DECLARATIONS  ─────────────────────────────
  {
    id: "deklaratsii-paket",
    title: "Често използвани декларации",
    sectorId: "family",
    group: "family",
    groupLabel: "Декларации",
    icon: "FileCheck",
    shortDescription:
      "ДОПК, ЗМИП и GDPR — задължителните декларации при сделки.",
    forWho: "За страни по сделки с имоти, МПС или обработка на лични данни.",
    items: [
      { docName: "Декларация по чл. 264 ДОПК", role: "primary" },
      { docName: "Декларация по ЗМИП (мерки срещу прането на пари)", role: "appendix" },
      { docName: "Декларация за съгласие за обработка на лични данни (GDPR)", role: "appendix" },
    ],
  },
];

export function getKit(id: string): DocumentKit | undefined {
  return DOCUMENT_KITS.find((k) => k.id === id);
}
