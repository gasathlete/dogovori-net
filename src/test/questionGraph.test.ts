import { describe, it, expect } from "vitest";
import { resolveGraph, pruneAnswers, type QuestionGraph } from "@/lib/questionGraph";

const graph: QuestionGraph = {
  template_slug: "test",
  title: "Test",
  sections: [
    { id: "basics", title: "Basics" },
    { id: "details", title: "Details" },
  ],
  questions: [
    { id: "type", section: "basics", label: "Type", field_type: "select", required_when: "true",
      options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
    { id: "a_detail", section: "details", label: "A detail", field_type: "text",
      visible_when: "type == 'a'", required_when: "type == 'a'" },
    { id: "b_detail", section: "details", label: "B detail", field_type: "text",
      visible_when: "type == 'b'", required_when: "type == 'b'" },
    { id: "optional_note", section: "details", label: "Note", field_type: "text" },
  ],
};

describe("questionGraph.resolveGraph", () => {
  it("hides branches based on answers", () => {
    const r = resolveGraph(graph, { type: "a" });
    expect(r.active.map((q) => q.id)).toEqual(["type", "a_detail", "optional_note"]);
  });

  it("computes progress against required-visible questions only", () => {
    // optional_note is visible but not required, so it doesn't affect progress
    const r1 = resolveGraph(graph, { type: "a" });
    expect(r1.missingRequired).toEqual(["a_detail"]);
    expect(r1.progress).toBe(50);

    const r2 = resolveGraph(graph, { type: "a", a_detail: "filled" });
    expect(r2.missingRequired).toEqual([]);
    expect(r2.progress).toBe(100);
    expect(r2.isComplete).toBe(true);
  });

  it("groups questions into sections, including always-visible optional ones", () => {
    // optional_note has no visible_when => always visible => details section appears
    const r = resolveGraph(graph, {});
    expect(r.sections.map((s) => s.id)).toEqual(["basics", "details"]);
    expect(r.sections.find((s) => s.id === "details")?.questions.map((q) => q.id))
      .toEqual(["optional_note"]);
  });
});

describe("questionGraph.pruneAnswers", () => {
  it("drops answers from now-hidden branches", () => {
    const pruned = pruneAnswers(graph, { type: "a", b_detail: "stale", a_detail: "ok" });
    expect(pruned).toEqual({ type: "a", a_detail: "ok" });
  });
});
