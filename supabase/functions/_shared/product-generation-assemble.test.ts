import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { anchorPassportParties, validateAbsence } from "./product-generation-runtime.ts";

const source = "Договор между Иван Иванов и Мария Петрова. Подписи: Иван Иванов, Мария Петрова. Предизвестие не се предвижда.";

Deno.test("страните получават място от първото буквално срещане", () => {
  const out = anchorPassportParties(
    { parties: [{ name: "Иван Иванов", role: "А", span: { excerpt: "Иван Иванов" } }] },
    source,
  ) as { parties: { span: { start: number; end: number; excerpt: string } }[] };
  const span = out.parties[0].span;
  assertEquals(Array.from(source).slice(span.start, span.end).join(""), "Иван Иванов");
  assertEquals(span.start, Array.from(source.slice(0, source.indexOf("Иван Иванов"))).length);
});

Deno.test("липсващ в източника текст остава без място", () => {
  const out = anchorPassportParties(
    { parties: [{ name: "X", role: "А", span: { excerpt: "Петър Петров" } }] },
    source,
  ) as { parties: { span: Record<string, unknown> }[] };
  assertEquals("start" in out.parties[0].span, false);
});

Deno.test("проверка за отсъствие се изпуска, когато понятието присъства без място", () => {
  const out = validateAbsence(source, [
    { id: "abs_001", concept: "предизвестие", searched_terms: ["предизвестие"], spans: [], found: false },
  ]);
  assertEquals(out.length, 0);
});

Deno.test("действителното отсъствие се запазва с изрична бележка", () => {
  const out = validateAbsence(source, [
    { id: "abs_002", concept: "неустойка", searched_terms: ["неустойка"], spans: [], found: false },
  ]);
  assertEquals(out.length, 1);
  assertEquals(out[0].found, false);
  assertEquals(out[0].spans, []);
  assertEquals(out[0].note, null);
});
