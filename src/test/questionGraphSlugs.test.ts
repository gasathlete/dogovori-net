import { describe, it, expect } from "vitest";
import { QUESTION_GRAPHS } from "@/data/questionGraphs/dogovor-za-naem-na-zhilishte";
import { DYNAMIC_GRAPH_SLUGS } from "@/data/questionGraphs/slugs.generated";

/**
 * Генерираният списък се използва в `Catalog`, за да не се зареждат целите
 * question graphs. Тестът гарантира, че не се разминава с регистъра.
 */
describe("DYNAMIC_GRAPH_SLUGS", () => {
  it("съдържа точно slug-овете от QUESTION_GRAPHS", () => {
    expect([...DYNAMIC_GRAPH_SLUGS].sort()).toEqual(Object.keys(QUESTION_GRAPHS).sort());
  });
});
