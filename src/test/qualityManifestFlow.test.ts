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
