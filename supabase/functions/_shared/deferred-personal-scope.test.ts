// Тестове за консервативния обхват на "отложени локални лични полета".
// Изпълнение: deno test supabase/functions/_shared/deferred-personal-scope.test.ts
// Всички данни са синтетични — без реални документи, AI или мрежа.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyDeferredScopeToCheck,
  DEFERRED_NOTE,
  extractPlaceholderTokens,
  isDeferredLocalPlaceholder,
  shouldDeferItem,
  softenDeferredCheck,
} from "./deferred-personal-scope.ts";

const DOC = [
  "ДОГОВОР ЗА ИЗРАБОТКА",
  "Между [Име] с ЕГН [ЕГН], адрес [Адрес], и Бета ООД, ЕИК [ЕИК].",
  "Чл. 1. Възнаграждението е 1200 лева, платимо до 05.05.2026 г.",
  "Чл. 2. Договорът приключва на 01.04.2026 г.",
  "Чл. 3. Плащане по банкова сметка {{IBAN}}.",
  "Дата: 10.01.2026 г.  Подписи: ____________",
].join("\n");

// ---------- извличане на токени ----------

Deno.test("токени: само цели самостоятелни [..] / {{..}}", () => {
  assertEquals(extractPlaceholderTokens("Липсва [ЕГН] и [Адрес]"), ["егн", "адрес"]);
  assertEquals(extractPlaceholderTokens("{{IBAN}}"), ["iban"]);
  assertEquals(extractPlaceholderTokens("няма токени тук"), []);
});

Deno.test("токени: вложени, слепени и деформирани форми не дават токен", () => {
  assertEquals(extractPlaceholderTokens("[[ЕГН]]"), []);
  assertEquals(extractPlaceholderTokens("x[ЕГН]y"), []);
  assertEquals(extractPlaceholderTokens("{ {ЕГН} }"), []);
  assertEquals(extractPlaceholderTokens("[[ЕГН]"), []);
  assertEquals(extractPlaceholderTokens("[ЕГН]]"), []);
});

Deno.test("токени: пунктуацията в етикета НЕ се маха — [ЕГН:] != [ЕГН]", () => {
  assertEquals(extractPlaceholderTokens("[ЕГН:]"), ["егн:"]);
  assertEquals(isDeferredLocalPlaceholder("[ЕГН:]", DOC), false);
});

// ---------- позитивно разпознаване ----------

Deno.test("отложено: токен сам по себе си", () => {
  assert(isDeferredLocalPlaceholder("[ЕГН]", DOC));
  assert(isDeferredLocalPlaceholder("[Адрес]", DOC));
  assert(isDeferredLocalPlaceholder("{{IBAN}}", DOC));
  assert(isDeferredLocalPlaceholder("[IBAN]", DOC), "формите [..] и {{..}} са еквивалентни");
});

Deno.test("отложено: изрична фраза за празно поле", () => {
  assert(isDeferredLocalPlaceholder("Полето [ЕГН] не е попълнено", DOC));
  assert(isDeferredLocalPlaceholder("Липсва [Адрес]", DOC));
  assert(isDeferredLocalPlaceholder("[Име] и [Адрес] са празни полета", DOC));
});

// ---------- непозната проза → задържане (Q1) ----------

Deno.test("непозната проза с токен НЕ е отложено поле", () => {
  assertEquals(isDeferredLocalPlaceholder("[ЕГН] е подменен", DOC), false);
  assertEquals(isDeferredLocalPlaceholder("[Адрес] предоставя неограничени права", DOC), false);
  assertEquals(isDeferredLocalPlaceholder("[ЕГН] field grants unlimited access", DOC), false);
  assertEquals(isDeferredLocalPlaceholder("[Име] изглежда съмнително", DOC), false);
});

Deno.test("смесено: празно поле + непознато твърдение → задържане", () => {
  assertEquals(
    isDeferredLocalPlaceholder("[ЕГН] не е попълнено и клаузата обезсилва защитата", DOC),
    false,
  );
  assertEquals(
    isDeferredLocalPlaceholder("[Адрес] е празно, но текстът въвежда допълнителни задължения", DOC),
    false,
  );
});

// ---------- същностни рискове ----------

Deno.test("същностни рискове остават дори при токен за лично поле", () => {
  assertEquals(
    isDeferredLocalPlaceholder(
      "Срокът за плащане 05.05.2026 е след крайната дата 01.04.2026 — противоречие; [ЕГН]",
      DOC,
    ),
    false,
  );
  assertEquals(
    isDeferredLocalPlaceholder("В чл. 4 страната е Гама ООД, различно от Бета ООД [Име]", DOC),
    false,
  );
  assertEquals(
    isDeferredLocalPlaceholder("Липсват задължителни подписи и нотариална заверка [Име]", DOC),
    false,
  );
  assertEquals(
    isDeferredLocalPlaceholder("Банковата сметка в чл. 3 не съвпада с тази в чл. 5 [IBAN]", DOC),
    false,
  );
  assertEquals(
    isDeferredLocalPlaceholder("[Адрес] е празен и валутата се сменя от лева на евро", DOC),
    false,
  );
  assertEquals(isDeferredLocalPlaceholder("[Дата]", `${DOC}\n[Дата]`), false);
  assertEquals(isDeferredLocalPlaceholder("[Подпис]", `${DOC}\n[Подпис]`), false);
});

