// Curated "Често търсени" links per category — long descriptive BG anchors
// pointing at specific templates. Shown on `/kategoria/:id` to give Google
// rich contextual internal links beyond plain template names.
//
// Each entry's docName must match a CATALOG document exactly; slug is
// resolved via templateIndex at runtime.

export interface HotLink {
  anchor: string;     // visible link text (long BG phrase)
  docName: string;    // canonical name from CATALOG
}

export const CATEGORY_HOT_LINKS: Record<string, HotLink[]> = {
  naem: [
    { anchor: "Безплатен образец на договор за наем на апартамент 2026", docName: "Договор за наем на жилище" },
    { anchor: "Договор за наем на офис помещение — готов шаблон", docName: "Договор за наем на офис" },
    { anchor: "Краткосрочен наем (Airbnb) — договор на български", docName: "Договор за краткосрочен наем (Airbnb тип)" },
    { anchor: "Приемно-предавателен протокол при наем на жилище", docName: "Приемно-предавателен протокол" },
    { anchor: "Предизвестие за прекратяване на договор за наем", docName: "Предизвестие за прекратяване на наем" },
    { anchor: "Двуезичен договор за наем (BG/EN) за чужденци", docName: "Двуезичен договор за наем (BG/EN) за чужденци" },
  ],
  trudovi: [
    { anchor: "Трудов договор по чл. 67 КТ — образец 2026", docName: "Трудов договор (чл. 67 КТ)" },
    { anchor: "Граждански договор за услуги — готов шаблон", docName: "Граждански договор / Договор за услуги" },
  ],
  digital: [
    { anchor: "Договор за изработка на уебсайт или мобилно приложение", docName: "Договор за изработка на уебсайт / мобилно приложение" },
    { anchor: "SaaS абонаментен договор на български", docName: "SaaS абонаментен договор" },
    { anchor: "SLA договор за поддръжка на софтуер", docName: "Договор за поддръжка на софтуер/хардуер (SLA)" },
    { anchor: "Договор за инфлуенсър маркетинг — шаблон", docName: "Договор за инфлуенсър маркетинг" },
    { anchor: "EULA — лицензионен договор за софтуер", docName: "Лицензионен договор за софтуер (EULA)" },
  ],
  ip: [
    { anchor: "NDA — договор за конфиденциалност на български", docName: "NDA – Договор за конфиденциалност" },
    { anchor: "Договор за прехвърляне на авторски права", docName: "Договор за прехвърляне на авторски права" },
    { anchor: "Декларация за съгласие по GDPR — готов шаблон", docName: "Декларация за съгласие по GDPR" },
    { anchor: "Лицензионен договор за търговска марка", docName: "Лицензионен договор за търговска марка" },
  ],
  uslugi: [
    { anchor: "Граждански договор за услуги — попълни онлайн", docName: "Граждански договор / Договор за услуги" },
  ],
};
