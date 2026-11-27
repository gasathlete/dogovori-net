import { describe, it, expect } from "vitest";
import { buildTypeSkeleton } from "@/lib/typeSkeletons";
import { inferDocumentType } from "@/lib/documentTypeInference";

const FORBIDDEN = [
  "Страна Б",
  "възнаграждение",
  "ДДС",
  "неустойк",
  "форсмажор",
  "непреодолима сила",
  "арбитраж",
  "сключи настоящият договор",
  "плащане",
  "цена",
];

function text(s: NonNullable<ReturnType<typeof buildTypeSkeleton>>) {
  return [...s.preambleLines, ...s.clauses.map((c) => `${c.title}\n${c.body}`)].join("\n");
}

describe("unilateral application skeleton", () => {
  it("Молба за напускане (чл. 326, ал. 1 КТ) → one-sided skeleton", () => {
    const s = buildTypeSkeleton(undefined, "Иван Иванов", "", "Молба за напускане (чл. 326, ал. 1 КТ)");
    expect(s).toBeTruthy();
    const t = text(s!);
    expect(t).toMatch(/ДО \[АДРЕСАТ/);
    expect(t).toMatch(/Изявление \/ искане/);
    expect(t).toMatch(/Дата и подпис/);
    for (const bad of FORBIDDEN) {
      expect(t.toLowerCase()).not.toContain(bad.toLowerCase());
    }
    // exactly one signature line
    expect(t.match(/Подпис/g)?.length).toBe(1);
  });

  it("generic Заявление / Уведомление / Искане are one-sided", () => {
    for (const name of ["Заявление за платен отпуск", "Уведомление за прекратяване", "Искане за издаване на документ"]) {
      const s = buildTypeSkeleton(null, "Иван Иванов", "", name);
      expect(s, name).toBeTruthy();
      expect(text(s!)).not.toContain("Страна Б");
    }
  });

  it("Споразумение remains a two-party agreement skeleton", () => {
    const s = buildTypeSkeleton(undefined, "А", "Б", "Споразумение за прекратяване на наем по взаимно съгласие");
    expect(s).toBeTruthy();
    const t = text(s!);
    expect(t).toMatch(/СПОРАЗУМЕНИЕ/);
    expect(t).toMatch(/Страна Б/);
  });

  it("ordinary contract still falls back to the sector-generic skeleton (null)", () => {
    expect(buildTypeSkeleton(undefined, "А", "Б", "Договор за наем на жилище")).toBeNull();
    expect(buildTypeSkeleton("contract", "А", "Б", "Договор за изработка")).toBeNull();
  });

  it("specialised types keep their own skeletons", () => {
    const decl = buildTypeSkeleton(undefined, "А", "", "Декларация по чл. 313 НК");
    expect(text(decl!)).toMatch(/ДЕКЛАРАЦИЯ удостоверявам/);
    const compl = buildTypeSkeleton(undefined, "А", "Б", "Жалба срещу наказателно постановление");
    expect(text(compl!)).toMatch(/ЖАЛБА/);
    const claim = buildTypeSkeleton(undefined, "А", "Б", "Искова молба за неплатено възнаграждение");
    expect(text(claim!)).toMatch(/ИСКОВА МОЛБА/);
  });
});

describe("contract-head inference (Cyrillic-safe boundary)", () => {
  it("SLA maintenance contract is a contract, not an appendix", () => {
    expect(inferDocumentType("Договор за поддръжка на софтуер/хардуер (SLA)")).toBe("contract");
    expect(inferDocumentType("Рамков договор за SLA услуги")).toBe("contract");
    expect(inferDocumentType("Договор")).toBe("contract");
  });

  it("titles that merely start with SLA remain appendix", () => {
    expect(inferDocumentType("SLA с платежен оператор / банка")).toBe("appendix");
  });

  it("catalog SLA contract renders as a contract skeleton", () => {
    const name = "Договор за поддръжка на софтуер/хардуер (SLA)";
    const s = buildTypeSkeleton(undefined, "А", "Б", name);
    if (s) {
      const t = text(s);
      expect(t).not.toContain("ПРИЛОЖЕНИЕ №");
      expect(t).not.toContain("неразделна част от основния договор");
    } else {
      expect(s).toBeNull();
    }
  });
});
