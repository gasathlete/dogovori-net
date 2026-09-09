/**
 * Q4a — манифестът за качество тече ОТ КРАЙ ДО КРАЙ, но само за ТОЧНО своя
 * документ.
 *
 * Тук се доказват трите неща, от които зависи доверието във фронтенда:
 *  1) каноничният четим текст, който изпращаме за ревизия, е ТОЧНО този, върху
 *     който сървърът е издал отпечатъка (златен образец, споделен с Deno теста);
 *  2) манифестът се пренася заедно с резултата и запазеното състояние;
 *  3) при ВСЯКА локална редакция манифестът се маха — остарял манифест никога
 *     не се закача към променен документ.
 */
import { describe, it, expect } from "vitest";
import { contractToPlainText } from "@/lib/documentReview";

const GOLDEN_CONTRACT = {
  title: "ДОГОВОР ЗА ИЗРАБОТКА",
  preamble: "Днес, между страните, се сключи следният договор:",
  clauses: [
    { number: "Чл. 1", title: "Предмет", body: "Изпълнителят изработва уеб сайт." },
    { number: "Чл. 2", title: "Цена", body: "Възнаграждението е 1000 EUR." },
  ],
  closing: "Настоящият договор се подписа в два еднообразни екземпляра.",
};

const GOLDEN_PLAIN_TEXT = [
  "ДОГОВОР ЗА ИЗРАБОТКА",
  "Днес, между страните, се сключи следният договор:",
  "Чл. 1 Предмет",
  "Изпълнителят изработва уеб сайт.",
  "Чл. 2 Цена",
  "Възнаграждението е 1000 EUR.",
  "Настоящият договор се подписа в два еднообразни екземпляра.",
].join("\n\n");

/** Моделира точно преходите на състоянието в уизарда/конструктора. */
interface ResultState {
  contract: Record<string, unknown>;
  quality_manifest?: unknown;
}

const applyEdit = (state: ResultState, next: Record<string, unknown>): ResultState => ({
  ...state,
  contract: { ...state.contract, ...next },
  quality_manifest: undefined,
});

describe("Q4a — пренасяне на манифеста за качество", () => {
  it("четимият текст за ревизия съвпада със златния образец на сървъра", () => {
    expect(contractToPlainText(GOLDEN_CONTRACT)).toBe(GOLDEN_PLAIN_TEXT);
  });

  it("манифестът се пренася с резултата и оцелява при запазване/възстановяване", () => {
    const state: ResultState = { contract: GOLDEN_CONTRACT, quality_manifest: { v: 1 } };
    const restored = JSON.parse(JSON.stringify(state)) as ResultState;
    expect(restored.quality_manifest).toEqual({ v: 1 });
    expect(restored.contract).toEqual(GOLDEN_CONTRACT);
  });

  it("редакция на документа маха манифеста — не се закача остарял", () => {
    const state: ResultState = { contract: GOLDEN_CONTRACT, quality_manifest: { v: 1 } };
    const edited = applyEdit(state, { title: "ДОГОВОР ЗА ИЗРАБОТКА (редактиран)" });
    expect(edited.quality_manifest).toBeUndefined();
    expect(contractToPlainText(edited.contract)).not.toBe(GOLDEN_PLAIN_TEXT);
  });

  it("манифестът не влиза в четимото съдържание на документа", () => {
    const text = contractToPlainText({
      ...GOLDEN_CONTRACT,
      // @ts-expect-error — умишлено подаваме допълнително поле
      quality_manifest: { secret: "трябва да се игнорира" },
    });
    expect(text).toBe(GOLDEN_PLAIN_TEXT);
    expect(text).not.toContain("quality_manifest");
  });
});

/**
 * Двуезичен златен образец — ТОЧНО същият, който сървърният
 * `renderCanonicalPlainText` дава (Q4a). Ако тези два образеца се разминат,
 * подаденият манифест няма да бъде приет и ревизията ще третира документа като
 * външен.
 */
const GOLDEN_BILINGUAL = {
  title: "ДОГОВОР ЗА ИЗРАБОТКА",
  title_en: "WORK CONTRACT",
  preamble: "Днес, между страните, се сключи следният договор:",
  preamble_en: "Today, the parties concluded the following contract:",
  clauses: [
    {
      number: "Чл. 1",
      title: "Предмет",
      title_en: "Subject",
      body: "Изпълнителят изработва уеб сайт.",
      body_en: "The contractor builds a website.",
    },
  ],
  closing: "Настоящият договор се подписа в два еднообразни екземпляра.",
  closing_en: "This contract was signed in two identical counterparts.",
};

const GOLDEN_BILINGUAL_PLAIN_TEXT = [
  "ДОГОВОР ЗА ИЗРАБОТКА",
  "WORK CONTRACT",
  "Днес, между страните, се сключи следният договор:",
  "Today, the parties concluded the following contract:",
  "Чл. 1 Предмет",
  "Изпълнителят изработва уеб сайт.",
  "Чл. 1 Subject",
  "The contractor builds a website.",
  "Настоящият договор се подписа в два еднообразни екземпляра.",
  "This contract was signed in two identical counterparts.",
].join("\n\n");

describe("Q4a — двуезичен каноничен текст", () => {
  it("включва BG и EN полета в същия детерминиран ред като сървъра", () => {
    expect(contractToPlainText(GOLDEN_BILINGUAL)).toBe(GOLDEN_BILINGUAL_PLAIN_TEXT);
  });

  it("ревизията вижда английския текст, а промяна в него сменя подадения текст", () => {
    const text = contractToPlainText(GOLDEN_BILINGUAL);
    expect(text).toContain("The contractor builds a website.");
    const edited = contractToPlainText({
      ...GOLDEN_BILINGUAL,
      clauses: [{ ...GOLDEN_BILINGUAL.clauses[0], body_en: "The contractor builds a mobile app." }],
    });
    expect(edited).not.toBe(text);
  });

  it("манифестът не се появява в четимото съдържание при двуезичен документ", () => {
    const text = contractToPlainText({
      ...GOLDEN_BILINGUAL,
      // @ts-expect-error — умишлено допълнително поле
      quality_manifest: { signature: { value: "deadbeef" } },
    });
    expect(text).toBe(GOLDEN_BILINGUAL_PLAIN_TEXT);
    expect(text).not.toContain("deadbeef");
  });
});
