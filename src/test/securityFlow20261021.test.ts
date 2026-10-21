import { describe, expect, it } from "vitest";
import { escapeCell, toCsv } from "../lib/csv";
import { postgrestSubstring } from "../lib/postgrestLiteral";
import { requireAppReturnUrl } from "../../supabase/functions/_shared/return-destination";

describe("untrusted navigation and report values", () => {
  it("retains real app checkout paths and Stripe placeholders", () => {
    for (const origin of ["https://dogovori.net", "https://www.dogovori.net", "https://dogovori-net.lovable.app", "http://localhost:8080"]) {
      const value = `${origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`;
      expect(requireAppReturnUrl(value)).toBe(value);
    }
  });
  it("rejects outside, lookalike, credential, protocol and backslash destinations", () => {
    for (const value of ["https://evil.test/r", "https://dogovori.net.evil.test/r", "https://evil@dogovori.net/r", "javascript:alert(1)", "//dogovori.net/r", "https://dogovori.net\\@evil.test", "https://dogovori.net:444/r"]) {
      expect(() => requireAppReturnUrl(value)).toThrow();
    }
  });
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
    expect(JSON.parse(postgrestSubstring(attack))).toBe(`%${attack}%`);
    expect(postgrestSubstring("*")).toBe('"% %"');
  });
});