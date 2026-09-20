import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildRefineSource, redactRefinePayload } from "./refine-redaction.ts";

const SENTINELS = {
  contract: "КОНТРАКТ_СЕНТИНЕЛ_Иван Петров",
  feedback: "ОБРАТНА_СЕНТИНЕЛ_Мария Георгиева",
  answers: "ОТГОВОРИ_СЕНТИНЕЛ_Георги Иванов",
};

Deno.test("каноничният източник съдържа И трите полета (пазител + класификация)", () => {
  const src = buildRefineSource({
    contractJson: JSON.stringify({ p: SENTINELS.contract }),
    feedback: SENTINELS.feedback,
    answersText: `- name: ${SENTINELS.answers}`,
  });
  for (const s of Object.values(SENTINELS)) assert(src.includes(s), `липсва ${s}`);
});

Deno.test("сентинелите не излизат от редакцията към модела/заземяването", () => {
  const redact = (text: string) => {
    const mapping: Record<string, string> = {};
    let n = 0;
    const redacted = text.replace(/[А-Я][а-я]+ [А-Я][а-я]+/g, (m) => {
      const token = `<NAME_${++n}>`;
      mapping[token] = m;
      return token;
    });
    return { redacted, mapping };
  };
  const r = redactRefinePayload({
    contractJson: JSON.stringify({ p: SENTINELS.contract }),
    feedback: SENTINELS.feedback,
    answersText: `- name: ${SENTINELS.answers}`,
  }, redact);
  const all = `${r.contractJson}${r.feedback}${r.answersText}`;
  assertEquals(all.includes("Иван Петров"), false);
  assertEquals(all.includes("Мария Георгиева"), false);
  assertEquals(all.includes("Георги Иванов"), false);
});

Deno.test("източникът НЕ подава суров текст към модела, лога и заземяването", async () => {
  const src = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  // Промптът ползва САМО редактираните полета.
  assert(src.includes("${redaction.contractJson}"), "договорът трябва да е редактиран");
  assert(src.includes("${feedbackRedacted}"), "обратната връзка трябва да е редактирана");
  assert(src.includes("${redaction.answersText}"), "отговорите трябва да са редактирани");
  // Суровите полета не влизат в промпта.
  assertEquals(src.includes("${contractJsonStr}"), false);
  assertEquals(src.includes("${feedback}\n"), false);
  assertEquals(src.includes("${answersText}"), false);
  // Редакцията НЕ е условна (без null-двойник при route.redactionRequired).
  assertEquals(src.includes("redactionRequired ?"), false);
  // Повторение на течаща операция не стига до модела.
  assert(src.includes("isOperationInProgress(reservation)"));
});
