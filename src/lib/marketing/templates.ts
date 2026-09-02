/**
 * Шаблони за рекламни материали (оферти, предложения и др.).
 * Всеки шаблон описва полетата си декларативно, за да може UI-то да се
 * генерира автоматично, а рендерът да остане една чиста функция.
 */

export type MarketingFieldType = "text" | "textarea" | "date" | "number" | "list" | "items";

export interface MarketingField {
  key: string;
  label: string;
  type: MarketingFieldType;
  placeholder?: string;
  hint?: string;
  required?: boolean;
}

export interface MarketingTemplate {
  key: string;
  name: string;
  description: string;
  /** Заглавието по подразбиране на готовия документ. */
  titleTemplate: string;
  fields: MarketingField[];
  /** Реда на секциите в готовия документ. */
  sections: { heading: string; fromField: string }[];
  /** Показва таблица с позиции и обща сума. */
  hasItems?: boolean;
  closing: string;
}

/** Един ред от таблицата с позиции. */
export interface MarketingItem {
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

export const MARKETING_TEMPLATES: MarketingTemplate[] = [
  {
    key: "offer",
    name: "Оферта",
    description: "Ценова оферта с позиции, срок на валидност и условия на плащане.",
    titleTemplate: "Оферта за {subject}",
    hasItems: true,
    fields: [
      { key: "client", label: "Клиент", type: "text", placeholder: "Фирма ЕООД", required: true },
      { key: "subject", label: "Предмет", type: "text", placeholder: "изработка на уебсайт", required: true },
      { key: "intro", label: "Въведение", type: "textarea", placeholder: "Благодарим за проявения интерес…" },
      { key: "scope", label: "Обхват на работата", type: "list", hint: "По един ред на точка." },
      { key: "items", label: "Позиции", type: "items" },
      { key: "timeline", label: "Срок за изпълнение", type: "text", placeholder: "20 работни дни" },
      { key: "payment", label: "Условия на плащане", type: "textarea", placeholder: "50% авансово, 50% при предаване." },
      { key: "validUntil", label: "Валидна до", type: "date" },
    ],
    sections: [
      { heading: "ВЪВЕДЕНИЕ", fromField: "intro" },
      { heading: "ОБХВАТ НА РАБОТАТА", fromField: "scope" },
      { heading: "СРОК ЗА ИЗПЪЛНЕНИЕ", fromField: "timeline" },
      { heading: "УСЛОВИЯ НА ПЛАЩАНЕ", fromField: "payment" },
    ],
    closing: "Офертата е валидна до посочената дата. За въпроси сме на разположение.",
  },
  {
    key: "proposal",
    name: "Бизнес предложение",
    description: "Структурирано предложение с проблем, решение, ползи и следващи стъпки.",
    titleTemplate: "Предложение за {subject}",
    fields: [
      { key: "client", label: "Клиент", type: "text", required: true },
      { key: "subject", label: "Тема", type: "text", required: true },
      { key: "context", label: "Контекст и предизвикателство", type: "textarea" },
      { key: "solution", label: "Предложено решение", type: "textarea" },
      { key: "benefits", label: "Ползи", type: "list" },
      { key: "investment", label: "Инвестиция", type: "text", placeholder: "3 500.00 €" },
      { key: "nextSteps", label: "Следващи стъпки", type: "list" },
    ],
    sections: [
      { heading: "КОНТЕКСТ", fromField: "context" },
      { heading: "ПРЕДЛОЖЕНО РЕШЕНИЕ", fromField: "solution" },
      { heading: "ПОЛЗИ", fromField: "benefits" },
      { heading: "ИНВЕСТИЦИЯ", fromField: "investment" },
      { heading: "СЛЕДВАЩИ СТЪПКИ", fromField: "nextSteps" },
    ],
    closing: "Оставаме на разположение за уточнения и среща.",
  },
  {
    key: "proforma",
    name: "Проформа фактура",
    description: "Проформа с позиции, обща сума и данни за плащане.",
    titleTemplate: "Проформа фактура № {number}",
    hasItems: true,
    fields: [
      { key: "number", label: "Номер", type: "text", placeholder: "0000000123", required: true },
      { key: "client", label: "Получател", type: "text", required: true },
      { key: "clientDetails", label: "Данни на получателя", type: "textarea", placeholder: "ЕИК, адрес, МОЛ" },
      { key: "items", label: "Позиции", type: "items" },
      { key: "bank", label: "Банкови данни", type: "textarea", placeholder: "IBAN, BIC, банка" },
      { key: "dueDate", label: "Срок за плащане", type: "date" },
      { key: "note", label: "Забележка", type: "textarea" },
    ],
    sections: [
      { heading: "ДАННИ НА ПОЛУЧАТЕЛЯ", fromField: "clientDetails" },
      { heading: "БАНКОВИ ДАННИ", fromField: "bank" },
      { heading: "ЗАБЕЛЕЖКА", fromField: "note" },
    ],
    closing: "Документът не е данъчна фактура и не подлежи на осчетоводяване.",
  },
  {
    key: "price_list",
    name: "Ценоразпис",
    description: "Списък с услуги и цени за изпращане на клиенти.",
    titleTemplate: "Ценоразпис — {subject}",
    hasItems: true,
    fields: [
      { key: "subject", label: "Заглавие", type: "text", placeholder: "услуги 2026", required: true },
      { key: "intro", label: "Кратко въведение", type: "textarea" },
      { key: "items", label: "Услуги и цени", type: "items" },
      { key: "terms", label: "Общи условия", type: "textarea" },
    ],
    sections: [
      { heading: "ВЪВЕДЕНИЕ", fromField: "intro" },
      { heading: "ОБЩИ УСЛОВИЯ", fromField: "terms" },
    ],
    closing: "Цените са ориентировъчни и подлежат на уточняване според обема на работата.",
  },
  {
    key: "cover_letter",
    name: "Придружително писмо",
    description: "Кратко професионално писмо, което придружава оферта или документ.",
    titleTemplate: "Придружително писмо до {client}",
    fields: [
      { key: "client", label: "До", type: "text", required: true },
      { key: "subject", label: "Относно", type: "text", required: true },
      { key: "body", label: "Съдържание", type: "textarea", required: true },
      { key: "attachments", label: "Приложения", type: "list" },
    ],
    sections: [
      { heading: "ОТНОСНО", fromField: "subject" },
      { heading: "СЪДЪРЖАНИЕ", fromField: "body" },
      { heading: "ПРИЛОЖЕНИЯ", fromField: "attachments" },
    ],
    closing: "С уважение,",
  },
  {
    key: "service_description",
    name: "Описание на услуга",
    description: "Продуктов лист с описание, включени дейности и резултати.",
    titleTemplate: "{subject}",
    fields: [
      { key: "subject", label: "Име на услугата", type: "text", required: true },
      { key: "summary", label: "Кратко описание", type: "textarea" },
      { key: "included", label: "Какво включва", type: "list" },
      { key: "results", label: "Очаквани резултати", type: "list" },
      { key: "price", label: "Цена", type: "text" },
    ],
    sections: [
      { heading: "ОПИСАНИЕ", fromField: "summary" },
      { heading: "КАКВО ВКЛЮЧВА", fromField: "included" },
      { heading: "ОЧАКВАНИ РЕЗУЛТАТИ", fromField: "results" },
      { heading: "ЦЕНА", fromField: "price" },
    ],
    closing: "За индивидуално предложение се свържете с нас.",
  },
  {
    key: "follow_up",
    name: "Напомняне след оферта",
    description: "Учтиво проследяващо писмо след изпратена оферта.",
    titleTemplate: "Напомняне относно {subject}",
    fields: [
      { key: "client", label: "До", type: "text", required: true },
      { key: "subject", label: "Относно", type: "text", required: true },
      { key: "reminder", label: "Текст", type: "textarea", required: true },
      { key: "deadline", label: "Краен срок", type: "date" },
    ],
    sections: [
      { heading: "НАПОМНЯНЕ", fromField: "reminder" },
      { heading: "КРАЕН СРОК", fromField: "deadline" },
    ],
    closing: "Благодарим за отделеното време.",
  },
];

export const getMarketingTemplate = (key: string): MarketingTemplate | undefined =>
  MARKETING_TEMPLATES.find((t) => t.key === key);
