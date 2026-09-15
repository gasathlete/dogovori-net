import { describe, it, expect } from "vitest";
import { selectedClauseText, splitClauseSegments } from "@/lib/manualClauseSegments";

const SOURCE = [
  "ДОГОВОР ЗА НАЕМ НА ЖИЛИЩЕ",
  "",
  "Чл. 1. Наемодателят предоставя на наемателя апартамент в гр. София.",
  "Чл. 2. Наемната цена е 800 евро месечно, платима до 5-о число.",
  "",
  "кратко",
].join("\n");

describe("splitClauseSegments", () => {
  it("разделя по клаузи и връща дословен текст", () => {
    const segments = splitClauseSegments(SOURCE);
    expect(segments.length).toBe(3);
    expect(segments[1].text).toContain("Чл. 1.");
    expect(segments[2].text).toContain("Чл. 2.");
  });

  it("извадките съвпадат точно с източника по позиция", () => {
    const chars = Array.from(SOURCE);
    for (const segment of splitClauseSegments(SOURCE)) {
      expect(chars.slice(segment.start, segment.end).join("")).toBe(segment.text);
    }
  });

  it("пропуска твърде кратки части", () => {
    expect(splitClauseSegments(SOURCE).some((s) => s.text.trim() === "кратко")).toBe(false);
  });

  it("избраните клаузи се връщат в реда на документа", () => {
    const segments = splitClauseSegments(SOURCE);
    const text = selectedClauseText(segments, new Set([segments[2].id, segments[1].id]));
    expect(text.indexOf("Чл. 1.")).toBeLessThan(text.indexOf("Чл. 2."));
  });

  it("празен документ не дава части", () => {
    expect(splitClauseSegments("   \n\n  ")).toEqual([]);
  });
});
