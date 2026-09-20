/**
 * ЕДНО ЕДИНСТВЕНО повикване към модела на заявка.
 *
 * Пази срещу връщането на скрито второ повикване към шлюза (напр.
 * „анонимизация и запис в споделена библиотека") след потвърждаването на
 * основната заявка, и срещу автоматичен запис в custom_contract_blanks.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SRC = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url).pathname,
);
const GATEWAY = "ai.gateway.lovable.dev/v1/chat/completions";

Deno.test("build-custom-contract прави точно едно изходящо повикване към шлюза", () => {
  const occurrences = SRC.split(GATEWAY).length - 1;
  assertEquals(occurrences, 1, "трябва да има точно едно повикване към ai gateway в изходния код");
});

Deno.test("build-custom-contract не насрочва второ повикване през waitUntil/EdgeRuntime.waitUntil", () => {
  const matches = [...SRC.matchAll(/waitUntil\s*\(([\s\S]{0,600})/g)];
  for (const m of matches) {
    assert(
      !new RegExp(GATEWAY.replace(/\./g, "\\.")).test(m[1]),
      "waitUntil не трябва да насрочва повикване към модела",
    );
  }
});

Deno.test("build-custom-contract не съдържа автоматичен запис в custom_contract_blanks", () => {
  assert(
    !SRC.includes("custom_contract_blanks"),
    "не трябва да съществува автоматичен, извлечен от потребителска заявка запис в custom_contract_blanks",
  );
});

Deno.test("build-custom-contract не връща вътрешни съобщения на грешки към клиента", () => {
  assert(
    !SRC.includes("error: e instanceof Error ? e.message"),
    "клиентската грешка не трябва да включва суровото e.message",
  );
});
