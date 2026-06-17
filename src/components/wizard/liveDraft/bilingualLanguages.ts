import { TITLE_EN, PARTY_ROLE_EN } from "./bilingualHelpers";

export type BilingualLang = "en" | "de" | "fr" | "ru" | "es" | "it";

export interface BilingualLangMeta {
  code: BilingualLang;
  label: string;
  short: string;
  flag: string;
}

export const BILINGUAL_LANGS: BilingualLangMeta[] = [
  { code: "en", label: "Английски",  short: "EN", flag: "🇬🇧" },
  { code: "de", label: "Немски",     short: "DE", flag: "🇩🇪" },
  { code: "fr", label: "Френски",    short: "FR", flag: "🇫🇷" },
  { code: "ru", label: "Руски",      short: "RU", flag: "🇷🇺" },
  { code: "es", label: "Испански",   short: "ES", flag: "🇪🇸" },
  { code: "it", label: "Италиански", short: "IT", flag: "🇮🇹" },
];

/** Translation of common headings. EN reuses the authoritative map. */
const TITLE_DE: Record<string, string> = {
  "Предмет на договора": "Vertragsgegenstand",
  "Предмет": "Gegenstand",
  "Срок на договора": "Vertragslaufzeit",
  "Срок": "Laufzeit",
  "Възнаграждение и плащане": "Vergütung und Zahlung",
  "Цена и плащане": "Preis und Zahlung",
  "Права и задължения на страните": "Rechte und Pflichten der Parteien",
  "Отговорност и неустойки": "Haftung und Vertragsstrafen",
  "Неустойки": "Vertragsstrafen",
  "Прекратяване": "Beendigung",
  "Конфиденциалност (NDA)": "Vertraulichkeit (NDA)",
  "Форсмажор (непреодолима сила)": "Höhere Gewalt",
  "Подсъдност": "Gerichtsstand",
  "Заключителни разпоредби": "Schlussbestimmungen",
};
const TITLE_FR: Record<string, string> = {
  "Предмет на договора": "Objet du contrat",
  "Предмет": "Objet",
  "Срок на договора": "Durée du contrat",
  "Срок": "Durée",
  "Възнаграждение и плащане": "Rémunération et paiement",
  "Цена и плащане": "Prix et paiement",
  "Права и задължения на страните": "Droits et obligations des parties",
  "Отговорност и неустойки": "Responsabilité et pénalités",
  "Неустойки": "Pénalités",
  "Прекратяване": "Résiliation",
  "Конфиденциалност (NDA)": "Confidentialité (NDA)",
  "Форсмажор (непреодолима сила)": "Force majeure",
  "Подсъдност": "Juridiction compétente",
  "Заключителни разпоредби": "Dispositions finales",
};
const TITLE_RU: Record<string, string> = {
  "Предмет на договора": "Предмет договора",
  "Предмет": "Предмет",
  "Срок на договора": "Срок действия договора",
  "Срок": "Срок",
  "Възнаграждение и плащане": "Вознаграждение и оплата",
  "Цена и плащане": "Цена и оплата",
  "Права и задължения на страните": "Права и обязанности сторон",
  "Отговорност и неустойки": "Ответственность и неустойки",
  "Неустойки": "Неустойки",
  "Прекратяване": "Расторжение",
  "Конфиденциалност (NDA)": "Конфиденциальность (NDA)",
  "Форсмажор (непреодолима сила)": "Форс-мажор",
  "Подсъдност": "Подсудность",
  "Заключителни разпоредби": "Заключительные положения",
};
const TITLE_ES: Record<string, string> = {
  "Предмет на договора": "Objeto del contrato",
  "Предмет": "Objeto",
  "Срок на договора": "Duración del contrato",
  "Срок": "Duración",
  "Възнаграждение и плащане": "Remuneración y pago",
  "Цена и плащане": "Precio y pago",
  "Права и задължения на страните": "Derechos y obligaciones de las partes",
  "Отговорност и неустойки": "Responsabilidad y penalizaciones",
  "Неустойки": "Penalizaciones",
  "Прекратяване": "Resolución",
  "Конфиденциалност (NDA)": "Confidencialidad (NDA)",
  "Форсмажор (непреодолима сила)": "Fuerza mayor",
  "Подсъдност": "Jurisdicción",
  "Заключителни разпоредби": "Disposiciones finales",
};
const TITLE_IT: Record<string, string> = {
  "Предмет на договора": "Oggetto del contratto",
  "Предмет": "Oggetto",
  "Срок на договора": "Durata del contratto",
  "Срок": "Durata",
  "Възнаграждение и плащане": "Compenso e pagamento",
  "Цена и плащане": "Prezzo e pagamento",
  "Права и задължения на страните": "Diritti e obblighi delle parti",
  "Отговорност и неустойки": "Responsabilità e penali",
  "Неустойки": "Penali",
  "Прекратяване": "Risoluzione",
  "Конфиденциалност (NDA)": "Riservatezza (NDA)",
  "Форсмажор (непреодолима сила)": "Forza maggiore",
  "Подсъдност": "Foro competente",
  "Заключителни разпоредби": "Disposizioni finali",
};

