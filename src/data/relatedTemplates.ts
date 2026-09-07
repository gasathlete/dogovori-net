// Cross-linking map for `/shablon/:slug` pages.
// Curates which other templates and blog posts a user typically needs next.
// Used to render a "Може да Ви потрябва още" + "Прочетете повече" sections.
//
// Keys are TEMPLATE slugs (from src/lib/templateIndex). Values reference
// other template slugs and blog slugs (from src/content/blog).
//
// Falls back to nothing if a slug is absent — safe to extend incrementally.

export interface RelatedEntry {
  /** Companion templates (long BG anchor + slug). */
  templates?: { anchor: string; slug: string }[];
  /** Relevant deep-dive blog posts. */
  blogPosts?: string[];
}

export const RELATED_TEMPLATES: Record<string, RelatedEntry> = {
  "dogovor-za-naem-na-zhilishte": {
    templates: [
      { anchor: "Приемно-предавателен протокол при настаняване в имот", slug: "priemo-predavatelen-protokol" },
      { anchor: "Предизвестие за прекратяване на договор за наем", slug: "predizvestie-za-prekratyavane-na-naem" },
      { anchor: "Разписка за получена сума (депозит по наем)", slug: "razpiska-za-poluchena-suma-naem-depozit" },
      { anchor: "Двуезичен договор за наем (BG/EN) за чужденци", slug: "dvuezichen-dogovor-za-naem-bg-en-za-chuzhdentsi" },
    ],
    blogPosts: ["kak-da-napravim-dogovor-za-naem", "kak-da-prekratim-dogovor-za-naem"],
  },
  "trudov-dogovor-chl-67-kt": {
    templates: [
      { anchor: "Граждански договор за услуги — алтернатива на трудовия", slug: "grazhdanski-dogovor-dogovor-za-uslugi" },
    ],
    blogPosts: [
      "trudov-dogovor-osnovni-elementi",
      "grazhdanski-dogovor-vs-trudov-dogovor",
      "predizvestie-uvolnenie",
    ],
  },
  "grazhdanski-dogovor-dogovor-za-uslugi": {
    templates: [
      { anchor: "Трудов договор по чл. 67 КТ — образец", slug: "trudov-dogovor-chl-67-kt" },
    ],
    blogPosts: ["grazhdanski-dogovor-vs-trudov-dogovor", "ddt-i-dogovor-grazhdanski"],
  },
  "nda-dogovor-za-konfidentsialnost": {
    blogPosts: ["nda-spogodba-za-poveritelnost", "gdpr-za-malki-firmi"],
  },
  "dogovor-za-izrabotka-na-uebsayt-mobilno-prilozhenie": {
    blogPosts: ["dogovor-za-uslugi-mezhdu-firmi", "dogovor-za-izrabotka-zzd"],
  },
};
