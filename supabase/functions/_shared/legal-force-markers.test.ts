import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assessChunkForce } from "./legal-force-markers.ts";

const NOW = Date.parse("2026-09-23T00:00:00Z");

Deno.test("действащ откъс без отметки е авторитетен", () => {
  const r = assessChunkForce(
    "Чл. 20. При тълкуването на договорите трябва да се търси действителната обща воля на страните.",
    NOW,
  );
  assert(r.authoritative);
  assertEquals(r.forceClass, "in_force");
});

Deno.test("отменена разпоредба не може да обоснове извод за днешно право", () => {
  for (
    const text of [
      "Чл. 1001а. (Отм. - ДВ, бр. 59 от 2007 г., в сила от 01.03.2008 г.)",
      "Чл. 97. (Отменен с ДВ, бр. 12 от 1993 г.)",
    ]
  ) {
    const r = assessChunkForce(text, NOW);
    assertFalse(r.authoritative, text);
    assertEquals(r.forceClass, "repealed", text);
  }
});

Deno.test("бъдеща разпоредба не е действаща днес", () => {
  const r = assessChunkForce(
    "Чл. 7. (Нова - ДВ, бр. 69 от 2026 г., в сила от 02.04.2027 г.) Търговецът вписва...",
    NOW,
  );
  assertFalse(r.authoritative);
  assertEquals(r.forceClass, "future");
});

Deno.test("изтекла временна разпоредба не е действаща", () => {
  const r = assessChunkForce(
    "§ 5. Разпоредбата се прилага в сила от 09.08.2024 г. до 09.08.2025 г.",
    NOW,
  );
  assertFalse(r.authoritative);
  assertEquals(r.forceClass, "expired");
});

Deno.test("обявена за противоконституционна разпоредба не е авторитетна", () => {
  const r = assessChunkForce(
    "Чл. 129, ал. 3, т. 5 — обявена за противоконституционна с РКС № 9 от 2025 г.",
    NOW,
  );
  assertFalse(r.authoritative);
  assertEquals(r.forceClass, "unconstitutional");
});

Deno.test("неясна отметка за влизане в сила се третира консервативно, без измислена дата", () => {
  const r = assessChunkForce(
    "Чл. 40. (Изм. - ДВ, бр. 100 от 2025 г., в сила от деня на обнародването)",
    NOW,
  );
  assertFalse(r.authoritative);
  assertEquals(r.forceClass, "ambiguous");
  assert(r.markers.length > 0);
});

Deno.test("празен текст е неясен, не действащ", () => {
  const r = assessChunkForce("   ", NOW);
  assertFalse(r.authoritative);
  assertEquals(r.forceClass, "ambiguous");
});

// ---------- Точни откъси от корпуса (доказателства от базата) ----------

Deno.test("КРБ чл. 149 изброява правомощия и остава авторитетен въпреки думата „противоконституционност“", () => {
  const krb149 =
    "(1) Конституционният съд:\n\n1. дава задължителни тълкувания на Конституцията;\n\n" +
    "2. произнася се по искане за установяване на противоконституционност на законите " +
    "и на другите актове на Народното събрание, както и на актовете на президента;";
  const a = assessChunkForce(krb149, NOW);
  assertEquals(a.forceClass, "in_force");
  assertEquals(a.authoritative, true);
});

Deno.test("ЗЗЛД чл. 25з: действаща ал. 1 + противоконституционна ал. 2 е смесен откъс", () => {
  const text =
    "(Нов - ДВ, бр. 17 от 2019 г.) (1) Обработването на лични данни за журналистически цели е законосъобразно. " +
    "(2) (Обявена за противоконституционна с РКС № 8 от 2019 г. - ДВ, бр. 93 от 2019 г.) При разкриване чрез предаване…";
  const a = assessChunkForce(text, NOW);
  assertEquals(a.authoritative, false);
  assertEquals(a.forceClass, "ambiguous");
  assert(a.markers.includes("смесени алинеи"));
});

Deno.test("ТЗ чл. 16: действаща ал. 1 + бъдеща редакция от 2.04.2027 г. не е авторитетен откъс", () => {
  const text =
    "(1) (Изм. - ДВ, бр. 58 от 2003 г., бр. 38 от 2006 г., в сила от 1.07.2007 г.) Прехвърлянето на предприятие се вписва. " +
    "(2) (Нова, бр. 15 от 2018 г., в сила от 16.02.2018 г., изм., бр. 69 от 2026 г., в сила от 2.04.2027 г.) Вписването се извършва след проверка.";
  const a = assessChunkForce(text, NOW);
  assertEquals(a.authoritative, false);
  assertEquals(a.forceClass, "ambiguous");
});

Deno.test("ЗЗП чл. 65: ал. 3 в сила от 5.02.2027 г. прави откъса неавторитетен днес", () => {
  const text =
    "(1) (Изм. – ДВ, бр. 20 от 2022 г., в сила от 28.05.2022 г.) Всяко съобщение за намаление на цените трябва да съдържа предишната цена.\n" +
    "(3) (Изм. – ДВ, бр. 13 от 2026 г., в сила от 5.02.2027 г.) Алинея 2 не се прилага за стоки с кратък срок на годност.";
  assertEquals(assessChunkForce(text, NOW).authoritative, false);
});

Deno.test("ЗЗП чл. 68н: временна разпоредба със срок до 9.08.2027 г. е действаща днес и изтича след срока", () => {
  const text = "Чл. 68н. Разпоредбата се прилага до 9.08.2027 г. за всички търговци.";
  assertEquals(assessChunkForce(text, NOW).forceClass, "in_force");
  // На границата: денят след крайния срок вече е изтекъл.
  assertEquals(assessChunkForce(text, Date.UTC(2027, 7, 10)).forceClass, "expired");
  // Точно в последния ден все още действа.
  assertEquals(assessChunkForce(text, Date.UTC(2027, 7, 9)).forceClass, "in_force");
});

Deno.test("смесени граници член/§ (допълнителни и преходни разпоредби) не са авторитетно цитиране", () => {
  const text =
    "(1) Установяването на нарушенията се извършва по реда на ЗАНН. " +
    "Допълнителни разпоредби § 1. По смисъла на този закон… § 52. В тримесечен срок…";
  const a = assessChunkForce(text, NOW);
  assertEquals(a.authoritative, false);
  assert(a.markers.includes("смесени граници член/§"));
});