const TITLES: Record<BilingualLang, Record<string, string>> = {
  en: TITLE_EN, de: TITLE_DE, fr: TITLE_FR, ru: TITLE_RU, es: TITLE_ES, it: TITLE_IT,
};

const ROLES: Record<BilingualLang, Record<string, string>> = {
  en: PARTY_ROLE_EN,
  de: {
    "Възложител": "Auftraggeber", "Изпълнител": "Auftragnehmer",
    "Наемодател": "Vermieter", "Наемател": "Mieter",
    "Продавач": "Verkäufer", "Купувач": "Käufer",
    "Работодател": "Arbeitgeber", "Служител": "Arbeitnehmer",
    "Заемодател": "Darlehensgeber", "Заемополучател": "Darlehensnehmer",
    "Упълномощител": "Vollmachtgeber", "Пълномощник": "Bevollmächtigter",
    "Страна А": "Partei A", "Страна Б": "Partei B",
  },
  fr: {
    "Възложител": "Donneur d'ordre", "Изпълнител": "Prestataire",
    "Наемодател": "Bailleur", "Наемател": "Locataire",
    "Продавач": "Vendeur", "Купувач": "Acheteur",
    "Работодател": "Employeur", "Служител": "Salarié",
    "Заемодател": "Prêteur", "Заемополучател": "Emprunteur",
    "Упълномощител": "Mandant", "Пълномощник": "Mandataire",
    "Страна А": "Partie A", "Страна Б": "Partie B",
  },
  ru: {
    "Възложител": "Заказчик", "Изпълнител": "Исполнитель",
    "Наемодател": "Арендодатель", "Наемател": "Арендатор",
    "Продавач": "Продавец", "Купувач": "Покупатель",
    "Работодател": "Работодатель", "Служител": "Работник",
    "Заемодател": "Займодавец", "Заемополучател": "Заёмщик",
    "Упълномощител": "Доверитель", "Пълномощник": "Поверенный",
    "Страна А": "Сторона А", "Страна Б": "Сторона Б",
  },
  es: {
    "Възложител": "Comitente", "Изпълнител": "Contratista",
    "Наемодател": "Arrendador", "Наемател": "Arrendatario",
    "Продавач": "Vendedor", "Купувач": "Comprador",
    "Работодател": "Empleador", "Служител": "Empleado",
    "Заемодател": "Prestamista", "Заемополучател": "Prestatario",
    "Упълномощител": "Poderdante", "Пълномощник": "Apoderado",
    "Страна А": "Parte A", "Страна Б": "Parte B",
  },
  it: {
    "Възложител": "Committente", "Изпълнител": "Appaltatore",
    "Наемодател": "Locatore", "Наемател": "Conduttore",
    "Продавач": "Venditore", "Купувач": "Acquirente",
    "Работодател": "Datore di lavoro", "Служител": "Lavoratore",
    "Заемодател": "Mutuante", "Заемополучател": "Mutuatario",
    "Упълномощител": "Mandante", "Пълномощник": "Procuratore",
    "Страна А": "Parte A", "Страна Б": "Parte B",
  },
};

