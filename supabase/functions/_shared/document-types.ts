// Type-specific prompts/structures for the universal "build" generator.
// Used by build-custom-contract edge function.

export type DocumentTypeId =
  | "contract" | "receipt" | "power_of_attorney" | "declaration"
  | "complaint" | "claim" | "notary_invitation"
  | "offer" | "invoice" | "protocol"
  | "appendix" | "annex" | "agreement"
  | "smr" | "kss";

export interface DocumentTypeSpec {
  id: DocumentTypeId;
  label: string;
  partyAName: string;
  partyBName: string;
  /** Extra system instructions inserted after the base system prompt */
  systemAddendum: string;
}

const T: Record<DocumentTypeId, DocumentTypeSpec> = {
  contract: {
    id: "contract", label: "Договор",
    partyAName: "Възложител", partyBName: "Изпълнител",
    systemAddendum: "Това е двустранен договор по ЗЗД/ТЗ. Включи всички задължителни клаузи: Предмет, Цена, Срокове, Права и задължения, Неустойки, Прекратяване, Форсмажор, Конфиденциалност (при нужда), Подсъдност (СГС/Арбитраж БТПП), Частична недействителност, Заключителни.",
  },
  agreement: {
    id: "agreement", label: "Споразумение",
    partyAName: "Страна А", partyBName: "Страна Б",
    systemAddendum: "Изготви споразумение с уредени взаимни ангажименти, срокове, последици при неизпълнение и приложимо право.",
  },
  appendix: {
    id: "appendix", label: "Приложение",
    partyAName: "Възложител", partyBName: "Изпълнител",
    systemAddendum: "Изготви ПРИЛОЖЕНИЕ към основен договор. Започни с „ПРИЛОЖЕНИЕ № [N] към Договор от [дата]“. Структурата e: Предмет на приложението, Технически/съдържателни параметри, Срок/график, Цена (ако приложимо), Подписи. Препрати към основния договор по чл./раздели.",
  },
  annex: {
    id: "annex", label: "Анекс",
    partyAName: "Възложител", partyBName: "Изпълнител",
    systemAddendum: "Изготви АНЕКС към съществуващ договор. Започни с „АНЕКС № [N] към Договор от [дата]“. Конкретно посочи кои клаузи се изменят/добавят/отменят и от коя дата влиза в сила. Запази правната рамка на основния договор.",
  },
  protocol: {
    id: "protocol", label: "Протокол",
    partyAName: "Възложител", partyBName: "Изпълнител",
    systemAddendum: "Изготви ПРОТОКОЛ (приемо-предавателен / констативен). Раздели: Място и дата, Страни, Обект, Констатации, Недостатъци (ако има), Приемане/Отказ, Подписи.",
  },
  receipt: {
    id: "receipt", label: "Разписка",
    partyAName: "Получател", partyBName: "Платец/Предаващ",
    systemAddendum: "Изготви РАЗПИСКА. Едностранен документ от Получателя, че е получил конкретна сума/вещ от Предаващия. Кратък формат: данни на страните (ЕГН/ЕИК), предмет (сума в евро или вещ), основание, дата, място, подпис на Получателя. Без сложна правна структура.",
  },
  power_of_attorney: {
    id: "power_of_attorney", label: "Пълномощно",
    partyAName: "Упълномощител", partyBName: "Пълномощник",
    systemAddendum: "Изготви ПЪЛНОМОЩНО. Структура: Данни на Упълномощителя (ЕГН/адрес), Данни на Пълномощника (ЕГН/адрес), Обем на представителната власт (конкретни действия), Срок, Заместване (с/без право), Дата и подпис. Ако действията изискват нотариална заверка (разпореждане с имот, представителство пред нотариус), посочи изрично.",
  },
  declaration: {
    id: "declaration", label: "Декларация",
    partyAName: "Декларатор", partyBName: "",
    systemAddendum: "Изготви ДЕКЛАРАЦИЯ. Едностранен документ. Структура: Данни на Декларатора, Деклариращ текст („Долуподписаният... декларирам, че...“), Правно основание (ако е по чл. от закон), Известна ми е наказателната отговорност по чл. 313 НК (когато е приложимо), Дата, Подпис.",
  },
  complaint: {
    id: "complaint", label: "Жалба",
    partyAName: "Жалбоподател", partyBName: "Ответна страна",
    systemAddendum: "Изготви ЖАЛБА до институция/съд. Структура: До [орган], От [жалбоподател с адрес], Срещу [ответник], Относно, Фактическа обстановка, Правни доводи (с препратки към закона), Искане („моля да...“), Приложения, Дата, Подпис.",
  },
  claim: {
    id: "claim", label: "Искова молба",
    partyAName: "Ищец", partyBName: "Ответник",
    systemAddendum: "Изготви ИСКОВА МОЛБА по ГПК. Структура: До [компетентен съд], Ищец, Ответник, Цена на иска, Правно основание, Обстоятелства, Доказателства, Петитум, Приложения, Държавна такса.",
  },
  notary_invitation: {
    id: "notary_invitation", label: "Нотариална покана",
    partyAName: "Канещ", partyBName: "Канен",
    systemAddendum: "Изготви НОТАРИАЛНА ПОКАНА по чл. 50 ЗННД. Структура: Канещ (имена, адрес, ЕГН/ЕИК), Канен, Основание (договор/правоотношение), Конкретно искане/претенция със срок, Последици при неизпълнение, Дата.",
  },
  offer: {
    id: "offer", label: "Оферта",
    partyAName: "Оферент", partyBName: "Получател",
    systemAddendum: "Изготви ОФЕРТА. Структура: Издател (фирмени данни), Получател, Предмет, Спецификации, Цена (в евро) с/без ДДС, Срок на валидност, Срок и условия на изпълнение, Начин на плащане, Подпис.",
  },
  invoice: {
    id: "invoice", label: "Фактура",
    partyAName: "Получател", partyBName: "Доставчик",
    systemAddendum: "Изготви ФАКТУРА (данъчна/проформа). Структура: №, Дата, Доставчик (фирма, ЕИК/ДДС№, МОЛ, адрес), Получател (същите данни), Таблица с артикули (описание, мярка, к-во, ед.цена, обща сума), Сума без ДДС, ДДС 20%, Обща сума с ДДС, Начин на плащане, Дата на ДДС събитие, Подписи.",
  },
  smr: {
    id: "smr", label: "СМР",
    partyAName: "Възложител", partyBName: "Изпълнител",
    systemAddendum: "Изготви документ за СТРОИТЕЛНО-МОНТАЖНИ РАБОТИ (СМР) по ЗУТ. Структура: Обект, Описание на видовете работи, Технология, Срок, Стойност, Качество и гаранции (Наредба №2 към ЗУТ), Приемане с двустранен протокол.",
  },
  kss: {
    id: "kss", label: "КСС",
    partyAName: "Възложител", partyBName: "Изпълнител",
    systemAddendum: "Изготви КОЛИЧЕСТВЕНО-СТОЙНОСТНА СМЕТКА (КСС). Раздели/позиции по видове работи. За всяка позиция: № по ред, Описание, Мярка (м², м³, бр., л.м., т), Количество, Единична цена (в евро), Стойност. В края — общо на раздел и обща стойност без/с ДДС. Подреди като таблица в текстов вид с ясни колони.",
  },
};

