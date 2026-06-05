import type { Calculator } from "./types";
import { fmtEUR } from "./types";

export const ddsKalkulator: Calculator = {
  slug: "dds-kalkulator",
  title: "ДДС калкулатор (20%)",
  shortTitle: "ДДС калкулатор",
  description:
    "Преобразува между нетна и брутна стойност с включен/добавен ДДС от 20% (или друга ставка).",
  icon: "Calculator",
  fields: [
    {
      key: "mode",
      label: "Режим",
      type: "select",
      default: "add",
      options: [
        { value: "add", label: "Добави ДДС върху нетна сума" },
        { value: "extract", label: "Извади ДДС от брутна сума" },
      ],
    },
    {
      key: "amount",
      label: "Сума",
      type: "number",
      unit: "EUR",
      min: 0,
      step: 0.01,
      default: 100,
    },
    {
      key: "rate",
      label: "Ставка ДДС",
      type: "select",
      default: "20",
      options: [
        { value: "20", label: "20% (стандартна)" },
        { value: "9", label: "9% (туристически услуги, книги)" },
        { value: "0", label: "0% (износ, ВОД)" },
      ],
    },
  ],
  compute: ({ mode, amount, rate }) => {
    const a = Number(amount) || 0;
    const r = Number(rate) || 0;
    if (mode === "add") {
      const vat = (a * r) / 100;
      const gross = a + vat;
      return {
        main: { label: "Сума с ДДС", value: fmtEUR(gross) },
        breakdown: [
          { label: "Нетна сума", value: fmtEUR(a) },
          { label: `ДДС (${r}%)`, value: fmtEUR(vat) },
          { label: "Брутна сума", value: fmtEUR(gross) },
        ],
      };
    } else {
      const net = a / (1 + r / 100);
      const vat = a - net;
      return {
        main: { label: "Нетна сума", value: fmtEUR(net) },
        breakdown: [
          { label: "Брутна сума (с ДДС)", value: fmtEUR(a) },
          { label: `Включен ДДС (${r}%)`, value: fmtEUR(vat) },
          { label: "Нетна сума", value: fmtEUR(net) },
        ],
      };
    }
  },
  legalBasis: [{ label: "ЗДДС", url: "https://lex.bg/laws/ldoc/2135533201" }],
  seo: {
    metaDescription:
      "Безплатен онлайн ДДС калкулатор в EUR — добави или извади 20% ДДС от сума. Стандартна и намалена ставка.",
    intro:
      "В България стандартната ставка на ДДС е 20%. За определени услуги (туризъм, книги) се прилага намалена ставка от 9%. Износ извън ЕС и вътреобщностни доставки са с 0%.",
    howItWorks:
      "За добавяне на ДДС: бруто = нето × (1 + 0.20). За изваждане от брутна сума: нето = бруто ÷ 1.20.",
    faq: [
      {
        q: "Кога се прилага намалена ставка от 9%?",
        a: "За настаняване в хотели, ресторантьорски услуги, книги, бебешки храни и други стоки, изрично посочени в ЗДДС.",
      },
      {
        q: "Длъжен ли съм да се регистрирам по ЗДДС?",
        a: "При оборот над 166 000 EUR (≈ 100 000 BGN) за 12 последователни месеца. Възможна е и доброволна регистрация.",
      },
      {
        q: "Внасям ли ДДС при доставка в ЕС?",
        a: "За B2B вътреобщностни доставки се прилага 0% ставка при условие, че получателят има валиден VAT номер.",
      },
    ],
  },
};
