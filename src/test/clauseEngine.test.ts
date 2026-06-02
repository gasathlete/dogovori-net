import { describe, it, expect } from "vitest";
import { assembleDocument, diffInclusion, type ClauseDefinition } from "@/lib/clauseEngine";

const clauses: ClauseDefinition[] = [
  { clause_id: "intro", template_slug: "t", title: "Преамбюл", order: 1,
    body_md: "Между {{employer.name}} и {{employee.name}}." },
  { clause_id: "probation", template_slug: "t", title: "Изпитателен срок", order: 2,
    body_md: "Срок: {{probation_months}} месеца.", include_when: "has_probation == true" },
  { clause_id: "nda", template_slug: "t", title: "Поверителност", order: 3,
    body_md: "Конфиденциална информация...", include_when: "sector in ['it','finance']" },
];

describe("clauseEngine.assembleDocument", () => {
  it("includes clauses whose predicate is truthy and substitutes tokens", () => {
    const out = assembleDocument(clauses, {
      employer: { name: "Acme EOOD" },
      employee: { name: "Иван Петров" },
      has_probation: true,
      probation_months: 6,
      sector: "it",
    });
    expect(out.clauses.map((c) => c.clause_id)).toEqual(["intro", "probation", "nda"]);
    expect(out.body_md).toContain("Acme EOOD");
    expect(out.body_md).toContain("6 месеца");
    expect(out.unfilledTokens).toEqual([]);
  });

  it("excludes clauses whose predicate is false", () => {
    const out = assembleDocument(clauses, {
      employer: { name: "Acme" }, employee: { name: "X" },
      has_probation: false, sector: "retail",
    });
    expect(out.clauses.map((c) => c.clause_id)).toEqual(["intro"]);
    expect(out.excluded.map((c) => c.clause_id).sort()).toEqual(["nda", "probation"]);
  });

  it("reports unfilled tokens with a placeholder", () => {
    const out = assembleDocument(clauses, { has_probation: false, sector: "retail" });
    expect(out.unfilledTokens.sort()).toEqual(["employee.name", "employer.name"]);
    expect(out.body_md).toContain("_______");
  });
});

describe("clauseEngine.diffInclusion", () => {
  it("reports added/removed clauses between answer sets", () => {
    const before = { has_probation: false, sector: "retail" };
    const after = { has_probation: true, sector: "it" };
    const diff = diffInclusion(clauses, before, after);
    expect(diff.added.sort()).toEqual(["nda", "probation"]);
    expect(diff.removed).toEqual([]);
  });
});