export function getDocumentTypeSpec(id: string | undefined | null): DocumentTypeSpec {
  if (!id || !(id in T)) return T.contract;
  return T[id as DocumentTypeId];
}

export const ALL_DOCUMENT_TYPE_IDS = Object.keys(T) as DocumentTypeId[];

// Infer document type from a document name (Bulgarian). Order matters — specific first.
// Keep in sync with src/lib/documentTypeInference.ts.
const INFER_RULES: { type: DocumentTypeId; re: RegExp }[] = [
  { type: "kss",               re: /\bКСС\b|количествено[-\s]стойностна/i },
  { type: "smr",               re: /\bСМР\b|строително[-\s]монтажни|акт\s*обр?\.?\s*1[259]\b/i },
  { type: "notary_invitation", re: /нотариална\s+покана/i },
  { type: "claim",             re: /искова\s+молба|заповед(но|за\s+изпълнение)/i },
  { type: "complaint",         re: /^жалба|\bжалба\b/i },
  { type: "power_of_attorney", re: /пълномощно/i },
  { type: "declaration",       re: /деклараци[яи]/i },
  { type: "receipt",           re: /^разписка|\bразписка\b/i },
  { type: "invoice",           re: /фактура|кредитно\s+известие|дебитно\s+известие/i },
  { type: "offer",             re: /^оферта|\bоферта\b|проформа/i },
  { type: "protocol",          re: /протокол|приемо[-\s]предавателен/i },
  { type: "annex",             re: /^анекс|\bанекс\b/i },
  { type: "appendix",          re: /^приложение|спецификация|техническо\s+задание|ценоразпис|sla/i },
  { type: "agreement",         re: /споразумение|memorandum|меморандум/i },
  { type: "contract",          re: /договор|EULA|лицензионен/i },
];

export function inferDocumentType(name: string | null | undefined): DocumentTypeId {
  const s = String(name ?? "");
  for (const r of INFER_RULES) if (r.re.test(s)) return r.type;
  return "contract";
}