interface PreambleStrings {
  todayInBetween: (date: string, city: string) => string;
  hereinafter: string;
  and: string;
  enteredAsFollows: string;
  placeholder: string;
  previewNote: (docTitle: string, fromTemplate: boolean) => string;
  previewNoteSub: string;
  finalNote: string;
  answered: (n: number) => string;
  paperLabel: string;
  selectorLabel: string;
}

export const STRINGS: Record<BilingualLang, PreambleStrings> = {
  en: {
    todayInBetween: (d, c) => `Today, ${d}, in ${c}, between:`,
    hereinafter: "hereinafter",
    and: "and",
    enteredAsFollows: "have entered into this Agreement as follows:",
    placeholder: "The parallel English text will be inserted alongside the Bulgarian section in the final bilingual document.",
    previewNote: (t, f) => `Bilingual preview of "${t}" — Bulgarian ${f ? "template text" : "skeleton"} on the left, parallel English translation on the right.`,
    previewNoteSub: "The final document is generated with full parallel English (BG / EN) legal clauses and a two-column PDF/DOCX export.",
    finalNote: "Final document",
    answered: (n) => `${n} answers completed.`,
    paperLabel: "EN",
    selectorLabel: "Език на превода",
  },
  de: {
    todayInBetween: (d, c) => `Heute, am ${d}, in ${c}, zwischen:`,
    hereinafter: "nachstehend",
    and: "und",
    enteredAsFollows: "haben den folgenden Vertrag geschlossen:",
    placeholder: "Der parallele deutsche Text wird im endgültigen zweisprachigen Dokument neben dem bulgarischen Abschnitt eingefügt.",
    previewNote: (t, f) => `Zweisprachige Vorschau von „${t}" — bulgarischer ${f ? "Vorlagentext" : "Entwurf"} links, paralleler deutscher Text rechts.`,
    previewNoteSub: "Das endgültige Dokument wird mit vollständigen parallelen deutschen Klauseln und zweispaltigem PDF-/DOCX-Export erstellt.",
    finalNote: "Endgültiges Dokument",
    answered: (n) => `${n} Antworten ausgefüllt.`,
    paperLabel: "DE",
    selectorLabel: "Език на превода",
  },
  fr: {
    todayInBetween: (d, c) => `Aujourd'hui, le ${d}, à ${c}, entre :`,
    hereinafter: "ci-après",
    and: "et",
    enteredAsFollows: "ont conclu le présent contrat aux conditions suivantes :",
    placeholder: "Le texte français parallèle sera inséré à côté de la section bulgare dans le document bilingue final.",
    previewNote: (t, f) => `Aperçu bilingue de « ${t} » — ${f ? "texte du modèle" : "squelette"} bulgare à gauche, traduction française parallèle à droite.`,
    previewNoteSub: "Le document final est généré avec des clauses françaises parallèles complètes et un export PDF/DOCX en deux colonnes.",
    finalNote: "Document final",
    answered: (n) => `${n} réponses complétées.`,
    paperLabel: "FR",
    selectorLabel: "Език на превода",
  },
  ru: {
    todayInBetween: (d, c) => `Сегодня, ${d}, в г. ${c}, между:`,
    hereinafter: "именуемый в дальнейшем",
    and: "и",
    enteredAsFollows: "заключили настоящий договор о нижеследующем:",
    placeholder: "Параллельный русский текст будет вставлен рядом с болгарским разделом в итоговом двуязычном документе.",
    previewNote: (t, f) => `Двуязычный предпросмотр «${t}» — болгарский ${f ? "текст шаблона" : "каркас"} слева, параллельный русский перевод справа.`,
    previewNoteSub: "Итоговый документ формируется с полными параллельными русскоязычными правовыми пунктами и двухколоночным экспортом в PDF/DOCX.",
    finalNote: "Итоговый документ",
    answered: (n) => `Заполнено ответов: ${n}.`,
    paperLabel: "RU",
    selectorLabel: "Език на превода",
  },
  es: {
    todayInBetween: (d, c) => `Hoy, ${d}, en ${c}, entre:`,
    hereinafter: "en lo sucesivo",
    and: "y",
    enteredAsFollows: "han celebrado el presente contrato en los siguientes términos:",
    placeholder: "El texto paralelo en español se insertará junto a la sección búlgara en el documento bilingüe final.",
    previewNote: (t, f) => `Vista previa bilingüe de «${t}» — ${f ? "texto de la plantilla" : "estructura"} en búlgaro a la izquierda, traducción paralela al español a la derecha.`,
    previewNoteSub: "El documento final se genera con cláusulas paralelas completas en español y exportación a PDF/DOCX a dos columnas.",
    finalNote: "Documento final",
    answered: (n) => `${n} respuestas completadas.`,
    paperLabel: "ES",
    selectorLabel: "Език на превода",
  },
  it: {
    todayInBetween: (d, c) => `Oggi, ${d}, in ${c}, tra:`,
    hereinafter: "di seguito",
    and: "e",
    enteredAsFollows: "hanno stipulato il presente contratto alle seguenti condizioni:",
    placeholder: "Il testo italiano parallelo sarà inserito accanto alla sezione bulgara nel documento bilingue finale.",
    previewNote: (t, f) => `Anteprima bilingue di «${t}» — ${f ? "testo del modello" : "struttura"} bulgaro a sinistra, traduzione italiana parallela a destra.`,
    previewNoteSub: "Il documento finale viene generato con clausole italiane parallele complete ed esportazione PDF/DOCX a due colonne.",
    finalNote: "Documento finale",
    answered: (n) => `${n} risposte completate.`,
    paperLabel: "IT",
    selectorLabel: "Език на превода",
  },
};

