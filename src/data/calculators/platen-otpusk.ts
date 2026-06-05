import type { Calculator } from "./types";
import { fmtEUR, fmtNum } from "./types";

export const platenOtpusk: Calculator = {
  slug: "platen-otpusk",
  title: "Калкулатор за платен годишен отпуск и обезщетение",
  shortTitle: "Платен отпуск",
  description:
    "Изчислява полагаемите дни отпуск за година и паричното обезщетение за неизползвани дни.",
  icon: "CalendarDays",
  fields: [
    {
      key: "daysPerYear",
      label: "Договорен годишен отпуск",
      type: "number",
      unit: "дни",
      min: 20,
      max: 60,
      step: 1,
      default: 20,
      help: "Минимумът по КТ е 20 дни; често 25 за квалифициран труд.",
    },
    {
      key: "workedDays",
      label: "Отработени дни през годината",
      type: "number",
      unit: "дни",
      min: 0,
      max: 366,
      step: 1,
      default: 250,
      help: "Брой календарни дни на трудово правоотношение през текущата година.",
    },
    {
      key: "unusedDays",
      label: "Неизползвани дни отпуск",
      type: "number",
      unit: "дни",
      min: 0,
      step: 0.5,
      default: 0,
      help: "За изчисляване на обезщетение по чл. 224 КТ.",
    },
    {
      key: "grossMonthly",
      label: "Брутна месечна заплата",
      type: "number",
      unit: "EUR",
      min: 0,
      step: 0.01,
      default: 1000,
    },
  ],
  compute: ({ daysPerYear, workedDays, unusedDays, grossMonthly }) => {
    const days = Number(daysPerYear) || 20;
    const worked = Number(workedDays) || 0;
    const unused = Number(unusedDays) || 0;
    const gross = Number(grossMonthly) || 0;
    const due = Math.round((days * worked) / 365);
    const dailyRate = gross / 21; // средно работни дни
    const compensation = unused * dailyRate;
    return {
      main: { label: "Полагаеми дни за периода", value: `${due} дни` },
      breakdown: [
        { label: "Годишен отпуск", value: `${days} дни` },
        { label: "Отработени дни", value: `${worked} от 365` },
        {
          label: "Полагаем отпуск (пропорция)",
          value: `${due} дни`,
        },
        { label: "Дневна ставка (брутна)", value: fmtEUR(dailyRate) },
        { label: "Неизползвани дни", value: fmtNum(unused, 1) },
        {
          label: "Обезщетение по чл. 224 КТ",
          value: fmtEUR(compensation),
        },
      ],
      notes: [
        "Полагаемият отпуск се изчислява пропорционално на отработените дни в годината.",
        "При прекратяване на трудовия договор работодателят дължи парично обезщетение за неизползвания платен годишен отпуск (чл. 224 КТ).",
      ],
    };
  },
  legalBasis: [
    { label: "чл. 155 КТ", url: "https://lex.bg/laws/ldoc/1594373121" },
    { label: "чл. 224 КТ", url: "https://lex.bg/laws/ldoc/1594373121" },
  ],
  seo: {
    metaDescription:
      "Безплатен калкулатор за платен годишен отпуск и обезщетение за неизползвани дни в EUR. Изчисление по чл. 155 и чл. 224 КТ.",
    intro:
      "Всеки работник има право на платен годишен отпуск — минимум 20 работни дни (чл. 155 КТ). При прекратяване на трудовото правоотношение неизползваните дни се компенсират парично по чл. 224 КТ.",
    howItWorks:
      "Полагаемият брой дни за периода се изчислява пропорционално: годишен_отпуск × отработени_дни ÷ 365. Обезщетението е равно на дневната брутна заплата (заплата ÷ 21) умножена по броя неизползвани дни.",
    faq: [
      {
        q: "Кога се погасява правото на платен отпуск?",
        a: "С 2-годишна давност от края на годината, за която се полага (чл. 176а КТ).",
      },
      {
        q: "Може ли работодателят да изплаща отпуска вместо да го дава в дни?",
        a: "Не, по време на трудовото правоотношение е забранено (чл. 178 КТ). Парично обезщетение се дължи само при прекратяване.",
      },
      {
        q: "Облага ли се обезщетението с данък?",
        a: "Да, обезщетението по чл. 224 КТ се облага с данък върху доходите и осигуровки като трудово възнаграждение.",
      },
    ],
  },
};
