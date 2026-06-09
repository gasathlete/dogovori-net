// Classification layer applied BEFORE any AI call.
// Detects personal data and special-category data, and returns the routing
// envelope the model-router uses.

export type RiskLevel = "low" | "medium" | "high" | "blocked";

export interface Classification {
  risk_level: RiskLevel;
  contains_personal_data: boolean;
  contains_special_category_data: boolean;
  redaction_required: boolean;
  user_confirmation_required: boolean;
  allowed_models: string[];
  reasons: string[];
  pii_counts: {
    egn: number;
    iban: number;
    email: number;
    phone: number;
    id_card: number;
    address: number;
    name: number;
  };
}

const EMAIL_RE = /\b[\w.+\-]+@[\w-]+\.[\w.-]+\b/gi;
const PHONE_RE = /(?:\+?359|0)\s*[\d\s\-()]{7,15}/g;
const EGN_RE = /\b\d{10}\b/g;
const IBAN_RE = /\bBG\d{2}[A-Z]{4}\d{14,20}\b/gi;
const ID_CARD_RE = /\b(?:лична\s*карта|л\.?к\.?|ид\.?\s*№)\s*[:№]?\s*\d{6,12}\b/gi;
const ADDRESS_RE = /\b(?:гр\.|град|с\.|село|ул\.|улица|бул\.|булевард|ж\.к\.|кв\.)\s+[А-ЯA-Z][^\n,.;]{2,80}/g;
const NAME_RE =
  /\b([А-ЯA-Z][а-яa-z]{1,20})\s+([А-ЯA-Z][а-яa-z]{1,20})(?:\s+([А-ЯA-Z][а-яa-z]{1,20}))?\b/g;

const NAME_STOPWORDS = new Set([
  "Република","България","София","Пловдив","Варна","Бургас","Русе",
  "Чл","Член","Алинея","Точка","Глава","Раздел",
  "Договор","Страна","Страните","Възложител","Изпълнител",
  "Купувач","Продавач","Наемател","Наемодател",
  "Закон","Кодекс","Регламент","Директива",
  "Настоящият","Настоящата","Настоящото",
]);

// Special-category keywords (GDPR Art. 9 + children data).
// Order matters only for `reasons` ordering.
const SPECIAL_CATEGORY_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(ТЕЛК|НЕЛК|ЕР\s*на\s*ТЕЛК)\b/i, label: "health_disability" },
  { pattern: /\b(болничен\s*лист|временна\s*неработоспособност)\b/i, label: "health_sickleave" },
  { pattern: /\b(диагноза|МКБ[-\s]?10|заболяване|епикриза|медицинско\s*досие)\b/i, label: "health_diagnosis" },
  { pattern: /\b(ХИВ|HIV|СПИН|AIDS|хепатит\s*[ABC]|туберкулоза|онкологичн)\b/i, label: "health_specific" },
  { pattern: /\b(инвалидност|степен\s*на\s*увреждане|хора\s*с\s*увреждания)\b/i, label: "health_disability" },
  { pattern: /\b(синдикат|синдикален|синдикално\s*членство)\b/i, label: "trade_union" },
  { pattern: /\b(вероизповедание|религия|християнин|мюсюлманин|евреин|будист)\b/i, label: "religion" },
  { pattern: /\b(политическа\s*партия|политически\s*убеждения|политическа\s*принадлежност)\b/i, label: "political" },
  { pattern: /\b(етнос|етническа\s*принадлежност|раса|расова)\b/i, label: "racial_ethnic" },
  { pattern: /\b(сексуална\s*ориентация|сексуален\s*живот|LGBT|ЛГБТ)\b/i, label: "sexual_orientation" },
  { pattern: /\b(биометрични?\s*данни|пръстов\s*отпечатък|лицево\s*разпознаване|ДНК|генетичн)\b/i, label: "biometric_genetic" },
  { pattern: /\b(непълнолетн|малолетн|дете\s*на\s*възраст|родителски\s*права|акт\s*за\s*раждане)\b/i, label: "minor" },
];

export function classifyDocumentBeforeAI(input: string): Classification {
  const text = String(input ?? "");
  const reasons: string[] = [];

  // PII counts (deduped by occurrence count, not by unique value).
  const counts = {
    egn: (text.match(EGN_RE) ?? []).length,
    iban: (text.match(IBAN_RE) ?? []).length,
    email: (text.match(EMAIL_RE) ?? []).length,
    phone: (text.match(PHONE_RE) ?? []).length,
    id_card: (text.match(ID_CARD_RE) ?? []).length,
    address: (text.match(ADDRESS_RE) ?? []).length,
    name: 0,
  };

  // Name detection requires filtering stopwords.
  let nameCount = 0;
  text.replace(NAME_RE, (_m, a: string, b: string, c?: string) => {
    if (NAME_STOPWORDS.has(a) || NAME_STOPWORDS.has(b) || (c && NAME_STOPWORDS.has(c))) return _m;
    nameCount++;
    return _m;
  });
  counts.name = nameCount;

  const contains_personal_data =
    counts.egn + counts.iban + counts.email + counts.phone + counts.id_card + counts.address + counts.name > 0;

  if (counts.egn > 0) reasons.push(`egn:${counts.egn}`);
  if (counts.iban > 0) reasons.push(`iban:${counts.iban}`);
  if (counts.id_card > 0) reasons.push(`id_card:${counts.id_card}`);
  if (counts.email > 0) reasons.push(`email:${counts.email}`);
  if (counts.phone > 0) reasons.push(`phone:${counts.phone}`);
  if (counts.address > 0) reasons.push(`address:${counts.address}`);
  if (counts.name > 0) reasons.push(`name:${counts.name}`);

  // Special-category scan.
  const specialHits: string[] = [];
  for (const { pattern, label } of SPECIAL_CATEGORY_PATTERNS) {
    if (pattern.test(text)) {
      specialHits.push(label);
      reasons.push(`special:${label}`);
    }
  }
  const contains_special_category_data = specialHits.length > 0;

  // Risk level rules:
  //  - special category => high (UI can choose to block per operation policy)
  //  - EGN / ID card / IBAN / 3+ names => high
  //  - any PII => medium
  //  - none => low
  let risk_level: RiskLevel = "low";
  if (contains_special_category_data) risk_level = "high";
  else if (counts.egn > 0 || counts.id_card > 0 || counts.iban > 0 || counts.name >= 3) risk_level = "high";
  else if (contains_personal_data) risk_level = "medium";

  const redaction_required = risk_level !== "low";
  const user_confirmation_required = risk_level === "high";

  // Allowed models by risk:
  //   low    => all
  //   medium => flash-lite, flash
  //   high   => flash-lite ONLY (after redaction); special category may be blocked by router
  //   blocked => []
  let allowed_models: string[];
  switch (risk_level) {
    case "blocked":
      allowed_models = [];
      break;
    case "high":
      allowed_models = ["google/gemini-2.5-flash-lite"];
      break;
    case "medium":
      allowed_models = ["google/gemini-2.5-flash-lite", "google/gemini-2.5-flash"];
      break;
    case "low":
    default:
      allowed_models = [
        "google/gemini-2.5-flash-lite",
        "google/gemini-2.5-flash",
        "google/gemini-2.5-pro",
      ];
  }

  return {
    risk_level,
    contains_personal_data,
    contains_special_category_data,
    redaction_required,
    user_confirmation_required,
    allowed_models,
    reasons,
    pii_counts: counts,
  };
}
