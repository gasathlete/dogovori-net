/**
 * Регистър на действително прочетените правни източници.
 *
 * „user_reported_read“ означава: потребителят съобщи, че е прочел посочените членове
 * на посочената дата и е предоставил адреса. Това НЕ е правно одобрение на
 * шаблон и не потвърждава членове извън `articles`.
 */
export type SourceStatus = "user_reported_read" | "access_failed";

export interface LegalSource {
  id: string;
  title: string;
  url: string;
  status: SourceStatus;
  readOn: string;
  /** Членове, прочетени по този източник. Всичко друго остава непроверено. */
  articles: readonly string[];
  caveats: readonly string[];
}

export const LEGAL_SOURCES: readonly LegalSource[] = [
  {
    id: "zzd-kik-2026-10-19",
    title: "ЗЗД — консолидиран текст (kik-info.com)",
    url: "https://kik-info.com/normativna-baza/zakoni/zzd/",
    status: "user_reported_read", readOn: "2026-10-19",
    articles: ["ЗЗД 20а", "ЗЗД 87", "ЗЗД 228", "ЗЗД 229", "ЗЗД 230", "ЗЗД 231", "ЗЗД 232", "ЗЗД 233", "ЗЗД 234", "ЗЗД 235", "ЗЗД 236", "ЗЗД 237", "ЗЗД 238"],
    caveats: ["Неофициален консолидиран текст."],
  },
  {
    id: "tz-kik-2026-10-19",
    title: "Търговски закон — консолидиран текст (kik-info.com)",
    url: "https://kik-info.com/normativna-baza/kodeksi/tz/",
    status: "user_reported_read", readOn: "2026-10-19",
    articles: ["ТЗ 113", "ТЗ 114", "ТЗ 115", "ТЗ 117"],
    caveats: ["Последно отбелязано изменение ДВ бр. 69/31.07.2026.", "Съдържа бъдещи текстове — преценяват се поотделно, не се приемат за действащи."],
  },
  {
    id: "tz-mi-apis-2026-07-31",
    title: "Търговски закон — консолидиран текст, Министерство на икономиката (АПИС)",
    url: "https://www.mi.government.bg/file/2011/08/targovski_zakon_31.07.2026.pdf",
    status: "user_reported_read", readOn: "2026-10-19",
    articles: ["ТЗ 113", "ТЗ 114", "ТЗ 115", "ТЗ 117"],
    caveats: ["Включва бъдещи изменения в сила от 02.04.2027 — НЕ се приемат за действащи."],
  },
  {
    id: "bnb-q189-2026-10-19",
    title: "БНБ — въпроси и отговори за еврото, въпрос 189",
    url: "https://bnb.bg/AboutUs/AUEurosystem/AUAccessionToTheEuroArea/AUAEFIQuestionsAndAnswers/POAEFI_QUESTIONSANDANS11_BG",
    status: "user_reported_read", readOn: "2026-10-19",
    articles: ["ТЗ 117 (1 евро капитал / 1 евроцент дял)"],
    caveats: ["Официално разяснение, не нормативен акт."],
  },
  {
    id: "kt-mlsp-2026-09-29",
    title: "Кодекс на труда — PDF на МТСП (изменения до ДВ бр. 89/29.09.2026)",
    url: "https://www.mlsp.government.bg/uploads/37/politiki/trud/zakonodatelstvo/2026/kt-0926.pdf",
    status: "user_reported_read", readOn: "2026-10-19",
    articles: ["КТ 325 ал. 1 т. 1", "КТ 326 ал. 1", "КТ 326 ал. 2", "КТ 326 ал. 3", "КТ 326 ал. 4", "КТ 160 ал. 1", "КТ 160 ал. 2", "КТ 160 ал. 3", "КТ 173 ал. 1"],
    caveats: [
      "Прочетено от ChatGPT по указание на 19.10.2026 — не от собственика и не е юридическо одобрение.",
      "Входна страница: https://www.mlsp.government.bg/zakonodatelstvo. Страници в PDF: чл. 325 — 104, чл. 326 — 105, чл. 160 — 63, чл. 173 — 72.",
      "Прочетени са само изброените алинеи; другите членове на КТ остават непроверени.",
      "Чл. 160 не се използва за данъчни или осигурителни изводи.",
    ],
  },
  {
    id: "eurlex-gdpr-2026-10-19",
    title: "Регламент (ЕС) 2016/679 — EUR-Lex",
    url: "https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=bg",
    status: "access_failed", readOn: "2026-10-19",
    articles: [],
    caveats: ["Страницата беше блокирана (JS/anti-bot). Резултат от търсачка не е прочитане."],
  },
  {
    id: "justice-gov-2026-10-19",
    title: "Правно-информационна система justice.government.bg",
    url: "https://justice.government.bg/",
    status: "access_failed", readOn: "2026-10-19",
    articles: [],
    caveats: ["HTTP 502 в тази сесия — не е извършена проверка."],
  },
];

export function sourceById(id: string): LegalSource | undefined {
  return LEGAL_SOURCES.find((s) => s.id === id);
}

/** Членът е покрит само ако поне един user_reported_read източник го изброява. */
export function sourcesCovering(article: string): LegalSource[] {
  return LEGAL_SOURCES.filter((s) => s.status === "user_reported_read" && s.articles.includes(article));
}

/** Официални образци, открити, но НЕ прочетени изцяло. Не са собствени бланки и не са проверени. */
export interface OfficialFormProvenance {
  id: string;
  title: string;
  pageUrl: string;
  fileUrl: string;
  seenOn: string;
  status: "partially_read_unverified";
  readScope: string;
  notes: readonly string[];
}

export const OFFICIAL_FORMS: readonly OfficialFormProvenance[] = [
  {
    id: "gpk-410-form-2025-07-01",
    title: "Заявление за издаване на заповед за изпълнение по чл. 410 ГПК — Приложение № 1 към чл. 3 (8 страници)",
    pageUrl: "https://kotel-rs.justice.bg/bg/7849",
    fileUrl: "https://kotel-rs.justice.bg/upload/125181/410.pdf",
    seenOn: "2026-10-19",
    status: "partially_read_unverified",
    readScope: "Само заглавието и първите полета. Целият формуляр не е прочетен.",
    notes: [
      "Страницата различава стария образец (до 30.06.2025) от новия (от 01.07.2025).",
      "Не се преразказва и не се предлага като собствена бланка; потребителят се насочва към официалния файл.",
    ],
  },
];
