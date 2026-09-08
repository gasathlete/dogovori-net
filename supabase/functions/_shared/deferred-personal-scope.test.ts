// Тестове за консервативния обхват на "отложени локални лични полета".
// Изпълнение: deno test supabase/functions/_shared/deferred-personal-scope.test.ts
// Всички данни са синтетични — без реални документи, AI или мрежа.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  DEFERRED_NOTE,
  extractPlaceholderTokens,
  isDeferredLocalPlaceholder,
  softenDeferredCheck,
} from "./deferred-personal-scope.ts";

const DOC = [
  "ДОГОВОР ЗА ИЗРАБОТКА",
  "Между [Име] с ЕГН [ЕГН], адрес [Адрес], и Бета ООД, ЕИК [ЕИК].",
  "Чл. 1. Възнаграждението е 1200 лева, платимо до 05.05.2026 г.",
  "Чл. 2. Договорът приключва на 01.04.2026 г.",
  "Чл. 3. Плащане по банкова сметка [IBAN].",
  "Дата: 10.01.2026 г.  Подписи: ____________",
].join("\n");

Deno.test("токени: разпознава само пълни [..] / {{..}} етикети", () => {
  assertEquals(extractPlaceholderTokens("Липсва [ЕГН] и [Адрес]"), ["егн", "адрес"]);
  assertEquals(extractPlaceholderTokens("{{IBAN}}"), ["iban"]);
  assertEquals(extractPlaceholderTokens("няма токени тук"), []);
});

Deno.test("отложено: буквален [ЕГН] / [Адрес] в текста се разпознава", () => {
  assert(isDeferredLocalPlaceholder("Непопълнено поле [ЕГН]", DOC));
  assert(isDeferredLocalPlaceholder("[Адрес]", DOC));
  assert(isDeferredLocalPlaceholder("[ЕИК]", DOC));
});

Deno.test("отложено: токен, който НЕ е в документа, не се разпознава", () => {
  assertEquals(isDeferredLocalPlaceholder("[Телефон]", DOC), false);
  assertEquals(isDeferredLocalPlaceholder("[Имейл]", DOC), false);
});

Deno.test("отложено: вграден/частичен токен не се разпознава", () => {
  const doc = "Между [ЕГН-НОМЕР] и [Име и адрес по лична карта].";
  assertEquals(isDeferredLocalPlaceholder("[ЕГН]", doc), false);
  assertEquals(isDeferredLocalPlaceholder("[Адрес]", doc), false);
});

Deno.test("отложено: без placeholder токен → запазва се", () => {
  assertEquals(isDeferredLocalPlaceholder("Липсва ЕГН на изпълнителя", DOC), false);
  assertEquals(isDeferredLocalPlaceholder("Подписите липсват", DOC), false);
});

Deno.test("същностни рискове остават дори при токен за лично поле", () => {
  // конфликт плащане/краен срок
  assertEquals(
    isDeferredLocalPlaceholder(
      "Срокът за плащане 05.05.2026 е след крайната дата 01.04.2026 — противоречие; [ЕГН]",
      DOC,
    ),
    false,
  );
  // грешно наименование на страна
  assertEquals(
    isDeferredLocalPlaceholder("В чл. 4 страната е Гама ООД, различно от Бета ООД [Име]", DOC),
    false,
  );
  // липсващи подписи / форма
  assertEquals(
    isDeferredLocalPlaceholder("Липсват задължителни подписи и нотариална заверка [Име]", DOC),
    false,
  );
  // несъответствие на банкова сметка
  assertEquals(
    isDeferredLocalPlaceholder("Банковата сметка в чл. 3 не съвпада с тази в чл. 5 [IBAN]", DOC),
    false,
  );
  // смесен случай: празно поле + противоречие
  assertEquals(
    isDeferredLocalPlaceholder("[Адрес] е празен и валутата се сменя от лева на евро", DOC),
    false,
  );
  // дати и срокове никога не са отложени
  assertEquals(isDeferredLocalPlaceholder("[Дата]", `${DOC}\n[Дата]`), false);
  assertEquals(isDeferredLocalPlaceholder("[Подпис]", `${DOC}\n[Подпис]`), false);
});

Deno.test("редакционни токени не са отложени полета", () => {
  const doc = "Страна <EGN_1> и <NAME_2>. [EGN_1] [NAME_2]";
  assertEquals(isDeferredLocalPlaceholder("[EGN_1]", doc), false);
  assertEquals(isDeferredLocalPlaceholder("[NAME_2]", doc), false);
});

Deno.test("проверките не се трият: fail заради отложено поле → warn с бележка", () => {
  const out = softenDeferredCheck(
    { id: "danni", label: "Проверка на [ЕГН]", status: "fail", note: "Полето е празно" },
    DOC,
  );
  assertEquals(out.status, "warn");
  assert(String(out.note).includes(DEFERRED_NOTE));
  assertEquals(out.id, "danni");
});

Deno.test("критични проверки остават fail", () => {
  const check = {
    id: "forma_i_deystvitelnost",
    label: "Форма и действителност",
    status: "fail",
    note: "Липсва нотариална заверка по чл. 129, ал. 2 ТЗ",
  };
  assertEquals(softenDeferredCheck(check, DOC).status, "fail");

  const conflict = {
    id: "sroko​ve",
    label: "Срокове",
    status: "fail",
    note: "Крайната дата 01.04.2026 противоречи на плащане до 05.05.2026",
  };
  assertEquals(softenDeferredCheck(conflict, DOC).status, "fail");
});

Deno.test("pass/warn проверки остават непроменени", () => {
  const c = { id: "x", status: "warn", note: "[ЕГН]" };
  assertEquals(softenDeferredCheck(c, DOC), c);
});