Deno.test("токен, който не е в документа или е без етикет от списъка", () => {
  assertEquals(isDeferredLocalPlaceholder("[Телефон]", DOC), false);
  assertEquals(isDeferredLocalPlaceholder("[Имейл] не е попълнено", DOC), false);
  assertEquals(isDeferredLocalPlaceholder("[Предмет на договора]", `${DOC}\n[Предмет на договора]`), false);
});

Deno.test("без токен → задържане", () => {
  assertEquals(isDeferredLocalPlaceholder("Липсва ЕГН на изпълнителя", DOC), false);
  assertEquals(isDeferredLocalPlaceholder("______", `${DOC}\n______`), false);
});

Deno.test("редакционни токени не са отложени полета", () => {
  const doc = "Страна <EGN_1> и <NAME_2>. [EGN_1] [NAME_2]";
  assertEquals(isDeferredLocalPlaceholder("[EGN_1]", doc), false);
  assertEquals(isDeferredLocalPlaceholder("[NAME_2]", doc), false);
});

Deno.test("нетекстов вход не хвърля", () => {
  assertEquals(isDeferredLocalPlaceholder(null, DOC), false);
  assertEquals(isDeferredLocalPlaceholder("[ЕГН]", null), false);
  assertEquals(isDeferredLocalPlaceholder(undefined, undefined), false);
  assertEquals(isDeferredLocalPlaceholder(42, DOC), false);
});

// ---------- проверки (checks) ----------

Deno.test("проверките не се трият: fail заради празно поле → warn с бележка", () => {
  const out = softenDeferredCheck(
    { id: "lichni_danni", label: "[ЕГН]", status: "fail", note: "Полето е празно" },
    DOC,
  ) as Record<string, unknown>;
  assertEquals(out.status, "warn");
  assert(String(out.note).includes(DEFERRED_NOTE));
  assertEquals(out.id, "lichni_danni");
});

Deno.test("защитен id остава fail, дори при празно поле в label и безобидна бележка", () => {
  const check = {
    id: "forma_i_deystvitelnost",
    label: "[ЕГН]",
    status: "fail",
    note: "Полето е празно",
  };
  assertEquals(softenDeferredCheck(check, DOC), check);
});

Deno.test("произволна бележка се запазва — не се смекчава", () => {
  const check = { id: "lichni_danni", label: "[ЕГН]", status: "fail", note: "Полето е подменено" };
  assertEquals(softenDeferredCheck(check, DOC), check);
});

Deno.test("непознат/липсващ id е защитен", () => {
  const check = { label: "[ЕГН]", status: "fail", note: "не е попълнено" };
  assertEquals(softenDeferredCheck(check, DOC), check);
});

Deno.test("pass/warn проверки остават непроменени", () => {
  const c = { id: "x", status: "warn", note: "[ЕГН]" };
  assertEquals(softenDeferredCheck(c, DOC), c);
});

Deno.test("null/нетекстови записи не се трият и не хвърлят", () => {
  assertEquals(softenDeferredCheck(null, DOC), null);
  assertEquals(softenDeferredCheck(undefined, DOC), undefined);
  assertEquals(softenDeferredCheck("низ", DOC), "низ");
  assertEquals(softenDeferredCheck([1], DOC), [1]);
  const weird = { id: "lichni_danni", status: "fail", label: 5, note: null };
  assertEquals(softenDeferredCheck(weird, DOC), weird);
});

// ---------- флаг ignorePersonalData ----------

Deno.test("ignorePersonalData=false не отлага нищо", () => {
  assertEquals(shouldDeferItem(false, "[ЕГН]", DOC), false);
  const check = { id: "lichni_danni", label: "[ЕГН]", status: "fail", note: "Полето е празно" };
  assertEquals(applyDeferredScopeToCheck(false, check, DOC), check);
});

Deno.test("ignorePersonalData=true отлага само доказаното празно поле", () => {
  assertEquals(shouldDeferItem(true, "[ЕГН]", DOC), true);
  assertEquals(shouldDeferItem(true, "[ЕГН] е подменен", DOC), false);
  const softened = applyDeferredScopeToCheck(
    true,
    { id: "lichni_danni", label: "[ЕГН]", status: "fail", note: "Полето е празно" },
    DOC,
  ) as Record<string, unknown>;
  assertEquals(softened.status, "warn");
});
