import type { Calculator } from "./types";
import { fmtEUR, fmtNum } from "./types";

export const lihvaZabava: Calculator = {
  slug: "lihva-zabava",
  title: "Калкулатор за законна лихва за забава",
  shortTitle: "Лихва за забава",
  description:
    "Изчислява законна лихва за забава по чл. 86 ЗЗД (ОЛП на БНБ + 10 процентни пункта).",
  icon: "Percent",
  fields: [
    {
      key: "principal",
      label: "Главница",
      type: "number",
      unit: "EUR",
      min: 0,
      step: 0.01,
      default: 2400,
      help: "Например: неплатена фактура на стойност 2400.00 EUR.",
    },
    {
      key: "startDate",
      label: "Начална дата (от деня след падежа)",
      type: "date",
      default: new Date(Date.now() - 90 * 86400000)
        .toISOString()
        .slice(0, 10),
    },
    {
      key: "endDate",
      label: "Крайна дата (на плащане или днес)",
      type: "date",
      default: new Date().toISOString().slice(0, 10),
    },
    {
      key: "annualRate",
      label: "Годишен процент",
      type: "number",
      unit: "%",
      min: 0,
      max: 100,
      step: 0.01,
      default: 13.79,
      help:
        "За 2026 г. ≈ 13.79% (ОЛП на БНБ 3.79% + 10 п.п.). Можете да въведете друг процент при необходимост.",
    },
  ],
  compute: ({ principal, startDate, endDate, annualRate }) => {
    const p = Number(principal) || 0;
    const rate = Number(annualRate) || 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const ms = end.getTime() - start.getTime();
    const days = Math.max(0, Math.round(ms / 86400000));
    // База 360 дни (банкова конвенция, използвана и в съдебната практика)
    const interest = (p * rate * days) / 100 / 360;
    return {
      main: { label: "Дължима лихва", value: fmtEUR(interest) },
      breakdown: [
        { label: "Главница", value: fmtEUR(p) },
        { label: "Брой дни забава", value: `${days} дни` },
        { label: "Годишен лихвен процент", value: `${fmtNum(rate, 2)} %` },
        { label: "Формула", value: "главница × % × дни / 360" },
        { label: "Общо за плащане", value: fmtEUR(p + interest) },
      ],
      notes: [
        "Законната лихва за забава = основен лихвен процент на БНБ + 10 процентни пункта (ПМС № 426/18.12.2014).",
        "Изчислението използва база 360 дни — стандартната банкова конвенция, прилагана и в съдебната практика.",
      ],
    };
  },
  legalBasis: [
    { label: "чл. 86 ЗЗД", url: "https://lex.bg/laws/ldoc/2121934337" },
    {
      label: "ПМС 426/2014",
      url: "https://lex.bg/bg/laws/ldoc/2136223150",
    },
  ],
  seo: {
    metaDescription:
      "Калкулатор за законна лихва за забава по чл. 86 ЗЗД в EUR. Изчислете точния размер между две дати с актуалния ОЛП.",
    intro:
      "При забавено плащане длъжникът дължи на кредитора законна лихва за забава. Размерът ѝ е основният лихвен процент на БНБ плюс 10 процентни пункта (ПМС 426/2014).",
    howItWorks:
      "Калкулаторът умножава главницата по годишния процент, после по броя дни забава и дели на 360. Това е стандартната банкова формула, прилагана и в българската съдебна практика.",
    faq: [
      {
        q: "От кога започва да тече лихвата?",
        a: "От деня, следващ падежа на задължението — когато длъжникът изпадне в забава по чл. 84 ЗЗД.",
      },
      {
        q: "Какъв е лихвеният процент за 2026?",
        a: "Към януари 2026 г. ОЛП на БНБ е около 3.79%, което прави законната лихва за забава около 13.79% годишно. Проверявайте актуалния процент на сайта на БНБ.",
      },
      {
        q: "Може ли да се иска лихва без покана?",
        a: "Да, при срочни задължения лихвата тече автоматично от падежа. При безсрочни — от поканата за изпълнение.",
      },
    ],
  },
};
