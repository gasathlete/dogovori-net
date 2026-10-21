import { describe, expect, it } from "vitest";
import { escapeCell, toCsv } from "../lib/csv";
import { postgrestSubstring } from "../lib/postgrestLiteral";

describe("untrusted navigation and report values", () => {
  it("neutralizes formulas in member names, metadata and consent exports", () => {
    for (const value of ["=1+1", "+cmd", "-cmd", "@SUM(A1)", " \t=HYPERLINK(\"https://evil\")", "\r=1"]) {
      expect(escapeCell(value).replace(/^"/, "")).toMatch(/^'/);
    }
    expect(escapeCell("Иван Петров")).toBe("Иван Петров");
    expect(toCsv([{ name: "=1+1" }], [{ key: "name", label: "Име" }])).toContain("'=1+1");
  });
  it("quotes filter punctuation and keeps Bulgarian search usable", () => {
    expect(postgrestSubstring("наем")).toBe('"%наем%"');
    const attack = 'x,or(user_id.eq.foreign),"';
    expect(JSON.parse(postgrestSubstring(attack))).toBe(`%${attack.replace(/[%*_]/g, " ")}%`);
    expect(postgrestSubstring("*")).toBe('"% %"');
  });
});