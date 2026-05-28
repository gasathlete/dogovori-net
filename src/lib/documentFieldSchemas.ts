// Per-document-type wizard field schemas for /build.
// Title + Category + Parties remain common across all types; the rest of the
// middle section is driven by these schemas.

import type { DocumentTypeId } from "./documentReferences";

export type FieldKind = "input" | "textarea";

export interface BuildField {
  key: string;
  label: string;
  placeholder?: string;
  help?: string;
  hint?: string;        // small right-aligned hint, e.g. "празно → AI предлага"
  kind: FieldKind;
  rows?: number;
  required?: boolean;
  half?: boolean;       // pair consecutive half:true fields into a 2-col row
}

export interface DocumentBuildSchema {
  partyALabel: string;
  partyBLabel?: string; // undefined => one-sided document
  partyAPlaceholder?: string;
  partyBPlaceholder?: string;
  partyAHelp?: string;
  partyBHelp?: string;
  fields: BuildField[];
}

const AI_HINT = "празно → AI предлага";

const SCHEMAS: Record<DocumentTypeId, DocumentBuildSchema> = {
  contract: {
    partyALabel: "Възложител/и",
    partyBLabel: "Изпълнител/и",
    partyAPlaceholder: '„Алфа Софт" ЕООД, ЕИК...\nИван Иванов',
    partyBPlaceholder: '„Бета Дизайн" ООД, ЕИК...',
    partyAHelp: "По един на ред",
    partyBHelp: "По един на ред",
    fields: [
      { key: "subject", label: "Предмет", kind: "textarea", rows: 2, hint: AI_HINT,
        placeholder: "Какво се възлага / какво се изпълнява…" },
      { key: "term", label: "Срок", kind: "input", half: true, hint: AI_HINT,
        placeholder: "напр. 6 месеца от подписване" },
      { key: "prices", label: "Цени и плащане", kind: "input", half: true, hint: AI_HINT,
        placeholder: "напр. 12 000 € на 3 транша" },
      { key: "obligations", label: "Задължения", kind: "textarea", rows: 2, hint: AI_HINT,
        placeholder: "Конкретни задължения на страните…" },
      { key: "other", label: "Други", kind: "textarea", rows: 2,
        hint: "специфики, гаранции, NDA, IP…",
        placeholder: "Всичко уникално, което трябва да се отрази…" },
    ],
  },
  agreement: {
    partyALabel: "Страна А",
    partyBLabel: "Страна Б",
    partyAHelp: "По един ред на участник",
    partyBHelp: "По един ред на участник",
    fields: [
      { key: "subject", label: "Предмет на споразумението", kind: "textarea", rows: 2, hint: AI_HINT,
        placeholder: "Какво уреждат страните…" },
      { key: "mutual_obligations", label: "Взаимни ангажименти", kind: "textarea", rows: 3, hint: AI_HINT,
        placeholder: "Кой какво се задължава да направи…" },
      { key: "term", label: "Срок / влизане в сила", kind: "input", half: true, hint: AI_HINT },
      { key: "consequences", label: "Последици при неизпълнение", kind: "input", half: true, hint: AI_HINT },
      { key: "other", label: "Други", kind: "textarea", rows: 2,
        placeholder: "Поверителност, приложимо право, подсъдност…" },
    ],
  },
  appendix: {
    partyALabel: "Възложител/и",
    partyBLabel: "Изпълнител/и",
    partyAHelp: "По един на ред",
    partyBHelp: "По един на ред",
    fields: [
      { key: "parent_ref", label: "Препратка към основен договор", kind: "input",
        placeholder: "напр. Договор за изработка от 12.03.2025", required: false },
      { key: "subject", label: "Предмет на приложението", kind: "textarea", rows: 2, hint: AI_HINT,
        placeholder: "Какво описва приложението…" },
      { key: "specs", label: "Технически / съдържателни параметри", kind: "textarea", rows: 3, hint: AI_HINT,
        placeholder: "Спецификации, обем, етапи…" },
      { key: "term", label: "Срок / график", kind: "input", half: true, hint: AI_HINT },
      { key: "prices", label: "Стойност (ако приложимо)", kind: "input", half: true, hint: AI_HINT },
    ],
  },
  annex: {
    partyALabel: "Възложител/и",
    partyBLabel: "Изпълнител/и",
    partyAHelp: "По един на ред",
    partyBHelp: "По един на ред",
    fields: [
      { key: "parent_ref", label: "Препратка към основен договор", kind: "input",
        placeholder: "напр. Договор за наем от 01.06.2024" },
      { key: "changed_clauses", label: "Изменения / допълнения / отмяна", kind: "textarea", rows: 4,
        placeholder: "Чл. 5 се изменя така…; Добавя се нов чл. 7а…; Чл. 9 се отменя." },
      { key: "effective_date", label: "Дата на влизане в сила", kind: "input", half: true, hint: AI_HINT,
        placeholder: "напр. от 01.01.2026" },
      { key: "reason", label: "Основание / мотив", kind: "input", half: true, hint: AI_HINT,
        placeholder: "напр. промяна в законодателството" },
    ],
  },
  protocol: {
    partyALabel: "Възложител/и",
    partyBLabel: "Изпълнител/и",
    fields: [
      { key: "object", label: "Обект / предмет на приемане", kind: "textarea", rows: 2,
        placeholder: "Какво се приема/предава или констатира…" },
      { key: "place", label: "Място", kind: "input", half: true, placeholder: "напр. София, ул. ..." },
      { key: "date", label: "Дата", kind: "input", half: true, placeholder: "напр. 15.05.2026" },
      { key: "findings", label: "Констатации", kind: "textarea", rows: 3, hint: AI_HINT,
        placeholder: "Какво е установено при огледа/приемането…" },
      { key: "defects", label: "Недостатъци (ако има)", kind: "textarea", rows: 2,
        placeholder: "Списък на забележките…" },
      { key: "acceptance", label: "Приемане / отказ", kind: "input", hint: AI_HINT,
        placeholder: "Приема се без забележки / с уговорки / отказва се" },
    ],
  },
  receipt: {
    partyALabel: "Получател",
    partyBLabel: "Платец / Предаващ",
    partyAPlaceholder: "Иван Петров Иванов, ЕГН ..., адрес ...",
    partyBPlaceholder: "Мария Георгиева, ЕГН ..., адрес ...",
    fields: [
      { key: "amount_or_item", label: "Сума или вещ", kind: "textarea", rows: 2, required: true,
        placeholder: "напр. 1 500 € (хиляда и петстотин евро) / лаптоп Dell XPS 13" },
      { key: "basis", label: "Основание", kind: "input", hint: AI_HINT,
        placeholder: "напр. връщане на заем / капаро по предварителен договор" },
      { key: "place", label: "Място", kind: "input", half: true, placeholder: "напр. София" },
      { key: "date", label: "Дата", kind: "input", half: true, placeholder: "напр. 28.05.2026" },
    ],
  },
  power_of_attorney: {
    partyALabel: "Упълномощител",
    partyBLabel: "Пълномощник",
    partyAPlaceholder: "Иван Петров Иванов, ЕГН ..., адрес ...",
    partyBPlaceholder: "адв. Мария Георгиева, ЕГН/№ ..., адрес ...",
    fields: [
      { key: "scope", label: "Обем на представителната власт", kind: "textarea", rows: 4, required: true,
        placeholder: "Конкретни действия — напр. да ме представлява пред НАП, банка, нотариус..." },
      { key: "term", label: "Срок", kind: "input", half: true, hint: AI_HINT,
        placeholder: "напр. до 31.12.2026 / безсрочно" },
      { key: "substitution_right", label: "Право на преупълномощаване", kind: "input", half: true,
        placeholder: "С / без право" },
      { key: "notarial_required", label: "Нотариална заверка нужна?", kind: "input", hint: AI_HINT,
        placeholder: "Да (разпореждане с имот) / Не / Само на подпис" },
    ],
  },
  declaration: {
    partyALabel: "Декларатор",
    partyAPlaceholder: "Иван Петров Иванов, ЕГН ..., адрес ...",
    partyAHelp: "Имена, адрес, ЕГН",
    fields: [
      { key: "declared_text", label: "Декларирано обстоятелство", kind: "textarea", rows: 4, required: true,
        placeholder: 'напр. „Декларирам, че…" — какво точно се декларира' },
      { key: "legal_basis", label: "Правно основание (ако има)", kind: "input", hint: AI_HINT,
        placeholder: "напр. чл. 313 НК / чл. 22 ЗЗД / по образец" },
      { key: "criminal_liability_note", label: "Известна ми е отговорността по чл. 313 НК?", kind: "input",
        placeholder: "Да / Не / Неприложимо" },
    ],
  },
  complaint: {
    partyALabel: "Жалбоподател",
    partyBLabel: "Ответна страна / орган",
    partyAPlaceholder: "Иван Петров Иванов, ЕГН ..., адрес ...",
    partyBPlaceholder: "напр. Кмет на Община …",
    fields: [
      { key: "addressee", label: "До кого се подава", kind: "input", required: true,
        placeholder: "напр. Районен съд София / КЗП / Кмет на Община …" },
      { key: "relating", label: "Относно", kind: "input", hint: AI_HINT,
        placeholder: "напр. Жалба срещу акт №…" },
      { key: "facts", label: "Фактическа обстановка", kind: "textarea", rows: 4, required: true,
        placeholder: "Хронологично — какво се случи…" },
      { key: "legal_grounds", label: "Правни доводи", kind: "textarea", rows: 3, hint: AI_HINT,
        placeholder: "Препратки към закон, нарушени норми…" },
      { key: "request", label: 'Искане („моля да…")', kind: "textarea", rows: 2, required: true,
        placeholder: "Какво се иска от органа/съда…" },
      { key: "attachments", label: "Приложения", kind: "textarea", rows: 2,
        placeholder: "1. Копие от акт…\n2. Договор…" },
    ],
  },
  claim: {
    partyALabel: "Ищец",
    partyBLabel: "Ответник",
    partyAPlaceholder: "Иван Петров Иванов, ЕГН ..., адрес ...",
    partyBPlaceholder: '„Алфа" ЕООД, ЕИК ..., седалище ...',
    fields: [
      { key: "court", label: "Компетентен съд", kind: "input", required: true,
        placeholder: "напр. Софийски районен съд / Окръжен съд Пловдив" },
      { key: "claim_value", label: "Цена на иска", kind: "input", half: true, required: true,
        placeholder: "напр. 8 000 €" },
      { key: "state_fee", label: "Държавна такса", kind: "input", half: true, hint: AI_HINT,
        placeholder: "напр. 4% (мин. 50 лв.)" },
      { key: "legal_basis", label: "Правно основание", kind: "input", hint: AI_HINT,
        placeholder: "напр. чл. 79 ЗЗД / чл. 92 ЗЗД" },
      { key: "circumstances", label: "Обстоятелства на спора", kind: "textarea", rows: 4, required: true,
        placeholder: "Хронологично — възникване, развитие, нарушение…" },
      { key: "evidence", label: "Доказателства", kind: "textarea", rows: 3,
        placeholder: "Писмени, свидетелски, експертиза…" },
      { key: "petitum", label: "Петитум", kind: "textarea", rows: 2, required: true,
        placeholder: "Моля съдът да осъди…/ да признае…/ да обяви…" },
      { key: "attachments", label: "Приложения", kind: "textarea", rows: 2,
        placeholder: "1. …\n2. …" },
    ],
  },
  notary_invitation: {
    partyALabel: "Канещ",
    partyBLabel: "Канен",
    fields: [
      { key: "basis", label: "Основание / правоотношение", kind: "textarea", rows: 2, required: true,
        placeholder: "напр. Договор за наем от 01.01.2024 г." },
      { key: "demand", label: "Конкретно искане / претенция", kind: "textarea", rows: 3, required: true,
        placeholder: "напр. плащане на сумата от … / изпълнение на …" },
      { key: "deadline", label: "Срок за изпълнение", kind: "input", half: true, hint: AI_HINT,
        placeholder: "напр. 7 дни от получаване" },
      { key: "consequences", label: "Последици при неизпълнение", kind: "input", half: true, hint: AI_HINT,
        placeholder: "напр. иск пред съд, разваляне" },
    ],
  },
  offer: {
    partyALabel: "Оферент",
    partyBLabel: "Получател на оферта",
    fields: [
      { key: "subject", label: "Предмет на офертата", kind: "textarea", rows: 2, required: true,
        placeholder: "Какво се предлага…" },
      { key: "specs", label: "Спецификации", kind: "textarea", rows: 3, hint: AI_HINT,
        placeholder: "Техническо описание, обем, варианти…" },
      { key: "price_vat", label: "Цена с/без ДДС (в €)", kind: "input", half: true, required: true,
        placeholder: "напр. 5 000 € без ДДС / 6 000 € с ДДС" },
      { key: "validity", label: "Срок на валидност", kind: "input", half: true, hint: AI_HINT,
        placeholder: "напр. 30 дни от издаване" },
      { key: "delivery_terms", label: "Срок и условия на изпълнение", kind: "input", hint: AI_HINT },
      { key: "payment_terms", label: "Начин на плащане", kind: "input", hint: AI_HINT,
        placeholder: "напр. 30% аванс, 70% при доставка" },
    ],
  },
  invoice: {
    partyALabel: "Получател",
    partyBLabel: "Доставчик",
    partyAPlaceholder: '„Алфа" ЕООД, ЕИК ..., ДДС № BG..., МОЛ ..., адрес ...',
    partyBPlaceholder: '„Бета" ООД, ЕИК ..., ДДС № BG..., МОЛ ..., адрес ...',
    fields: [
      { key: "items", label: "Артикули / услуги", kind: "textarea", rows: 5, required: true,
        help: "По един ред на позиция: описание | мярка | к-во | ед. цена",
        placeholder: "Уеб дизайн | бр. | 1 | 2 500\nХостинг | мес. | 12 | 30" },
      { key: "vat_rate", label: "ДДС ставка (%)", kind: "input", half: true,
        placeholder: "напр. 20" },
      { key: "payment_method", label: "Начин на плащане", kind: "input", half: true, hint: AI_HINT,
        placeholder: "напр. банков превод, IBAN ..." },
      { key: "tax_event_date", label: "Дата на данъчно събитие", kind: "input", hint: AI_HINT,
        placeholder: "напр. 28.05.2026" },
    ],
  },
  smr: {
    partyALabel: "Възложител/и",
    partyBLabel: "Изпълнител/и",
    fields: [
      { key: "object", label: "Обект", kind: "textarea", rows: 2, required: true,
        placeholder: "Описание на строежа / адрес / разрешение за строеж…" },
      { key: "work_types", label: "Видове работи", kind: "textarea", rows: 4, required: true,
        placeholder: "напр. груб строеж, ВиК, ел., довършителни…" },
      { key: "technology", label: "Технология / материали", kind: "textarea", rows: 2, hint: AI_HINT,
        placeholder: "Норми, материали, БДС…" },
      { key: "term", label: "Срок", kind: "input", half: true, hint: AI_HINT },
      { key: "value", label: "Стойност (в €)", kind: "input", half: true, hint: AI_HINT },
      { key: "quality_warranty", label: "Качество и гаранции", kind: "textarea", rows: 2, hint: AI_HINT,
        placeholder: "Наредба №2 към ЗУТ, гаранционни срокове…" },
    ],
  },
  kss: {
    partyALabel: "Възложител/и",
    partyBLabel: "Изпълнител/и",
    fields: [
      { key: "object", label: "Обект", kind: "input", required: true,
        placeholder: "напр. Жилищна сграда, ул. ... №..." },
      { key: "positions", label: "Позиции (по ред)", kind: "textarea", rows: 10, required: true,
        help: "По един ред: № | описание | мярка (м²/м³/бр./л.м./т) | количество | ед. цена",
        placeholder: "1 | Изкоп земни маси | м³ | 120 | 12\n2 | Бетон B25 | м³ | 45 | 180\n3 | Зидария тухла | м² | 220 | 35" },
      { key: "totals_note", label: "Бележки за общата стойност", kind: "input", hint: AI_HINT,
        placeholder: "напр. без ДДС / с 20% ДДС" },
    ],
  },
};

export function getBuildSchema(id: DocumentTypeId | string | null | undefined): DocumentBuildSchema {
  if (!id || !(id in SCHEMAS)) return SCHEMAS.contract;
  return SCHEMAS[id as DocumentTypeId];
}

export function getAllFieldKeys(): string[] {
  const keys = new Set<string>();
  for (const s of Object.values(SCHEMAS)) {
    for (const f of s.fields) keys.add(f.key);
  }
  return Array.from(keys);
}
