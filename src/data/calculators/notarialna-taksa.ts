import type { Calculator } from "./types";
import { fmtEUR } from "./types";

// Тарифа №1 към ЗДТ — нотариална такса за удостоверяване на сделка по материален интерес (опростено в EUR).
function notaryFeeOnAmount(amount: number): number {
  // Преизчислено от BGN тарифата в EUR (≈ /1.95583). Скали по интервали.
  if (amount <= 50) return 15;
  if (amount <= 500) return 15 + (amount - 50) * 0.015;
  if (amount <= 5000) return 22 + (amount - 500) * 0.01;
  if (amount <= 50000) return 67 + (amount - 5000) * 0.005;
  if (amount <= 500000) return 292 + (amount - 50000) * 0.002;
  return 1192 + (amount - 500000) * 0.001;
}

export const notarialnaTaksa: Calculator = {
  slug: "notarialna-taksa",
  title: "Калкулатор за нотариална такса",
  shortTitle: "Нотариална такса",
  description:
    "Изчислява нотариална такса по Тарифа №1 към ЗДТ — заверка на подпис или удостоверяване на сделка.",
  icon: "Stamp",
  fields: [
    {
      key: "mode",
      label: "Вид нотариално действие",
      type: "select",
      default: "signature",
      options: [
        { value: "signature", label: "Заверка на подпис" },
        { value: "content", label: "Заверка на подпис и съдържание" },
        { value: "deal", label: "Удостоверяване на сделка (по материален интерес)" },
      ],
    },
    {
      key: "count",
      label: "Брой подписи / документи",
      type: "number",
      min: 1,
      max: 50,
      step: 1,
      default: 1,
      help: "Прилага се при заверка на подпис.",
    },
    {
      key: "amount",
      label: "Материален интерес (за сделка)",
      type: "number",
      unit: "EUR",
      min: 0,
      step: 1,
      default: 85000,
      help: "Сумата на сделката — само при удостоверяване на сделка. Например: апартамент на стойност 85 000.00 EUR.",
    },
  ],
  compute: ({ mode, count, amount }) => {
    const c = Math.max(1, Number(count) || 1);
    const a = Number(amount) || 0;
    let fee = 0;
    let formula = "";
    if (mode === "signature") {
      fee = c * 6;
      formula = `${c} × 6.00 EUR`;
    } else if (mode === "content") {
      fee = c * 12;
      formula = `${c} × 12.00 EUR`;
    } else {
      fee = notaryFeeOnAmount(a);
      formula = `по Тарифа №1, чл. 8`;
    }
    return {
      main: { label: "Нотариална такса", value: fmtEUR(fee) },
      breakdown: [
        { label: "Вид действие", value: mode === "signature" ? "Заверка на подпис" : mode === "content" ? "Заверка подпис + съдържание" : "Удостоверяване на сделка" },
        { label: "Изчисление", value: formula },
        { label: "Общо (без ДДС)", value: fmtEUR(fee) },
        { label: "С ДДС 20%", value: fmtEUR(fee * 1.2) },
      ],
      notes: [
        "Нотариалните такси са без ДДС в Тарифата. Нотариусите начисляват 20% ДДС върху възнаграждението си.",
        "За определени действия (декларации за пътуване на дете) се прилага намалена такса.",
      ],
    };
  },
  legalBasis: [
    {
      label: "Тарифа №1 към ЗДТ",
      url: "https://lex.bg/laws/ldoc/2134890498",
    },
  ],
  seo: {
    metaDescription:
      "Калкулатор за нотариална такса в EUR по Тарифа №1 към ЗДТ. Изчислете заверка на подпис или сделка за секунди.",
    intro:
      "Нотариалните такси в България се определят от Тарифа №1 към Закона за нотариусите. Тарифата е твърда за заверки на подпис и пропорционална за сделки с материален интерес.",
    howItWorks:
      "За заверка на подпис калкулаторът умножава броя подписи по 6 EUR. За удостоверяване на сделка се прилагат прогресивни ставки според размера на сделката.",
    faq: [
      {
        q: "Включва ли цената ДДС?",
        a: "Не. Стойностите по Тарифа №1 са без ДДС. Нотариусите начисляват допълнително 20% ДДС.",
      },
      {
        q: "Колко струва заверката на пълномощно?",
        a: "Около 6 EUR за един подпис. За пълномощно с двама декларатори — около 12 EUR.",
      },
      {
        q: "Има ли отстъпки за пенсионери или социално слаби?",
        a: "Не. Тарифата е еднаква за всички. При социална нужда може да се иска освобождаване от съд.",
      },
    ],
  },
};