export function translateTitle(title: string, lang: BilingualLang): string {
  const trimmed = title.trim();
  const map = TITLES[lang];
  if (map[trimmed]) return map[trimmed];
  const stripped = trimmed.replace(/^([IVXLCM]+\.\s*|Чл\.\s*\d+\.\s*)/i, "").trim();
  if (map[stripped]) return map[stripped];
  // Fallback to English if available, otherwise original.
  if (lang !== "en") {
    if (TITLE_EN[trimmed]) return TITLE_EN[trimmed];
    if (TITLE_EN[stripped]) return TITLE_EN[stripped];
  }
  return trimmed;
}

export function translateRole(role: string, lang: BilingualLang): string {
  return ROLES[lang][role.trim()] || PARTY_ROLE_EN[role.trim()] || role;
}

export function renderPartyIdentifierLang(type: string | undefined, lang: BilingualLang): string {
  if (!type) return "";
  const t = type.toLowerCase();
  // Reuse the existing English wording for all non-Bulgarian languages —
  // identifier placeholders ([........]) are language-agnostic; only the
  // surrounding label changes per language.
  const labels: Record<BilingualLang, { person: string; et: string; legal: string; vat: string; repBy: string }> = {
    en: { person: "Personal ID", et: "Company ID", legal: "Company ID", vat: "VAT No", repBy: "represented by [Authorised Person]" },
    de: { person: "Pers.-Nr.",   et: "Handelsreg.-Nr.", legal: "Handelsreg.-Nr.", vat: "USt-IdNr.", repBy: "vertreten durch [Bevollmächtigter]" },
    fr: { person: "N° d'identité", et: "N° d'entreprise", legal: "N° d'entreprise", vat: "N° TVA", repBy: "représenté par [personne autorisée]" },
    ru: { person: "Личный №",     et: "ОГРН/ИНН",        legal: "ОГРН/ИНН",        vat: "НДС №",   repBy: "в лице [уполномоченное лицо]" },
    es: { person: "DNI/NIE",      et: "CIF",             legal: "CIF",             vat: "NIF/IVA", repBy: "representado por [persona autorizada]" },
    it: { person: "Cod. Fisc.",   et: "P. IVA",          legal: "P. IVA",          vat: "P. IVA",  repBy: "rappresentato da [persona autorizzata]" },
  };
  const L = labels[lang];
  if (t.includes("физическо")) return `, ${L.person} [........]`;
  if (t.includes("ет") || t.includes("самоосигуряващо")) return `, ${L.et} [........], ${L.repBy}`;
  if (t.includes("юридическо")) return `, ${L.legal} [........], ${L.repBy}, ${L.vat} [........]`;
  return ` — ${type}`;
}
