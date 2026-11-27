import { describe, it, expect } from "vitest";
import { evaluateExpression, parseExpression } from "@/lib/expressionEvaluator";

describe("expressionEvaluator", () => {
  it("empty expression is truthy", () => {
    expect(evaluateExpression("", {})).toBe(true);
    expect(evaluateExpression(null, {})).toBe(true);
  });

  it("equality operators", () => {
    expect(evaluateExpression("type == 'permanent'", { type: "permanent" })).toBe(true);
    expect(evaluateExpression("type == 'permanent'", { type: "fixed" })).toBe(false);
    expect(evaluateExpression("type != 'permanent'", { type: "fixed" })).toBe(true);
  });

  it("comparison operators", () => {
    expect(evaluateExpression("salary >= 1000", { salary: 1500 })).toBe(true);
    expect(evaluateExpression("salary < 1000", { salary: 800 })).toBe(true);
    expect(evaluateExpression("salary > 1000", { salary: 1000 })).toBe(false);
  });

  it("logical and/or/not", () => {
    expect(evaluateExpression("a == 1 and b == 2", { a: 1, b: 2 })).toBe(true);
    expect(evaluateExpression("a == 1 and b == 2", { a: 1, b: 3 })).toBe(false);
    expect(evaluateExpression("a == 1 or b == 2", { a: 0, b: 2 })).toBe(true);
    expect(evaluateExpression("not (a == 1)", { a: 2 })).toBe(true);
  });

  it("in operator with list literal", () => {
    expect(evaluateExpression("sector in ['it','finance']", { sector: "it" })).toBe(true);
    expect(evaluateExpression("sector in ['it','finance']", { sector: "retail" })).toBe(false);
  });

  it("dotted paths and length", () => {
    expect(evaluateExpression("parties.length > 1", { parties: [1, 2] })).toBe(true);
    expect(evaluateExpression("user.profile.age >= 18", { user: { profile: { age: 18 } } })).toBe(true);
  });

  it("missing fields are falsy without throwing", () => {
    expect(evaluateExpression("x == 1", {})).toBe(false);
    expect(evaluateExpression("a.b.c == 'x'", {})).toBe(false);
  });

  it("malformed expressions return false (fail-closed)", () => {
    expect(evaluateExpression("a ==", { a: 1 })).toBe(false);
    expect(evaluateExpression("@@@", { a: 1 })).toBe(false);
  });

  it("boolean literals", () => {
    expect(evaluateExpression("active == true", { active: true })).toBe(true);
    expect(evaluateExpression("active == false", { active: false })).toBe(true);
  });

  it("parses precedence: and binds tighter than or", () => {
    // 1==1 or (0==1 and 0==1) => true; without precedence (1==1 or 0==1) and 0==1 => false
    expect(evaluateExpression("1==1 or 0==1 and 0==1", {})).toBe(true);
  });

  it("ast is cached across calls", () => {
    const a = parseExpression("x == 1");
    const b = parseExpression("x == 1");
    expect(a).toBe(b);
  });
});
