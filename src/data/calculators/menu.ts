// Lightweight calculator metadata for navigation menus. Importing the full
// CALCULATORS array pulls ~40KB of formulas/content into the entry chunk, so
// menus use this static list instead. Keep in sync with src/data/calculators/*.
export interface CalculatorMenuItem {
  slug: string;
  shortTitle: string;
  description: string;
  icon: string;
}

export const CALCULATOR_MENU: CalculatorMenuItem[] = [
  {
    slug: "obezshtetenie-uvolnenie",
    shortTitle: "Обезщетение при уволнение",
    description:
      "Изчислява обезщетение по чл. 222 КТ при прекратяване на трудов договор по инициатива на работодателя.",
    icon: "Briefcase",
  },
  {
    slug: "platen-otpusk",
    shortTitle: "Платен отпуск",
    description:
      "Изчислява полагаемите дни отпуск за година и паричното обезщетение за неизползвани дни.",
    icon: "CalendarDays",
  },
  {
    slug: "obezshtetenie-bezrabotitsa",
    shortTitle: "Обезщетение за безработица",
    description:
      "Изчислява дневното и месечното обезщетение за безработица в зависимост от осигурителен доход и трудов стаж.",
    icon: "UserMinus",
  },
  {
    slug: "lihva-zabava",
    shortTitle: "Лихва за забава",
    description:
      "Изчислява законна лихва за забава по чл. 86 ЗЗД (ОЛП на БНБ + 10 процентни пункта).",
    icon: "Percent",
  },
  {
    slug: "notarialna-taksa",
    shortTitle: "Нотариална такса",
    description:
      "Изчислява нотариална такса по Тарифа №1 към ЗДТ — заверка на подпис или удостоверяване на сделка.",
    icon: "Stamp",
  },
  {
    slug: "dds-kalkulator",
    shortTitle: "ДДС калкулатор",
    description:
      "Преобразува между нетна и брутна стойност с включен/добавен ДДС от 20% (или друга ставка).",
    icon: "Calculator",
  },
  {
    slug: "mestni-danatsi",
    shortTitle: "Данък при придобиване",
    description:
      "Изчислява местния данък при възмездно придобиване на имот по ЗМДТ (определя се от общината, 0.1%–3%).",
    icon: "Home",
  },
  {
    slug: "predizvestie-kt",
    shortTitle: "Срок на предизвестие",
    description:
      "Определя срока на предизвестието при прекратяване на трудов договор по чл. 326 и чл. 328 КТ.",
    icon: "ClockAlert",
  },
];
