import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveEvidence } from "./product-evidence.ts";

const SOURCE = "ДОГОВОР ЗА НАЕМ\n1. Наемателят плаща месечен наем от 900 евро до 5-о число.\n2. При забава се дължи неустойка 5 % на ден.\n";

Deno.test("кратка, но еднозначна извадка се приема без обявено място", () => {
  const resolved = resolveEvidence(SOURCE, { excerpt: "900 евро" });
  assertEquals(resolved.ok, true);
  if (resolved.ok) {
    assertEquals(SOURCE.slice(resolved.span.start, resolved.span.end), "900 евро");
  }
});

Deno.test("кратка извадка с вярно обявено място се приема", () => {
  const start = Array.from(SOURCE.slice(0, SOURCE.indexOf("5 % на ден"))).length;
  const resolved = resolveEvidence(SOURCE, { excerpt: "5 % на ден", start, end: start + 10 });
  assertEquals(resolved.ok, true);
});

Deno.test("двусмислена извадка се отхвърля", () => {
  const resolved = resolveEvidence("наеми наеми наеми", { excerpt: "наеми" });
  assertEquals(resolved.ok, false);
  if (!resolved.ok) assertEquals(resolved.reason, "excerpt_ambiguous");
});

Deno.test("къса извадка без обявено място се отхвърля", () => {
  const resolved = resolveEvidence("наем наем наем", { excerpt: "наем" });
  assertEquals(resolved.ok, false);
  if (!resolved.ok) assertEquals(resolved.reason, "excerpt_too_short");
});

Deno.test("измислена извадка се отхвърля", () => {
  const resolved = resolveEvidence(SOURCE, { excerpt: "1200 евро месечно" });
  assertEquals(resolved.ok, false);
  if (!resolved.ok) assertEquals(resolved.reason, "excerpt_not_found");
});

Deno.test("твърде кратка извадка се отхвърля", () => {
  const resolved = resolveEvidence(SOURCE, { excerpt: "900" });
  assertEquals(resolved.ok, false);
  if (!resolved.ok) assertEquals(resolved.reason, "excerpt_too_short");
});
