// "Избрани от Договори нет" — top 5 most-searched HR/admin blanks.
// Volumes from Semrush (BG database) — used as social proof badge on homepage.
// docName must match a CATALOG document exactly so templateIndex resolves the slug.

export interface FeaturedBlank {
  docName: string;
  shortLabel: string;       // shorter title for the card
  monthlySearches: number;  // Google monthly search volume (BG)
  snippet: string;          // 1-sentence preview
  legalRef?: string;        // legal article reference (small label)
}

export const FEATURED_BLANKS: FeaturedBlank[] = [
  {
    docName: "Молба за напускане (чл. 326, ал. 1 КТ)",
    shortLabel: "Молба за напускане",
    monthlySearches: 5400,
    snippet: "Готов образец на молба за прекратяване на трудов договор с 30-дневно предизвестие.",
    legalRef: "чл. 326, ал. 1 КТ",
  },
  {
    docName: "Молба за платен годишен отпуск",
    shortLabel: "Молба за платен отпуск",
    monthlySearches: 1600,
    snippet: "Заявление до работодател за ползване на платен годишен отпуск — попълни и свали.",
    legalRef: "чл. 155 КТ",
  },
  {
    docName: "Запис на заповед (образец)",
    shortLabel: "Запис на заповед",
    monthlySearches: 880,
    snippet: "Безусловно задължение за плащане на определена сума на падеж — с всички реквизити.",
    legalRef: "чл. 535 ТЗ",
  },
  {
    docName: "Нотариално заверено пълномощно (универсално)",
    shortLabel: "Нотариално пълномощно",
    monthlySearches: 590,
    snippet: "Универсален образец за нотариално заверено пълномощно — банкови и правни действия.",
  },
  {
    docName: "Разписка за получена сума",
    shortLabel: "Разписка за сума",
    monthlySearches: 590,
    snippet: "Кратка разписка за получена парична сума — за заем, наем, продажба или услуга.",
  },
];
