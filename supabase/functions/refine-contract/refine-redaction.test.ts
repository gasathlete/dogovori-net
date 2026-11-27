import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  answersToText,
  REFINE_FIELD_SEPARATOR,
  redactRefinePayload,
  RefineRedactionError,
} from "./refine-redaction.ts";

const payload = {
  contractJson: '{"party":"Иван Петров"}',
  feedback: "Иван Петров да отпадне",
  answersText: "- name: Мария Георгиева",
};

/** Двойник с ЕДИН общ брояч — така сблъсък на плейсхолдъри би се проявил. */
function fakeRedact(text: string) {
  const mapping: Record<string, string> = {};
  let n = 0;
  const seen = new Map<string, string>();
  const redacted = text.replace(/[А-Я][а-я]+ [А-Я][а-я]+/g, (m) => {
    const token = seen.get(m) ?? `<NAME_${++n}>`;
    seen.set(m, token);
    mapping[token] = m;
    return token;
  });
  return { redacted, mapping };
}

Deno.test("една редакция за трите полета — общи, несблъскващи се плейсхолдъри", () => {
  const r = redactRefinePayload(payload, fakeRedact);
  assertEquals(r.contractJson, '{"party":"<NAME_1>"}');
  assertEquals(r.feedback, "<NAME_1> да отпадне");
  // Различен човек НИКОГА не получава същия плейсхолдър.
  assertEquals(r.answersText, "- name: <NAME_2>");
  assertEquals(r.mapping["<NAME_1>"], "Иван Петров");
  assertEquals(r.mapping["<NAME_2>"], "Мария Георгиева");
});

Deno.test("отговорите от интервюто също минават през редакция", () => {
  const r = redactRefinePayload(payload, fakeRedact);
  assertEquals(r.answersText.includes("Мария"), false);
});

Deno.test("без изискване за редакция текстът минава непроменен", () => {
  const r = redactRefinePayload(payload, null);
  assertEquals(r.contractJson, payload.contractJson);
  assertEquals(r.feedback, payload.feedback);
  assertEquals(r.answersText, payload.answersText);
  assertEquals(r.mapping, {});
});

Deno.test("служебният разделител в товара се отказва ПРЕДИ таксуване", () => {
  assertThrows(
    () =>
      redactRefinePayload(
        { ...payload, feedback: `x${REFINE_FIELD_SEPARATOR}y` },
        fakeRedact,
      ),
    RefineRedactionError,
    "separator_in_payload",
  );
});

Deno.test("загубена граница при редакция е грешка, не смесени полета", () => {
  assertThrows(
    () => redactRefinePayload(payload, () => ({ redacted: "само едно поле", mapping: {} })),
    RefineRedactionError,
    "redaction_boundary_lost",
  );
});

Deno.test("отговорите се сериализират детерминирано и без сурови обекти", () => {
  assertEquals(
    answersToText({ b: "2", a: "1", c: { x: 1 }, d: null }),
    '- a: 1\n- b: 2\n- c: {"x":1}',
  );
  assertEquals(answersToText(null), "");
});
