import type { Calculator } from "./types";
import { fmtEUR } from "./types";

export const obezshtetenieBezrabotitsa: Calculator = {
  slug: "obezshtetenie-bezrabotitsa",
  title: "Калкулатор за обезщетение за безработица (чл. 54а КСО)",
  shortTitle: "Обезщетение за безработица",
  description:
    "Изчислява дневното и месечното обезщетение за безработица в зависимост от осигурителен доход и трудов стаж.",
  icon: "UserMinus",
  fields: [
    {
      key: "avgInsuredIncome",
      label: "Среден осигурителен доход (последни 24 месеца)",
      type: "number",
      unit: "EUR",
      min: 0,
      step: 0.01,
      default: 1500,
      help: "Средномесечният осигурителен доход за последните 24 месеца. Например: средна брутна заплата 1500.00 EUR.",
    },
    {
      key: "yearsContributed",
      label: "Осигурителен стаж за безработица",
      type: "select",
      default: "5",
      options: [
        { value: "3", label: "под 3 години (4 месеца обезщетение)" },
        { value: "5", label: "от 3 до 5 години (6 месеца)" },
        { value: "10", label: "от 5 до 10 години (8 месеца)" },
        { value: "15", label: "от 10 до 15 години (9 месеца)" },
        { value: "20", label: "от 15 до 20 години (10 месеца)" },
        { value: "25", label: "от 20 до 25 години (11 месеца)" },
        { value: "30", label: "над 25 години (12 месеца)" },
      ],
    },
  ],
  compute: ({ avgInsuredIncome, yearsContributed }) => {
    const income = Number(avgInsuredIncome) || 0;
    const dailyAvg = income / 21; // 21 работни дни
    const dailyBenefit = dailyAvg * 0.6;
    const monthly = dailyBenefit * 21;
    const periods: Record<string, number> = {
      "3": 4,
      "5": 6,
      "10": 8,
      "15": 9,
      "20": 10,
      "25": 11,
      "30": 12,
    };
    const months = periods[String(yearsContributed)] ?? 4;
    // Минимален дневен размер 2026 ≈ 9.21 EUR (по последна актуализация на МС)
    const MIN_DAILY = 9.21;
    const finalDaily = Math.max(dailyBenefit, MIN_DAILY);
    const finalMonthly = finalDaily * 21;
    const totalPeriod = finalMonthly * months;
    return {
      main: { label: "Месечно обезщетение", value: fmtEUR(finalMonthly) },
      breakdown: [
        { label: "Среден дневен доход", value: fmtEUR(dailyAvg) },
        { label: "60% от дневния доход", value: fmtEUR(dailyBenefit) },
        { label: "Приложен дневен размер", value: fmtEUR(finalDaily) },
        { label: "Месечно (× 21 раб. дни)", value: fmtEUR(finalMonthly) },
        { label: "Период на изплащане", value: `${months} мес.` },
        { label: "Прогнозен общ размер", value: fmtEUR(totalPeriod) },
      ],
      notes: [
        "Обезщетението е 60% от средния дневен осигурителен доход, но не по-малко от минималния размер, определян от Министерския съвет.",
        "Срокът зависи от осигурителния стаж при последния работодател.",
      ],
    };
  },
  legalBasis: [
    { label: "чл. 54а–54е КСО", url: "https://lex.bg/laws/ldoc/1597824512" },
  ],
  seo: {
    metaDescription:
      "Калкулатор за обезщетение за безработица в EUR. Изчислете месечния размер по чл. 54а КСО според осигурителен доход и стаж.",
    intro:
      "Лицата, останали без работа, имат право на парично обезщетение за безработица в размер на 60% от средния осигурителен доход за последните 24 месеца. Срокът зависи от осигурителния стаж за безработица.",
    howItWorks:
      "Калкулаторът разделя средния месечен осигурителен доход на 21 работни дни, взема 60% от резултата и проверява спрямо законовия минимум. След това умножава по броя дни в съответния период.",
    faq: [
      {
        q: "От кога започва да тече обезщетението?",
        a: "От датата на прекратяване на трудовия договор, ако се регистрирате в Бюрото по труда в 7-дневен срок и подадете заявление в НОИ в 3-месечен срок.",
      },
      {
        q: "Имам ли право, ако сам напусна работа?",
        a: "Да, но в по-малък размер — минималния по КСО (около 9.21 EUR на ден за 2026 г.) за период от 4 месеца, независимо от стажа.",
      },
      {
        q: "Облага ли се обезщетението?",
        a: "Не. Паричното обезщетение за безработица не подлежи на облагане с данък върху доходите.",
      },
    ],
  },
};
