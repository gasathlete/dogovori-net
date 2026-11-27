// Anchor-text dictionary for internal linking with Bulgarian keyword phrases.
//
// SEO goal: when blog/template prose mentions a contract type, link the first
// occurrence to its `/shablon/<slug>` page using a natural BG anchor (the
// phrase as it appears in text). Google reads anchor text as a strong topical
// signal — long, descriptive Bulgarian anchors pointing at the right URL
// boost rankings for those queries without changing the latin slugs.
//
// Each entry maps several keyword variants → a canonical document name from
// CATALOG. The slug is resolved at runtime via templateIndex (handles
// uniqueness suffixes). If a docName has no match in CATALOG it's silently
// skipped — keep names verbatim.
//
// Priority controls match order when phrases overlap. Higher = matched first.
// e.g. "договор за наем на жилище" (priority 10) must beat "договор за наем"
// (priority 5) for the same text.

export interface AnchorEntry {
  /** Phrase variants to detect. Case-insensitive. */
  phrases: string[];
  /** Exact docName from CATALOG → resolved to slug at runtime. */
  docName: string;
  /** Higher = matched before shorter overlapping phrases. */
  priority?: number;
}

export const ANCHOR_DICT: AnchorEntry[] = [
  // ── Real estate / rent ───────────────────────────────────────────────
  {
    phrases: ["договор за наем на жилище", "наем на жилище", "договор за наем на апартамент"],
    docName: "Договор за наем на жилище",
    priority: 10,
  },
  {
    phrases: ["договор за наем на офис", "наем на офис"],
    docName: "Договор за наем на офис",
    priority: 10,
  },
  {
    phrases: ["договор за наем на автомобил", "наем на автомобил", "наем на кола"],
    docName: "Договор за наем на автомобил",
    priority: 10,
  },
  {
    phrases: ["договор за краткосрочен наем", "airbnb договор"],
    docName: "Договор за краткосрочен наем (Airbnb тип)",
    priority: 10,
  },
  {
    phrases: ["приемо-предавателен протокол", "приемно-предавателен протокол", "предавателно-приемателен протокол"],
    docName: "Приемно-предавателен протокол",
    priority: 8,
  },
  {
    phrases: ["предизвестие за прекратяване на наем", "прекратяване на наем"],
    docName: "Предизвестие за прекратяване на наем",
    priority: 8,
  },
  {
    phrases: ["договор за наем"],
    docName: "Договор за наем на жилище",
    priority: 5,
  },

  // ── Employment ───────────────────────────────────────────────────────
  {
    phrases: ["трудов договор по чл. 67", "трудов договор чл. 67"],
    docName: "Трудов договор (чл. 67 КТ)",
    priority: 10,
  },
  {
    phrases: ["трудов договор", "договор за работа"],
    docName: "Трудов договор (чл. 67 КТ)",
    priority: 6,
  },
  {
    phrases: ["граждански договор", "договор за услуги", "договор за извънтрудови правоотношения"],
    docName: "Граждански договор / Договор за услуги",
    priority: 8,
  },

  // ── NDA / IP ─────────────────────────────────────────────────────────
  {
    phrases: ["nda", "договор за конфиденциалност", "споразумение за поверителност", "споразумение за конфиденциалност"],
    docName: "NDA – Договор за конфиденциалност",
    priority: 10,
  },
  {
    phrases: ["договор за прехвърляне на авторски права", "прехвърляне на авторски права"],
    docName: "Договор за прехвърляне на авторски права",
    priority: 9,
  },
  {
    phrases: ["лицензионен договор за търговска марка", "лиценз за търговска марка"],
    docName: "Лицензионен договор за търговска марка",
    priority: 9,
  },
  {
    phrases: ["договор за фотосесия", "model release"],
    docName: "Договор за фотосесия / Model Release",
    priority: 9,
  },
  {
    phrases: ["декларация по gdpr", "декларация за съгласие по gdpr", "съгласие за обработка на лични данни"],
    docName: "Декларация за съгласие по GDPR",
    priority: 9,
  },

  // ── Digital / IT ─────────────────────────────────────────────────────
  {
    phrases: [
      "договор за изработка на уебсайт",
      "договор за изработка на сайт",
      "договор за изработка на мобилно приложение",
      "договор за разработка на софтуер",
    ],
    docName: "Договор за изработка на уебсайт / мобилно приложение",
    priority: 9,
  },
  {
    phrases: ["договор за seo", "договор за дигитален маркетинг", "seo договор"],
    docName: "Договор за SEO и дигитален маркетинг",
    priority: 9,
  },
  {
    phrases: ["sla договор", "договор за поддръжка на софтуер", "договор за sla"],
    docName: "Договор за поддръжка на софтуер/хардуер (SLA)",
    priority: 9,
  },
  {
    phrases: ["eula", "лицензионен договор за софтуер"],
    docName: "Лицензионен договор за софтуер (EULA)",
    priority: 9,
  },
  {
    phrases: ["dpa", "data processing agreement", "договор за обработка на лични данни"],
    docName: "Data Processing Agreement (DPA по GDPR)",
    priority: 9,
  },
  {
    phrases: ["saas договор", "saas абонаментен договор"],
    docName: "SaaS абонаментен договор",
    priority: 9,
  },
  {
    phrases: ["договор за инфлуенсър", "инфлуенсър договор", "договор за инфлуенсър маркетинг"],
    docName: "Договор за инфлуенсър маркетинг",
    priority: 9,
  },

  // ── Sales / commerce ────────────────────────────────────────────────
  {
    phrases: ["договор за продажба на автомобил", "договор за покупко-продажба на автомобил", "договор за прехвърляне на автомобил", "договор за покупко-продажба на мпс"],
    docName: "Договор за покупко-продажба на МПС",
    priority: 9,
  },
  {
    phrases: ["договор за дарение", "договор за дарение на пари", "договор за дарение на движима вещ"],
    docName: "Договор за дарение",
    priority: 8,
  },
  {
    phrases: ["договор за заем", "договор за паричен заем", "договор за заем на парични средства"],
    docName: "Договор за заем на парични средства",
    priority: 8,
  },
  {
    phrases: ["договор за заем за послужване", "договор за заем на вещ"],
    docName: "Договор за заем за послужване",
    priority: 8,
  },
  {
    phrases: ["предварителен договор за покупка на имот", "предварителен договор за продажба на имот", "предварителен договор за имот"],
    docName: "Предварителен договор за покупка на имот",
    priority: 9,
  },

  // ── Business / corporate ────────────────────────────────────────────
  {
    phrases: ["договор за франчайз", "франчайз договор", "договор за франчайзинг"],
    docName: "Договор за франчайзинг (базов модел)",
    priority: 9,
  },
  {
    phrases: ["договор за изработка по зЗД", "договор за изработка по чл. 258", "договор за изработка"],
    docName: "Договор за изработка",
    priority: 7,
  },
  {
    phrases: ["договор за поръчка"],
    docName: "Договор за поръчка",
    priority: 7,
  },
  {
    phrases: ["ученически договор", "договор за стипендия"],
    docName: "Договор за стипендия",
    priority: 8,
  },

  // ── Family / civil ──────────────────────────────────────────────────
  {
    phrases: ["договор за гледане и издръжка"],
    docName: "Договор за гледане и издръжка",
    priority: 8,
  },

  // ── E-commerce / consumer ──────────────────────────────────────────
  {
    phrases: ["общи условия за онлайн магазин", "общи условия онлайн магазин", "общи условия на онлайн магазин"],
    docName: "Общи условия на онлайн магазин",
    priority: 9,
  },
  {
    phrases: ["политика за поверителност", "privacy policy шаблон", "политика за поверителност gdpr"],
    docName: "Политика за поверителност (GDPR)",
    priority: 8,
  },
  {
    phrases: ["политика за връщане", "формуляр за връщане на стока", "връщане на стока онлайн"],
    docName: "Политика за връщане и рекламация",
    priority: 8,
  },
];
