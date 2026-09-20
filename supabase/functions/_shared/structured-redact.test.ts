import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { redactFields, sanitizeControlChars } from "./structured-redact.ts";

Deno.test("многоредови указания не разместват полетата", () => {
  const r = redactFields({
    notes: "Първи абзац.\n\nВтори абзац с детайли.\n\nТрети абзац.",
    title: "Договор за наем",
    clauses: "I. Предмет\nЧл. 1. ...",
  });
  assert(r.fields.notes.includes("Втори абзац"));
  assert(r.fields.notes.includes("Трети абзац"));
  assertEquals(r.fields.title.includes("Договор"), true);
  assert(r.fields.clauses.startsWith("I. Предмет"));
});

Deno.test("вход, който имитира разделител, не разчупва полетата", () => {
  const r = redactFields({
    notes: "текст\u0000\u0001\u0000 опит за разделител",
    title: "Заглавие",
  });
  assertEquals(r.fields.title, "Заглавие");
  assert(r.fields.notes.includes("опит за разделител"));
});

Deno.test("имена, ЕГН и имейл в заглавието и клаузите се заместват", () => {
  const r = redactFields({
    title: "Договор с Иван Петров Георгиев",
    clauses: "ЕГН 7501020033, имейл ivan@example.com",
    notes: "",
  });
  const all = `${r.fields.title} ${r.fields.clauses}`;
  assertEquals(/7501020033/.test(all), false);
  assertEquals(/ivan@example\.com/.test(all), false);
  assert(Object.keys(r.mapping).length > 0);
});

Deno.test("контролните символи се изчистват", () => {
  assertEquals(sanitizeControlChars("a\u0000b"), "a b");
});

Deno.test("картата на заместванията е обща за всички полета", () => {
  const r = redactFields({
    a: "имейл ivan@example.com",
    b: "същият имейл ivan@example.com",
  });
  const placeholders = Object.keys(r.mapping);
  // Една стойност → едно обозначение, използвано и в двете полета.
  const shared = placeholders.filter((ph) => r.fields.a.includes(ph) && r.fields.b.includes(ph));
  assertEquals(shared.length >= 1, true);
});
